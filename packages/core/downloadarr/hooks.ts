import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useJellyfinId, useLibraryIndex } from '../jellyfin/library';
import { useAuthedSession } from '../state/SessionContext';
import { albumKey, useAlbumIndex, useJellyfinAlbumId } from '../jellyfin/music';
import { isRestricted, useCurrentUser } from '../jellyfin/users';
import { useSettings } from '../state/SettingsContext';
import {
  Downloadarr,
  type AlbumRef,
  type ArtistRadio,
  type DiscoverDetails,
  type DiscoverItem,
  type DownloadStatus,
  type MediaKind,
  type MusicDiscover,
  type MusicSearchAlbum,
  type TorrentRequest,
} from './client';
import { showProgress, type TvProgress } from './tvStatus';

const ACTIVE = new Set(['PENDING', 'SEARCHING', 'FOUND', 'DOWNLOADING']);

/** null when the optional integration isn't configured. */
/**
 * The downloadarr client, or null when it isn't set up, or when the profile
 * watching has content limits. Jellyfin filters its own library by a
 * profile's rating limit, but downloadarr's discovery (all of TMDB) has no
 * ratings to filter by, so restricted profiles don't get discovery or
 * requests at all. Null until the profile's limits are known, so nothing
 * flashes up first.
 */
export function useDownloadarr(): Downloadarr | null {
  const { settings } = useSettings();
  const user = useCurrentUser();
  const allowed = !!user.data && !isRestricted(user.data.Policy);
  return useMemo(
    () => (settings.downloadarrUrl && allowed ? new Downloadarr(settings.downloadarrUrl) : null),
    [settings.downloadarrUrl, allowed],
  );
}

export function useDiscoverGenres(kind: MediaKind) {
  const client = useDownloadarr();
  return useQuery({
    queryKey: ['da', client?.baseUrl, 'genres', kind],
    enabled: !!client,
    staleTime: 24 * 60 * 60 * 1000,
    queryFn: () => client!.genres(kind),
  });
}

export function useDiscoverGenre(kind: MediaKind, genreId: number) {
  const client = useDownloadarr();
  return useQuery({
    queryKey: ['da', client?.baseUrl, 'genre', kind, genreId],
    enabled: !!client,
    staleTime: 30 * 60 * 1000,
    queryFn: () => client!.byGenre(kind, genreId),
  });
}

export function usePopular(kind: MediaKind) {
  const client = useDownloadarr();
  return useQuery({
    queryKey: ['da', client?.baseUrl, 'popular', kind],
    enabled: !!client,
    staleTime: 30 * 60 * 1000,
    queryFn: () => client!.popular(kind),
  });
}

export function useDiscoverDetails(kind: MediaKind, tmdbId: string) {
  const client = useDownloadarr();
  return useQuery({
    queryKey: ['da', client?.baseUrl, 'details', kind, tmdbId],
    enabled: !!client,
    staleTime: 60 * 60 * 1000,
    queryFn: () => client!.details(kind, tmdbId),
  });
}

/** An actor or director and their movies and shows, from TMDB via downloadarr. */
export function usePersonDetails(tmdbId: string) {
  const client = useDownloadarr();
  return useQuery({
    queryKey: ['da', client?.baseUrl, 'person', tmdbId],
    enabled: !!client,
    staleTime: 60 * 60 * 1000,
    queryFn: () => client!.person(tmdbId),
  });
}

export const requestKey = (kind: MediaKind, tmdbId: number | string) => `${kind}:${tmdbId}`;

/**
 * Every downloadarr request indexed by kind + TMDB id, and albums by albumKey
 * (the API has no lookup by id). Polls quickly while anything is in flight,
 * slowly otherwise.
 */
type RequestIndex = Record<string, TorrentRequest>;

