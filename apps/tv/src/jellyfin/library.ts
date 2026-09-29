import type { BaseItemDto, BaseItemKind, ItemFields } from '@jellyfin/sdk/lib/generated-client/models';
import { getGenreApi, getLibraryApi, getShowApi, getUserViewApi } from '@jellyfin/sdk/lib/utils/api';
import type { Api } from '@jellyfin/sdk';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useAuthedSession } from '../state/SessionContext';

// ProviderIds lets cards match downloadarr requests by TMDB id.
const CARD_FIELDS: ItemFields[] = ['PrimaryImageAspectRatio', 'Overview', 'ProviderIds'];
const ROW_LIMIT = 24;

export type LibraryKind = 'movies' | 'tvshows' | 'music';

/** Which library types the user has, so rows only appear for libraries that exist. */
export function useLibraryKinds() {
  const { api, auth } = useAuthedSession();
  return useQuery({
    queryKey: ['views', auth.userId],
    queryFn: async () => {
      const { data } = await getUserViewApi(api).getUserViews({ userId: auth.userId });
      return new Set((data.Items ?? []).map((view) => view.CollectionType).filter(Boolean) as string[]);
    },
  });
}

/** In-progress movies and episodes, most recently watched first (the server's default order). */
export function useContinueWatching() {
  const { api, auth } = useAuthedSession();
  return useQuery({
    queryKey: ['resume', auth.userId],
    queryFn: async () => {
      const { data } = await getLibraryApi(api).getResumeItems({
        userId: auth.userId,
        limit: ROW_LIMIT,
        mediaTypes: ['Video'],
        fields: CARD_FIELDS,
        enableImageTypes: ['Primary', 'Thumb', 'Backdrop'],
      });
      return data.Items ?? [];
    },
  });
}

const LATEST: Record<LibraryKind, { type: BaseItemKind; sortBy: 'DateCreated' | 'DateLastContentAdded' }> = {
  movies: { type: 'Movie', sortBy: 'DateCreated' },
  // A show counts as "added" when it gets new episodes, not when the series was first created.
  tvshows: { type: 'Series', sortBy: 'DateLastContentAdded' },
  music: { type: 'MusicAlbum', sortBy: 'DateCreated' },
};

export function useLatest(kind: LibraryKind, enabled: boolean) {
  const { api, auth } = useAuthedSession();
  return useQuery({
    queryKey: ['latest', kind, auth.userId],
    enabled,
    queryFn: async () => {
      const { type, sortBy } = LATEST[kind];
      const { data } = await getLibraryApi(api).getItems({
        userId: auth.userId,
        recursive: true,
        includeItemTypes: [type],
        sortBy: [sortBy],
        sortOrder: ['Descending'],
        limit: ROW_LIMIT,
        fields: CARD_FIELDS,
      });
      return data.Items ?? [];
    },
  });
}

export function useItem(itemId: string) {
  const { api, auth } = useAuthedSession();
  return useQuery({
    queryKey: ['item', itemId, auth.userId],
    queryFn: async () => (await getLibraryApi(api).getItem({ itemId, userId: auth.userId })).data,
  });
}

/**
 * What pressing Play on an item actually plays: a movie or episode plays
 * itself, a series plays its next-up episode, an album plays its tracks.
 */
export function usePlayQueue(item: BaseItemDto | undefined) {
  const { api, auth } = useAuthedSession();
  return useQuery({
    queryKey: ['queue', item?.Id, auth.userId],
    enabled: !!item?.Id,
    queryFn: async (): Promise<BaseItemDto[]> => {
      if (!item?.Id) return [];
      if (item.Type === 'Series') {
        const shows = getShowApi(api);
        const { data: nextUp } = await shows.getNextUp({ userId: auth.userId, seriesId: item.Id, limit: 1, enableResumable: true });
        if (nextUp.Items?.length) return nextUp.Items;
        const { data: episodes } = await shows.getEpisodes({ seriesId: item.Id, userId: auth.userId, limit: 1 });
        return episodes.Items ?? [];
      }
      if (item.Type === 'MusicAlbum') {
        const { data } = await getLibraryApi(api).getItems({
          userId: auth.userId,
          parentId: item.Id,
          includeItemTypes: ['Audio'],
          sortBy: ['ParentIndexNumber', 'IndexNumber', 'SortName'],
        });
        return data.Items ?? [];
      }
      return [item];
    },
  });
}

/**
 * Movies and series in Jellyfin keyed by `movie:<tmdbId>` / `tv:<tmdbId>`, so
 * discovery results (TMDB ids) can tell whether a title is already playable.
 * One lightweight request: ids and provider ids only.
 */
type LibraryIndex = Record<string, string>;

function libraryIndexQuery(api: Api, userId: string, refetchInterval: number | false) {
  return {
    queryKey: ['libraryIndex', userId],
    staleTime: 60_000,
    refetchInterval,
    // A plain record (not a Map) so structural sharing keeps it stable between refetches.
    queryFn: async (): Promise<LibraryIndex> => {
      const { data } = await getLibraryApi(api).getItems({
        userId,
        recursive: true,
        includeItemTypes: ['Movie', 'Series'],
        fields: ['ProviderIds'],
        enableImages: false,
        enableUserData: false,
      });
      const index: LibraryIndex = {};
      for (const item of data.Items ?? []) {
        const tmdb = item.ProviderIds?.Tmdb;
        if (tmdb && item.Id) index[`${item.Type === 'Series' ? 'tv' : 'movie'}:${tmdb}`] = item.Id;
      }
      return index;
    },
  };
}

