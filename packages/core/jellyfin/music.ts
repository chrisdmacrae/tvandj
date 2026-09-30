import type { Api } from '@jellyfin/sdk';
import type { BaseItemDto, ItemFields } from '@jellyfin/sdk/lib/generated-client/models';
import { getArtistApi, getInstantMixApi, getLibraryApi, getLyricApi, getPlaylistApi } from '@jellyfin/sdk/lib/utils/api';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useAuthedSession } from '../state/SessionContext';

const TRACK_FIELDS: ItemFields[] = ['MediaSources'];
const CARD_FIELDS: ItemFields[] = ['PrimaryImageAspectRatio'];
const ROW_LIMIT = 24;
const PAGE_SIZE = 60;
const TICKS_PER_SECOND = 10_000_000;

/** An album's tracks, in disc and track order. */
export function useAlbumTracks(albumId: string | undefined) {
  const { api, auth } = useAuthedSession();
  return useQuery({
    queryKey: ['albumTracks', albumId, auth.userId],
    enabled: !!albumId,
    queryFn: async () => {
      const { data } = await getLibraryApi(api).getItems({
        userId: auth.userId,
        parentId: albumId,
        includeItemTypes: ['Audio'],
        sortBy: ['ParentIndexNumber', 'IndexNumber', 'SortName'],
        fields: TRACK_FIELDS,
      });
      return data.Items ?? [];
    },
  });
}

/** A playlist's entries, in playlist order. */
export function usePlaylistItems(playlistId: string | undefined) {
  const { api, auth } = useAuthedSession();
  return useQuery({
    queryKey: ['playlistItems', playlistId, auth.userId],
    enabled: !!playlistId,
    queryFn: async () => {
      const { data } = await getPlaylistApi(api).getPlaylistItems({ playlistId: playlistId!, userId: auth.userId, fields: TRACK_FIELDS });
      return data.Items ?? [];
    },
  });
}

/** An artist's albums, newest first. */
export function useArtistAlbums(artistId: string | undefined) {
  const { api, auth } = useAuthedSession();
  return useQuery({
    queryKey: ['artistAlbums', artistId, auth.userId],
    enabled: !!artistId,
    queryFn: async () => {
      const { data } = await getLibraryApi(api).getItems({
        userId: auth.userId,
        recursive: true,
        includeItemTypes: ['MusicAlbum'],
        albumArtistIds: [artistId!],
        sortBy: ['ProductionYear', 'SortName'],
        sortOrder: ['Descending', 'Ascending'],
        fields: CARD_FIELDS,
      });
      return data.Items ?? [];
    },
  });
}

/** Every song by an artist, album by album. For "Play all". */
export async function fetchArtistSongs(api: Api, userId: string, artistId: string) {
  const { data } = await getLibraryApi(api).getItems({
    userId,
    recursive: true,
    includeItemTypes: ['Audio'],
    artistIds: [artistId],
    sortBy: ['ProductionYear', 'Album', 'ParentIndexNumber', 'IndexNumber'],
    fields: TRACK_FIELDS,
  });
  return data.Items ?? [];
}

/** Jellyfin's Instant Mix: similar songs seeded from a song, album, artist or playlist. */
export async function fetchInstantMix(api: Api, userId: string, itemId: string) {
  const { data } = await getInstantMixApi(api).getInstantMixFromItem({ itemId, userId, limit: 100, fields: TRACK_FIELDS });
  return data.Items ?? [];
}

/** Albums, newest additions first (the Music tab's first row). */
export function useRecentAlbums() {
  const { api, auth } = useAuthedSession();
  return useQuery({
    queryKey: ['recentAlbums', auth.userId],
    queryFn: async () => {
      const { data } = await getLibraryApi(api).getItems({
        userId: auth.userId,
        recursive: true,
        includeItemTypes: ['MusicAlbum'],
        sortBy: ['DateCreated'],
        sortOrder: ['Descending'],
        limit: ROW_LIMIT,
        fields: CARD_FIELDS,
      });
      return data.Items ?? [];
    },
  });
}

/** Albums played most recently. */
export function useRecentlyPlayedAlbums() {
  const { api, auth } = useAuthedSession();
  return useQuery({
    queryKey: ['recentlyPlayedAlbums', auth.userId],
    queryFn: async () => {
      const { data } = await getLibraryApi(api).getItems({
        userId: auth.userId,
        recursive: true,
        includeItemTypes: ['MusicAlbum'],
        sortBy: ['DatePlayed'],
        sortOrder: ['Descending'],
        filters: ['IsPlayed'],
        limit: ROW_LIMIT,
        fields: CARD_FIELDS,
      });
      return data.Items ?? [];
    },
  });
}

/** Music playlists. */
export function useMusicPlaylists() {
  const { api, auth } = useAuthedSession();
  return useQuery({
    queryKey: ['musicPlaylists', auth.userId],
    queryFn: async () => {
      const { data } = await getLibraryApi(api).getItems({
        userId: auth.userId,
        recursive: true,
        includeItemTypes: ['Playlist'],
        mediaTypes: ['Audio'],
        sortBy: ['SortName'],
        fields: CARD_FIELDS,
      });
      return data.Items ?? [];
    },
  });
}

/** Album artists, A–Z, paged (the Music tab's Artists row, and the full grid). */
export function useAlbumArtists(limit = PAGE_SIZE, enabled = true) {
  const { api, auth } = useAuthedSession();
  return useInfiniteQuery({
    queryKey: ['albumArtists', auth.userId, limit],
    enabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data } = await getArtistApi(api).getAlbumArtists({
        userId: auth.userId,
        startIndex: pageParam,
        limit,
        sortBy: ['SortName'],
        fields: CARD_FIELDS,
        enableTotalRecordCount: true,
      });
      return { items: data.Items ?? [], total: data.TotalRecordCount ?? 0, start: pageParam };
    },
    getNextPageParam: (last) => (last.start + last.items.length < last.total ? last.start + last.items.length : undefined),
  });
}

export type LyricLine = { text: string; /** Seconds; undefined for unsynced lyrics. */ start?: number };

/** A song's lyrics (synced when the file has timings), or null when it has none. */
export function useLyrics(item: BaseItemDto | undefined) {
  const { api } = useAuthedSession();
  return useQuery({
    queryKey: ['lyrics', item?.Id],
    enabled: !!item?.Id && item.HasLyrics !== false,
    staleTime: Infinity,
    queryFn: async () => {
      try {
        const { data } = await getLyricApi(api).getLyrics({ itemId: item!.Id! });
        const lines: LyricLine[] = (data.Lyrics ?? []).map((l) => ({
          text: l.Text ?? '',
          start: l.Start != null ? l.Start / TICKS_PER_SECOND : undefined,
        }));
        return lines.length ? { synced: !!data.Metadata?.IsSynced && lines.some((l) => l.start != null), lines } : null;
      } catch {
        return null;
      }
    },
  });
}

/** "3:42" from ticks. */
export function trackLength(ticks?: number | null) {
  if (!ticks) return undefined;
  const seconds = Math.round(ticks / TICKS_PER_SECOND);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