// A plain record, not a Map: React Query's structural sharing only works on plain
// objects, and it's what keeps unchanged requests referentially equal between polls.
function requestIndexQuery(client: Downloadarr | null) {
  return {
    queryKey: ['da', client?.baseUrl, 'requests'],
    enabled: !!client,
    queryFn: async (): Promise<RequestIndex> => {
      const index: RequestIndex = {};
      for (const r of await client!.requests()) {
        let key: string;
        if (r.contentType === 'MUSIC' && r.artist) key = albumKey(r.artist, r.title);
        else if (r.tmdbId != null && (r.contentType === 'MOVIE' || r.contentType === 'TV_SHOW')) {
          key = requestKey(r.contentType === 'MOVIE' ? 'movie' : 'tv', r.tmdbId);
        } else continue;
        const existing = index[key];
        // Several requests can exist for one title (e.g. a re-request); the newest wins.
        if (!existing || existing.updatedAt < r.updatedAt) index[key] = r;
      }
      return index;
    },
    refetchInterval: (query: { state: { data?: RequestIndex } }) =>
      Object.values(query.state.data ?? {}).some((r) => ACTIVE.has(r.status)) ? 10_000 : 60_000,
  };
}

export function useRequestIndex() {
  return useQuery(requestIndexQuery(useDownloadarr()));
}

/**
 * One title's request. Subscribes to just that entry, so a card re-renders when
 * its own request changes, not every time the list is polled.
 */
export function useRequestFor(kind: MediaKind, tmdbId: string | number | undefined) {
  return useRequestByKey(tmdbId == null ? undefined : requestKey(kind, tmdbId));
}

/** An album's request, matched on artist and title. */
export function useAlbumRequest(album: AlbumRef | undefined) {
  return useRequestByKey(album ? albumKey(album.artistName, album.albumTitle) : undefined);
}

function useRequestByKey(key: string | undefined) {
  return useQuery({
    ...requestIndexQuery(useDownloadarr()),
    select: useCallback((index: RequestIndex) => (key ? index[key] : undefined), [key]),
  }).data;
}

export function useDownloadProgress(request: TorrentRequest | undefined) {
  const client = useDownloadarr();
  return useQuery({
    queryKey: ['da', client?.baseUrl, 'progress', request?.id],
    enabled: !!client && request?.status === 'DOWNLOADING',
    refetchInterval: 5_000,
    queryFn: () => client!.downloadStatus(request!.id),
  });
}

export type MediaStatus =
  | { state: 'available'; jellyfinId: string }
  | { state: 'indexing' } // downloaded, waiting for Jellyfin to pick it up
  | { state: 'downloading'; progress: number | null; eta?: string; label?: string }
  | { state: 'requested'; label: string }
  | { state: 'failed' }
  | { state: 'none' };

const REQUESTED_LABEL: Record<string, string> = {
  PENDING: 'Requested',
  SEARCHING: 'Searching…',
  FOUND: 'Starting download…',
  // Nothing to retry from here: the files are down, and downloadarr holds the request until they're moved.
  ORGANIZE_FAILED: 'Downloaded, not in the library yet',
};

function fromTv(show: TvProgress): MediaStatus {
  switch (show.state) {
    case 'downloading':
    case 'partial':
      return { state: 'downloading', progress: show.progress ?? null, label: show.label };
    case 'failed':
      return { state: 'failed' };
    default:
      return { state: 'requested', label: show.label };
  }
}

/**
 * Where a title stands across Jellyfin and downloadarr. Jellyfin wins: if it's
 * in the library it's playable, whatever downloadarr says.
 */
export function useMediaStatus(kind: MediaKind, tmdbId: string | number | undefined): MediaStatus {
  const request = useRequestFor(kind, tmdbId);
  // Downloaded but not yet in Jellyfin: poll the library until it appears.
  const jellyfinId = useJellyfinId(kind, tmdbId, request?.status === 'COMPLETED' ? 15_000 : false);
  const progress = useDownloadProgress(request);
  const seasons = useRequestSeasons(kind === 'tv' && tmdbId != null ? String(tmdbId) : undefined).data;

  if (tmdbId == null) return { state: 'none' };
  if (jellyfinId) return { state: 'available', jellyfinId };
  if (!request) return { state: 'none' };

  const show = kind === 'tv' ? showProgress(seasons ?? []) : null;
  if (show) return show.state === 'complete' ? { state: 'indexing' } : fromTv(show);
  return requestState(request, progress.data);
}

