import type { BaseItemDto, BaseItemKind, ItemFields } from '@jellyfin/sdk/lib/generated-client/models';
import { getLibraryApi, getShowApi, getUserViewApi } from '@jellyfin/sdk/lib/utils/api';
import { useQuery } from '@tanstack/react-query';
import { useAuthedSession } from '../state/SessionContext';

const CARD_FIELDS: ItemFields[] = ['PrimaryImageAspectRatio', 'Overview'];
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
