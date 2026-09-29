import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useJellyfinId, useLibraryIndex } from '../jellyfin/library';
import { useSettings } from '../state/SettingsContext';
import { Downloadarr, type DiscoverDetails, type DiscoverItem, type MediaKind, type TorrentRequest } from './client';
import { showProgress, type TvProgress } from './tvStatus';

const ACTIVE = new Set(['PENDING', 'SEARCHING', 'FOUND', 'DOWNLOADING']);

/** null when the optional integration isn't configured. */
export function useDownloadarr(): Downloadarr | null {
  const { settings } = useSettings();
  return useMemo(() => (settings.downloadarrUrl ? new Downloadarr(settings.downloadarrUrl) : null), [settings.downloadarrUrl]);
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

export const requestKey = (kind: MediaKind, tmdbId: number | string) => `${kind}:${tmdbId}`;

/**
 * Every downloadarr request indexed by kind + TMDB id (the API has no lookup
 * by id). Polls quickly while anything is in flight, slowly otherwise.
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
        if (r.tmdbId == null || r.contentType === 'GAME') continue;
        const key = requestKey(r.contentType === 'MOVIE' ? 'movie' : 'tv', r.tmdbId);
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
  const key = tmdbId == null ? undefined : requestKey(kind, tmdbId);
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

  switch (request.status) {
    case 'COMPLETED':
      return { state: 'indexing' };
    case 'DOWNLOADING':
      return {
        state: 'downloading',
        progress: progress.data ? progress.data.progress / 100 : null,
        eta: progress.data?.eta && progress.data.eta !== '∞' ? progress.data.eta : undefined,
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

export function useRequestMedia(kind: MediaKind) {
  const client = useDownloadarr();
  const { settings } = useSettings();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (details: DiscoverDetails) => client!.request(details, kind, settings.request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['da', client?.baseUrl, 'requests'] }),
  });
}

const IN_FLIGHT = new Set(['PENDING', 'SEARCHING', 'FOUND', 'DOWNLOADING', 'COMPLETED', 'FAILED', 'EXPIRED']);

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