/** Where a request stands on its own: a movie's or an album's. */
function requestState(request: TorrentRequest, progress: DownloadStatus | undefined): MediaStatus {
  switch (request.status) {
    case 'COMPLETED':
      return { state: 'indexing' };
    case 'DOWNLOADING':
      return {
        state: 'downloading',
        progress: progress ? progress.progress / 100 : null,
        eta: progress?.eta && progress.eta !== '∞' ? progress.eta : undefined,
      };
    case 'FAILED':
    case 'EXPIRED':
      return { state: 'failed' };
    case 'CANCELLED':
      return { state: 'none' };
    default:
      return { state: 'requested', label: REQUESTED_LABEL[request.status] ?? 'Requested' };
  }
}

/**
 * In-flight downloadarr activity for something that may already be in Jellyfin,
 * e.g. an ongoing show whose next season is downloading. Ignores the library.
 */
export function useActiveDownload(kind: MediaKind, tmdbId: string | undefined): MediaStatus {
  const request = useRequestFor(kind, tmdbId);
  const progress = useDownloadProgress(request);
  const seasons = useRequestSeasons(kind === 'tv' ? tmdbId : undefined).data;
  if (!request) return { state: 'none' };
  const show = kind === 'tv' ? showProgress(seasons ?? []) : null;
  if (show) return show.state === 'complete' ? { state: 'none' } : fromTv(show);
  if (request.status === 'DOWNLOADING') {
    return { state: 'downloading', progress: progress.data ? progress.data.progress / 100 : null };
  }
  if (REQUESTED_LABEL[request.status]) return { state: 'requested', label: REQUESTED_LABEL[request.status] };
  return { state: 'none' };
}

/** downloadarr's per-season/episode status for a show's request; empty when there's no request. */
export function useRequestSeasons(tmdbId: string | undefined) {
  const client = useDownloadarr();
  const request = useRequestFor('tv', tmdbId);
  return useQuery({
    queryKey: ['da', client?.baseUrl, 'seasons', request?.id],
    enabled: !!client && !!request,
    queryFn: () => client!.seasons(request!.id),
    refetchInterval: (query) => (query.state.data?.some((s) => s.status !== 'COMPLETED') ? 10_000 : 60_000),
  });
}

export function useRetryRequest() {
  const client = useDownloadarr();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => client!.retry(requestId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['da', client?.baseUrl, 'requests'] }),
  });
}

/**
 * Take back a request: downloadarr stops searching, cancels any download in
 * flight and forgets it. Dropped from the index straight away, so the title
 * goes back to "Request" without waiting for the next poll.
 */
