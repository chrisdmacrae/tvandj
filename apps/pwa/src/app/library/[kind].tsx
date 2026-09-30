import type { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Dropdown, SelectChip, spacing } from '@tv-and-j/design-system';
import { GRID_SORTS, useItemGrid, type GridSort } from '@tv-and-j/core/jellyfin/browse';
import { useLibraryGenres } from '@tv-and-j/core/jellyfin/library';
import { ItemGrid } from '../../components/ItemGrid';
import { Page } from '../../components/Page';

type Kind = 'movies' | 'tv' | 'collections' | 'mylist';

const KINDS: Record<Kind, { title: string; types: BaseItemKind[]; sort: GridSort; filters: boolean; empty: string }> = {
  movies: { title: 'Downloaded movies', types: ['Movie'], sort: 'added', filters: true, empty: 'No movies match.' },
  tv: { title: 'Downloaded shows', types: ['Series'], sort: 'added', filters: true, empty: 'No shows match.' },
  collections: { title: 'Collections', types: ['BoxSet'], sort: 'name', filters: false, empty: 'No collections yet.' },
  mylist: { title: 'My List', types: ['Movie', 'Series'], sort: 'added', filters: false, empty: 'Nothing in My List yet. Add movies and shows from their pages.' },
};

/** A whole library as a grid, with sorting and filters (the TV's "Downloaded movies" and friends). */
export default function LibraryGrid() {
  const { kind: param } = useLocalSearchParams<{ kind: string }>();
  const kind: Kind = param in KINDS ? (param as Kind) : 'movies';
  const config = KINDS[kind];
  const [sort, setSort] = useState<GridSort>(config.sort);
  const [unwatched, setUnwatched] = useState(false);
  const [uhd, setUhd] = useState(false);
  const [genre, setGenre] = useState('');
  const genres = useLibraryGenres(kind === 'tv' ? 'tv' : 'movie').data ?? [];
  const grid = useItemGrid({
    types: config.types,
    sort,
    unwatched: config.filters && unwatched,
    uhd: config.filters && uhd,
    genre: config.filters ? genre || undefined : undefined,
    favorites: kind === 'mylist',
  });
  const items = grid.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Page back title={config.title} scroll={false} glow>
      <ItemGrid
        items={items}
        loading={grid.isPending}
        onEndReached={() => grid.hasNextPage && !grid.isFetchingNextPage && grid.fetchNextPage()}
        empty={config.empty}
        header={
          kind === 'collections' ? null : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.lg }}>
              <Dropdown label="Sort" value={sort} options={GRID_SORTS} onChange={setSort} />
              {config.filters ? (
                <>
                  {genres.length ? (
                    <Dropdown label="Genre" value={genre} options={[{ value: '', label: 'All genres' }, ...genres.map((g) => ({ value: g, label: g }))]} onChange={setGenre} />
                  ) : null}
                  <SelectChip label="Unwatched" selected={unwatched} onPress={() => setUnwatched((v) => !v)} />
                  <SelectChip label="4K" selected={uhd} onPress={() => setUhd((v) => !v)} />
                </>
              ) : null}
            </View>
          )
        }
      />
    </Page>
  );
}
