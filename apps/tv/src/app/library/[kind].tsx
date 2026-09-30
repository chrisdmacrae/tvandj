import type { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Dropdown, SelectChip, spacing } from '@tv-and-j/design-system';
import { ItemGrid } from '../../components/ItemGrid';
import { GlowScreen } from '../../components/GlowScreen';
import { PageHeader } from '../../components/PageHeader';
import { GRID_SORTS, useItemGrid, type GridSort } from '@tv-and-j/core/jellyfin/browse';
import { useLibraryGenres } from '@tv-and-j/core/jellyfin/library';
import { useAlbumArtists } from '@tv-and-j/core/jellyfin/music';

type Kind = 'movies' | 'tv' | 'collections' | 'mylist' | 'albums' | 'artists';

const KINDS: Record<Kind, { title: string; types: BaseItemKind[]; sort: GridSort; filters: boolean; empty: string }> = {
  movies: { title: 'All movies', types: ['Movie'], sort: 'added', filters: true, empty: 'No movies match.' },
  tv: { title: 'All shows', types: ['Series'], sort: 'added', filters: true, empty: 'No shows match.' },
  collections: { title: 'Collections', types: ['BoxSet'], sort: 'name', filters: false, empty: 'No collections yet.' },
  albums: { title: 'All albums', types: ['MusicAlbum'], sort: 'name', filters: false, empty: 'No albums yet.' },
  // Artists come from Jellyfin's album-artist list, not an item query (see below).
  artists: { title: 'All artists', types: ['MusicArtist'], sort: 'name', filters: false, empty: 'No artists yet.' },
  mylist: {
    title: 'My List',
    types: ['Movie', 'Series'],
    sort: 'added',
    filters: false,
    empty: 'Nothing in My List yet. Add movies and shows from their pages.',
  },
};

/** A whole library as a grid, with sorting and filters. */
export default function LibraryGrid() {
  const { kind: param } = useLocalSearchParams<{ kind: string }>();
  const kind: Kind = param in KINDS ? (param as Kind) : 'movies';
  const config = KINDS[kind];

  const [sort, setSort] = useState<GridSort>(config.sort);
  const [unwatched, setUnwatched] = useState(false);
  const [uhd, setUhd] = useState(false);
  const [genre, setGenre] = useState('');
  const genres = useLibraryGenres(kind === 'tv' ? 'tv' : 'movie').data ?? [];

  const isArtists = kind === 'artists';
  const itemGrid = useItemGrid(
    {
      types: config.types,
      sort,
      unwatched: config.filters && unwatched,
      uhd: config.filters && uhd,
      genre: config.filters ? genre || undefined : undefined,
      favorites: kind === 'mylist',
    },
    !isArtists,
  );
  const artistGrid = useAlbumArtists(undefined, isArtists);
  const grid = isArtists ? artistGrid : itemGrid;
  const items = grid.data?.pages.flatMap((p) => p.items) ?? [];
  const music = kind === 'albums' || isArtists;

  return (
    <GlowScreen>
      <ItemGrid
        items={items}
        loading={grid.isPending}
        loadingMore={grid.isFetchingNextPage}
        onEndReached={() => grid.hasNextPage && !grid.isFetchingNextPage && grid.fetchNextPage()}
        empty={config.empty}
        shape={music ? 'square' : 'portrait'}
        autoFocus
        header={
          <PageHeader title={config.title}>
            {kind === 'collections' || isArtists ? null : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }}>
                <Dropdown label="Sort" value={sort} options={GRID_SORTS} onChange={setSort} />
                {config.filters ? (
                  <>
                    {genres.length ? (
                      <Dropdown
                        label="Genre"
                        value={genre}
                        options={[{ value: '', label: 'All genres' }, ...genres.map((g) => ({ value: g, label: g }))]}
                        onChange={setGenre}
                      />
                    ) : null}
                    <SelectChip label="Unwatched" selected={unwatched} onPress={() => setUnwatched((v) => !v)} />
                    <SelectChip label="4K" selected={uhd} onPress={() => setUhd((v) => !v)} />
                  </>
                ) : null}
              </View>
            )}
          </PageHeader>
        }
      />
    </GlowScreen>
  );
}