export function useRemoveRequest() {
  const client = useDownloadarr();
  const queryClient = useQueryClient();
  const key = ['da', client?.baseUrl, 'requests'];
  return useMutation({
    mutationFn: (requestId: string) => client!.remove(requestId),
    onSuccess: (_, requestId) => {
      queryClient.setQueryData<RequestIndex>(key, (index) =>
        index && Object.fromEntries(Object.entries(index).filter(([, r]) => r.id !== requestId)),
      );
      return queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useRequestMedia(kind: MediaKind) {
  const client = useDownloadarr();
  const { settings } = useSettings();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (details: DiscoverDetails) => client!.request(details, kind, settings.request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['da', client?.baseUrl, 'requests'] }),
  });
}

const IN_FLIGHT = new Set(['PENDING', 'SEARCHING', 'FOUND', 'DOWNLOADING', 'COMPLETED', 'FAILED', 'EXPIRED', 'ORGANIZE_FAILED']);

/**
 * Titles you've asked downloadarr for that aren't simply watchable yet:
 * requested, searching, downloading, waiting for Jellyfin, or failed. Newest
 * activity first. Something already in Jellyfin only counts while more of it
 * is still coming (e.g. an ongoing show's next season); a show's own request
 * status can't tell us that, so its seasons are checked.
 */
export function useRequestedItems(kind?: MediaKind): { item: DiscoverItem; kind: MediaKind }[] {
  const client = useDownloadarr();
  const requests = useRequestIndex();
  const library = useLibraryIndex();

  const candidates = useMemo(() => {
    const list: { request: TorrentRequest; kind: MediaKind; inLibrary: boolean }[] = [];
    for (const request of Object.values(requests.data ?? {})) {
      if (request.contentType === 'MUSIC') continue;
      const k: MediaKind = request.contentType === 'MOVIE' ? 'movie' : 'tv';
      if ((kind && k !== kind) || !IN_FLIGHT.has(request.status) || request.tmdbId == null) continue;
      const inLibrary = !!library.data?.[requestKey(k, request.tmdbId)];
      // A movie in Jellyfin is done, whatever downloadarr last said.
      if (k === 'movie' && inLibrary) continue;
      list.push({ request, kind: k, inLibrary });
    }
    return list.sort((a, b) => b.request.updatedAt.localeCompare(a.request.updatedAt));
  }, [requests.data, library.data, kind]);

  // Shows: whether anything is still unfinished comes from their seasons.
  const shows = candidates.filter((c) => c.kind === 'tv');
  const seasons = useQueries({
    queries: shows.map((c) => ({
      queryKey: ['da', client?.baseUrl, 'seasons', c.request.id],
      enabled: !!client,
      queryFn: () => client!.seasons(c.request.id),
      refetchInterval: 10_000,
    })),
  });

  return candidates
    .filter((c) => {
      if (c.kind === 'movie') return true;
      const data = seasons[shows.indexOf(c)]?.data;
      const show = data ? showProgress(data) : null;
      // No season data (yet): fall back to "in the library means done".
      if (!show) return !c.inLibrary;
      return show.state !== 'complete' || !c.inLibrary;
    })
    .map(({ request, kind: k }) => ({
      kind: k,
      item: {
        id: String(request.tmdbId),
        title: request.title,
        year: request.year,
        poster: request.posterUrl,
        backdrop: request.backdropUrl,
        type: k,
      },
    }));
}

export function useDiscoverSearch(kind: MediaKind, query: string) {
  const client = useDownloadarr();
  const q = query.trim();
  return useQuery({
    queryKey: ['da', client?.baseUrl, 'search', kind, q],
    enabled: !!client && q.length >= 2,
    staleTime: 5 * 60 * 1000,
    queryFn: () => client!.search(kind, q),
  });
}

const NEW_FOR_YOU_LIMIT = 20;

/**
 * "New for you": popular movies and shows from downloadarr that aren't in the
 * library yet, interleaved so neither kind dominates. Empty without downloadarr.
 */
export function useNewForYou(limit = NEW_FOR_YOU_LIMIT) {
  const client = useDownloadarr();
  const movies = usePopular('movie');
  const shows = usePopular('tv');
  const library = useLibraryIndex();
  return useMemo(() => {
    if (!client) return [];
    const notOwned = (kind: MediaKind) => (item: DiscoverItem) => !library.data?.[requestKey(kind, item.id)];
    const m = (movies.data ?? []).filter(notOwned('movie'));
    const s = (shows.data ?? []).filter(notOwned('tv'));
    const mixed: { item: DiscoverItem; kind: MediaKind }[] = [];
    for (let i = 0; i < Math.max(m.length, s.length) && mixed.length < limit; i++) {
      if (m[i]) mixed.push({ item: m[i], kind: 'movie' });
      if (s[i]) mixed.push({ item: s[i], kind: 'tv' });
    }
    return mixed;
  }, [client, movies.data, shows.data, library.data, limit]);
}

// ---- music ---------------------------------------------------------------------

/** downloadarr's album recommendations. An older downloadarr without music answers 404: no rows, no retries. */
export function useMusicDiscover() {
  return useQuery(musicDiscoverQuery(useDownloadarr()));
}

function musicDiscoverQuery(client: Downloadarr | null) {
  return {
    queryKey: ['da', client?.baseUrl, 'music', 'discover'],
    enabled: !!client,
    staleTime: 30 * 60 * 1000,
    retry: false,
    queryFn: () => client!.musicDiscover(),
  };
}

/**
 * Albums to request, by title or artist, leaving out what's already in
 * Jellyfin. An older downloadarr without music search answers 404: no results, no retries.
 */
export function useMusicSearch(query: string) {
  const client = useDownloadarr();
  const library = useAlbumIndex();
  const q = query.trim();
  const search = useQuery({
    queryKey: ['da', client?.baseUrl, 'music', 'search', q],
    enabled: !!client && q.length >= 2,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: () => client!.searchMusic(q),
  });
  const albums = useMemo(
    () => (search.data ?? []).filter((a) => !library.data?.[albumKey(a.artistName, a.albumTitle)]),
    [search.data, library.data],
  );
  return { albums, isFetching: search.isFetching };
}

/**
 * An album from a recent music search, for its cover and release date: the
 * album page only gets artist and title. Undefined when no search has it.
 */
export function useSearchedAlbum(artist: string | undefined, album: string | undefined): MusicSearchAlbum | undefined {
  const client = useDownloadarr();
  const queryClient = useQueryClient();
  if (!artist || !album) return undefined;
  const key = albumKey(artist, album);
  for (const [, results] of queryClient.getQueriesData<MusicSearchAlbum[]>({ queryKey: ['da', client?.baseUrl, 'music', 'search'] })) {
    const found = results?.find((a) => albumKey(a.artistName, a.albumTitle) === key);
    if (found) return found;
  }
  return undefined;
}

/**
 * An album's tracklist from Deezer, with 30-second preview clips, or null when
 * Deezer doesn't have it. The clip addresses are signed and expire after about
 * 15 minutes, so this goes stale well before that.
 */
export function useAlbumPreview(album: AlbumRef | undefined) {
  const client = useDownloadarr();
  return useQuery({
    queryKey: ['da', client?.baseUrl, 'music', 'preview', album?.artistName, album?.albumTitle],
    enabled: !!client && !!album,
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: () => client!.albumPreview(album!.artistName, album!.albumTitle).catch(() => null),
  });
}

/** Where an album stands across Jellyfin and downloadarr. Jellyfin wins, as with movies. */
export function useAlbumStatus(album: AlbumRef | undefined): MediaStatus {
  const request = useAlbumRequest(album);
  // Downloaded but not yet in Jellyfin: poll the library until it appears.
  const jellyfinId = useJellyfinAlbumId(album, request?.status === 'COMPLETED' ? 15_000 : false);
  const progress = useDownloadProgress(request);
  if (!album) return { state: 'none' };
  if (jellyfinId) return { state: 'available', jellyfinId };
  if (!request) return { state: 'none' };
  return requestState(request, progress.data);
}

export function useRequestAlbum() {
  const client = useDownloadarr();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (album: AlbumRef) => client!.requestAlbum(album),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['da', client?.baseUrl, 'requests'] }),
  });
}

