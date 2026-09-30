import type { BaseItemDto, BaseItemKind, ItemFields, ItemSortBy, SortOrder } from '@jellyfin/sdk/lib/generated-client/models';
import { getLibraryApi, getUserDataApi } from '@jellyfin/sdk/lib/utils/api';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthedSession } from '../state/SessionContext';

const GRID_FIELDS: ItemFields[] = ['PrimaryImageAspectRatio', 'ProviderIds'];
const PAGE_SIZE = 60;

/** `release` (oldest first) suits collections, where the films follow on from each other. */
export type GridSort = 'name' | 'added' | 'rating' | 'year' | 'release';

export const GRID_SORTS: { value: GridSort; label: string }[] = [
  { value: 'added', label: 'Recently added' },
  { value: 'name', label: 'A–Z' },
  { value: 'rating', label: 'Rating' },
  { value: 'year', label: 'Year' },
];

const SORTS: Record<GridSort, { sortBy: ItemSortBy[]; sortOrder: SortOrder[] }> = {
  name: { sortBy: ['SortName'], sortOrder: ['Ascending'] },
  added: { sortBy: ['DateCreated', 'SortName'], sortOrder: ['Descending', 'Ascending'] },
  rating: { sortBy: ['CommunityRating', 'SortName'], sortOrder: ['Descending', 'Ascending'] },
  year: { sortBy: ['ProductionYear', 'PremiereDate', 'SortName'], sortOrder: ['Descending', 'Descending', 'Ascending'] },
  release: { sortBy: ['PremiereDate', 'ProductionYear', 'SortName'], sortOrder: ['Ascending', 'Ascending', 'Ascending'] },
};

export type GridQuery = {
  types: BaseItemKind[];
  sort?: GridSort;
  unwatched?: boolean;
  uhd?: boolean;
  genre?: string;
  favorites?: boolean;
  /** A collection (box set) or other folder. */
  parentId?: string;
  personId?: string;
};

/** Paged library items for the full-library grids. */
export function useItemGrid(query: GridQuery) {
  const { api, auth } = useAuthedSession();
  const { sortBy, sortOrder } = SORTS[query.sort ?? 'added'];
  return useInfiniteQuery({
    queryKey: ['grid', auth.userId, query],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data } = await getLibraryApi(api).getItems({
        userId: auth.userId,
        recursive: true,
        includeItemTypes: query.types,
        sortBy,
        sortOrder,
        isPlayed: query.unwatched ? false : undefined,
        is4K: query.uhd || undefined,
        genres: query.genre ? [query.genre] : undefined,
        isFavorite: query.favorites || undefined,
        parentId: query.parentId,
        personIds: query.personId ? [query.personId] : undefined,
        startIndex: pageParam,
        limit: PAGE_SIZE,
        fields: GRID_FIELDS,
        enableTotalRecordCount: true,
      });
      return { items: data.Items ?? [], total: data.TotalRecordCount ?? 0, start: pageParam };
    },
    getNextPageParam: (last) => (last.start + last.items.length < last.total ? last.start + last.items.length : undefined),
  });
}

/** Movies and shows in My List (Jellyfin favourites, so it's shared with other Jellyfin apps). */
export function useMyList(limit = 24) {
  const { api, auth } = useAuthedSession();
  return useQuery({
    queryKey: ['myList', auth.userId, limit],
    queryFn: async () => {
      const { data } = await getLibraryApi(api).getItems({
        userId: auth.userId,
        recursive: true,
        includeItemTypes: ['Movie', 'Series'],
        isFavorite: true,
        sortBy: ['DateLastContentAdded', 'SortName'],
        sortOrder: ['Descending', 'Ascending'],
        limit,
        fields: GRID_FIELDS,
      });
      return data.Items ?? [];
    },
  });
}

/** Whether the library has any collections (box sets), so the Collections link only shows when there are some. */
export function useHasCollections() {
  const { api, auth } = useAuthedSession();
  return useQuery({
    queryKey: ['hasCollections', auth.userId],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await getLibraryApi(api).getItems({
        userId: auth.userId,
        recursive: true,
        includeItemTypes: ['BoxSet'],
        limit: 1,
        enableTotalRecordCount: true,
      });
      return (data.TotalRecordCount ?? data.Items?.length ?? 0) > 0;
    },
  }).data ?? false;
}

/** "More like this": Jellyfin's similar items, same kind as the title. */
export function useSimilar(item: BaseItemDto | undefined) {
  const { api, auth } = useAuthedSession();
  const enabled = !!item?.Id && (item.Type === 'Movie' || item.Type === 'Series');
  return useQuery({
    queryKey: ['similar', item?.Id, auth.userId],
    enabled,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await getLibraryApi(api).getSimilarItems({ itemId: item!.Id!, userId: auth.userId, limit: 16, fields: GRID_FIELDS });
      return (data.Items ?? []).filter((i) => i.Type === item!.Type);
    },
  });
}

/** A person (actor, director…) as Jellyfin knows them: name, photo, biography. */
export function usePerson(personId: string) {
  const { api, auth } = useAuthedSession();
  return useQuery({
    queryKey: ['person', personId, auth.userId],
    queryFn: async () => (await getLibraryApi(api).getItem({ itemId: personId, userId: auth.userId })).data,
  });
}

/** Everything that shows a title's watched or favourite state. */
const USER_DATA_QUERIES = ['item', 'queue', 'resume', 'myList', 'grid', 'latest', 'libraryGenre', 'episodes', 'seasons', 'similar'];

function useUserDataMutation(run: (itemId: string, on: boolean) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, on }: { itemId: string; on: boolean }) => run(itemId, on),
    onSettled: () => {
      for (const key of USER_DATA_QUERIES) queryClient.invalidateQueries({ queryKey: [key] });
    },
  });
}

/** Add to / remove from My List. */
export function useToggleFavorite() {
  const { api, auth } = useAuthedSession();
  return useUserDataMutation((itemId, on) => {
    const userData = getUserDataApi(api);
    return on ? userData.markFavoriteItem({ itemId, userId: auth.userId }) : userData.unmarkFavoriteItem({ itemId, userId: auth.userId });
  });
}

/** Mark watched / unwatched. On a show or season, Jellyfin applies it to every episode inside. */
export function useTogglePlayed() {
  const { api, auth } = useAuthedSession();
  return useUserDataMutation((itemId, on) => {
    const userData = getUserDataApi(api);
    return on ? userData.markPlayedItem({ itemId, userId: auth.userId }) : userData.markUnplayedItem({ itemId, userId: auth.userId });
  });
}