export function useLibraryIndex(refetchInterval: number | false = false) {
  const { api, auth } = useAuthedSession();
  return useQuery(libraryIndexQuery(api, auth.userId, refetchInterval));
}

/** The Jellyfin id for one TMDB title, subscribing to just that entry. */
export function useJellyfinId(kind: 'movie' | 'tv', tmdbId: string | number | undefined, refetchInterval: number | false = false) {
  const { api, auth } = useAuthedSession();
  const key = tmdbId == null ? undefined : `${kind}:${tmdbId}`;
  return useQuery({
    ...libraryIndexQuery(api, auth.userId, refetchInterval),
    select: useCallback((index: LibraryIndex) => (key ? index[key] : undefined), [key]),
  }).data;
}

/** Library genres for the Movies/TV tabs when downloadarr isn't connected. */
export function useLibraryGenres(kind: 'movie' | 'tv') {
  const { api, auth } = useAuthedSession();
  return useQuery({
    queryKey: ['libraryGenres', kind, auth.userId],
    queryFn: async () => {
      const { data } = await getGenreApi(api).getGenres({
        userId: auth.userId,
        includeItemTypes: [kind === 'movie' ? 'Movie' : 'Series'],
        sortBy: ['SortName'],
      });
      return (data.Items ?? []).map((g) => g.Name).filter((n): n is string => !!n);
    },
  });
}

export function useLibraryByGenre(kind: 'movie' | 'tv', genre: string) {
  const { api, auth } = useAuthedSession();
  return useQuery({
    queryKey: ['libraryGenre', kind, genre, auth.userId],
    queryFn: async () => {
      const { data } = await getLibraryApi(api).getItems({
        userId: auth.userId,
        recursive: true,
        genres: [genre],
        includeItemTypes: [kind === 'movie' ? 'Movie' : 'Series'],
        sortBy: ['DateCreated'],
        sortOrder: ['Descending'],
        limit: ROW_LIMIT,
        fields: CARD_FIELDS,
      });
      return data.Items ?? [];
    },
  });
}

export function useSeasons(seriesId: string | undefined) {
  const { api, auth } = useAuthedSession();
  return useQuery({
    queryKey: ['seasons', seriesId, auth.userId],
    enabled: !!seriesId,
    queryFn: async () => {
      const { data } = await getShowApi(api).getSeasons({ seriesId: seriesId!, userId: auth.userId });
      return data.Items ?? [];
    },
  });
}

export function useEpisodes(seriesId: string | undefined, seasonId: string | undefined) {
  const { api, auth } = useAuthedSession();
  return useQuery({
    queryKey: ['episodes', seriesId, seasonId, auth.userId],
    enabled: !!seriesId && !!seasonId,
    queryFn: async () => {
      const { data } = await getShowApi(api).getEpisodes({
        seriesId: seriesId!,
        seasonId,
        userId: auth.userId,
        fields: ['Overview', 'PrimaryImageAspectRatio'],
      });
      return data.Items ?? [];
    },
  });
}

/** Library titles matching a search, for the search screen. */
export function useLibrarySearch(kind: 'movie' | 'tv', query: string) {
  const { api, auth } = useAuthedSession();
  const q = query.trim();
  return useQuery({
    queryKey: ['librarySearch', kind, q, auth.userId],
    enabled: q.length >= 2,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await getLibraryApi(api).getItems({
        userId: auth.userId,
        recursive: true,
        searchTerm: q,
        includeItemTypes: [kind === 'movie' ? 'Movie' : 'Series'],
        limit: ROW_LIMIT,
        fields: CARD_FIELDS,
      });
      return data.Items ?? [];
    },
  });
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * The Jellyfin series for a TMDB show. Tries the TMDB id first, then title +
 * year: Jellyfin sometimes matches a show via TVDB only, leaving no TMDB id.
 */
export function useJellyfinSeries(tmdbId: string | undefined, title: string | undefined, year: number | undefined) {
  const { api, auth } = useAuthedSession();
  const index = useLibraryIndex();
  const byTmdb = tmdbId ? index.data?.[`tv:${tmdbId}`] : undefined;
  return useQuery({
    queryKey: ['jellyfinSeries', tmdbId, title, year, byTmdb, auth.userId],
    enabled: !!byTmdb || !!title,
    refetchInterval: 30_000, // a partly delivered show may appear in Jellyfin at any moment
    queryFn: async () => {
      const library = getLibraryApi(api);
      if (byTmdb) return (await library.getItem({ itemId: byTmdb, userId: auth.userId })).data;
      const { data } = await library.getItems({
        userId: auth.userId,
        recursive: true,
        searchTerm: title,
        includeItemTypes: ['Series'],
        fields: ['ProviderIds'],
        limit: 10,
      });
      const matches = (data.Items ?? []).filter((s) => normalize(s.Name ?? '') === normalize(title!));
      return matches.find((s) => !year || !s.ProductionYear || Math.abs(s.ProductionYear - year) <= 1) ?? null;
    },
  });
}