/**
 * "Not interested": downloadarr stops recommending the album, or with
 * `artist: true` anything by its artist. Gone from the rows straight away.
 */
export function useDismissMusic() {
  const client = useDownloadarr();
  const queryClient = useQueryClient();
  const key = ['da', client?.baseUrl, 'music', 'discover'];
  return useMutation({
    mutationFn: ({ album, artist }: { album: AlbumRef; artist?: boolean }) =>
      client!.dismissMusic(album.artistName, artist ? undefined : album.albumTitle),
    onSuccess: (_, { album, artist }) => {
      const hidden = (r: AlbumRef) =>
        artist
          ? albumKey(r.artistName, '') === albumKey(album.artistName, '')
          : albumKey(r.artistName, r.albumTitle) === albumKey(album.artistName, album.albumTitle);
      queryClient.setQueryData<MusicDiscover>(key, (data) =>
        data && {
          ...data,
          lists: Object.fromEntries(Object.entries(data.lists).map(([list, albums]) => [list, albums?.filter((r) => !hidden(r))])),
        },
      );
      return queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

/** Albums you've asked downloadarr for that aren't in Jellyfin yet (or failed). Newest activity first. */
export function useRequestedAlbums(): AlbumRef[] {
  const requests = useRequestIndex();
  const library = useAlbumIndex();
  return useMemo(
    () =>
      Object.values(requests.data ?? {})
        .filter((r) => r.contentType === 'MUSIC' && r.artist && IN_FLIGHT.has(r.status))
        .filter((r) => !library.data?.[albumKey(r.artist!, r.title)] && !(r.musicbrainzId && library.data?.[`mbrg:${r.musicbrainzId}`]))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((r) => ({
          artistName: r.artist!,
          albumTitle: r.title,
          releaseGroupMbid: r.musicbrainzId,
          releaseDate: r.year ? String(r.year) : null,
          coverUrl: r.posterUrl,
        })),
    [requests.data, library.data],
  );
}

/** The recommendation for an album, if it's in any list, for its reasons and cover. */
export function useRecommendation(artist: string | undefined, album: string | undefined) {
  const key = artist && album ? albumKey(artist, album) : undefined;
  return useQuery({
    ...musicDiscoverQuery(useDownloadarr()),
    select: useCallback(
      (data: MusicDiscover) =>
        key ? Object.values(data.lists).flat().find((r) => r && albumKey(r.artistName, r.albumTitle) === key) : undefined,
      [key],
    ),
  }).data;
}

/**
 * An artist radio station. The clips expire, so a station is only reused for
 * a few minutes; tuning in again builds a fresh one. Undefined artist: no station.
 */
export function useArtistRadio(artist: string | undefined) {
  const client = useDownloadarr();
  return useQuery<ArtistRadio>({
    queryKey: ['da', client?.baseUrl, 'music', 'radio', artist],
    enabled: !!client && !!artist,
    staleTime: 10 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
    queryFn: () => client!.artistRadio(artist!),
  });
}

const SIMILAR_LIMIT = 20;

/**
 * "Albums like this", by other artists, from two sources taken in turn:
 * downloadarr's similar-albums lookup (related artists' albums closest in
 * genre and era to this one) and the albums on the artist's radio station
 * (Deezer's, and ListenBrainz's, mix of music like theirs). Either can be
 * missing: an older downloadarr has no lookup (404, no retries), and a station
 * takes a few seconds to build. Empty without downloadarr.
 */
export function useSimilarAlbums(album: { artistName: string; albumTitle: string } | undefined): AlbumRef[] {
  const client = useDownloadarr();
  const artist = album?.artistName;
  const similar = useQuery({
    queryKey: ['da', client?.baseUrl, 'music', 'similar', artist, album?.albumTitle],
    enabled: !!client && !!album,
    staleTime: 60 * 60 * 1000,
    retry: false,
    queryFn: () => client!.similarAlbums(album!.artistName, album!.albumTitle),
  }).data;
  const radio = useArtistRadio(artist).data;
  return useMemo(() => {
    if (!artist) return [];
    const own = albumKey(artist, '');
    const seen = new Set<string>();
    const albums: AlbumRef[] = [];
    const add = (a: { artistName: string; albumTitle: string; coverUrl?: string; releaseDate?: string }) => {
      const key = albumKey(a.artistName, a.albumTitle);
      if (albumKey(a.artistName, '') === own || seen.has(key)) return;
      seen.add(key);
      albums.push({ artistName: a.artistName, albumTitle: a.albumTitle, coverUrl: a.coverUrl, releaseDate: a.releaseDate });
    };
    const lookup = similar ?? [];
    const station = radio?.albums ?? [];
    for (let i = 0; i < Math.max(lookup.length, station.length); i++) {
      if (lookup[i]) add(lookup[i]);
      if (station[i]) add(station[i]);
    }
    return albums.slice(0, SIMILAR_LIMIT);
  }, [artist, similar, radio]);
}

// ---- personal recommendations (Trakt) --------------------------------------------

/**
 * The downloadarr recommendation profile for whoever's signed in: the one named like
 * their Jellyfin user. Null when none matches (or downloadarr has no profiles), and
 * then recommendations are everyone's, merged.
 */
export function useRecommendationProfile() {
  const client = useDownloadarr();
  const { auth } = useAuthedSession();
  const profiles = useQuery({
    queryKey: ['da', client?.baseUrl, 'recommendation-profiles'],
    enabled: !!client,
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: () => client!.recommendationProfiles(),
  });
  const name = auth.userName.trim().toLowerCase();
  return {
    profile: profiles.data?.find((p) => p.name.trim().toLowerCase() === name) ?? null,
    ready: !profiles.isPending,
  };
}

/**
 * Movies or shows recommended by Trakt, and the watchlist, for whoever's signed in.
 * Empty without Trakt connected in downloadarr, or with a downloadarr too old to have them.
 */
export function useVideoRails(kind: MediaKind) {
  const client = useDownloadarr();
  const { profile, ready } = useRecommendationProfile();
  const rails = useQuery({
    queryKey: ['da', client?.baseUrl, 'video-rails', kind, profile?.id ?? 'everyone'],
    enabled: !!client && ready,
    staleTime: 30 * 60 * 1000,
    retry: false,
    queryFn: () => client!.videoRails(kind, profile?.id),
  });
  return { recommended: rails.data?.recommended ?? [], watchlist: rails.data?.watchlist ?? [], profile };
}
