import type { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models';
import { useState } from 'react';
import { View } from 'react-native';
import { Dropdown, SelectChip, spacing, useLayout } from '@tv-and-j/design-system';
import { GRID_SORTS, useItemGrid, type GridSort } from '@tv-and-j/core/jellyfin/browse';
import { useLibraryGenres } from '@tv-and-j/core/jellyfin/library';
import { useBottomSpace } from '../lib/chrome';
import { ItemGrid } from './ItemGrid';
import { SectionHeader } from './SectionHeader';

/** Movies or TV: the whole library as a grid, with sort and filters. */
export function LibraryScreen({ kind }: { kind: 'movie' | 'tv' }) {
  const bottomSpace = useBottomSpace();
  const { gutter } = useLayout();
  const types: BaseItemKind[] = [kind === 'movie' ? 'Movie' : 'Series'];
  const [sort, setSort] = useState<GridSort>('added');
  const [unwatched, setUnwatched] = useState(false);
  const [genre, setGenre] = useState('');
  const genres = useLibraryGenres(kind).data ?? [];
  const grid = useItemGrid({ types, sort, unwatched, genre: genre || undefined });
  const items = grid.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <ItemGrid
      items={items}
      loading={grid.isPending}
      onEndReached={() => grid.hasNextPage && !grid.isFetchingNextPage && grid.fetchNextPage()}
      bottomSpace={bottomSpace}
      empty={kind === 'movie' ? 'No movies match.' : 'No shows match.'}
      header={
        <View style={{ marginHorizontal: -gutter }}>
          <SectionHeader title={kind === 'movie' ? 'Movies' : 'TV'} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, paddingHorizontal: gutter, paddingBottom: spacing.lg }}>
            <Dropdown label="Sort" value={sort} options={GRID_SORTS} onChange={setSort} />
            {genres.length ? (
              <Dropdown label="Genre" value={genre} options={[{ value: '', label: 'All genres' }, ...genres.map((g) => ({ value: g, label: g }))]} onChange={setGenre} />
            ) : null}
            <SelectChip label="Unwatched" selected={unwatched} onPress={() => setUnwatched((v) => !v)} />
          </View>
        </View>
      }
    />
  );
}
