import { router } from 'expo-router';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { Button, Shelf, Text, colors, spacing, useLayout } from '@tv-and-j/design-system';
import { useHasCollections } from '@tv-and-j/core/jellyfin/browse';
import { useDownloadarr } from '@tv-and-j/core/downloadarr/hooks';
import { useLibraryByGenre, useLibraryGenres } from '@tv-and-j/core/jellyfin/library';
import { useBottomSpace } from '../lib/chrome';
import { DiscoverRows, RecentlyAdded } from './DiscoverRows';
import { ItemCard } from './ItemCard';
import { SectionHeader } from './SectionHeader';

type Kind = 'movie' | 'tv';

/** The whole library as a sortable, filterable grid, plus collections and My List. Above the rows, like the TV. */
function LibraryLinks({ kind }: { kind: Kind }) {
  const { gutter } = useLayout();
  const hasCollections = useHasCollections();
  const open = (grid: string) => router.push({ pathname: '/library/[kind]', params: { kind: grid } });
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: gutter, paddingBottom: spacing.lg }}>
      <Button label={kind === 'movie' ? 'Downloaded movies' : 'Downloaded shows'} size="sm" variant="secondary" onPress={() => open(kind === 'movie' ? 'movies' : 'tv')} />
      {kind === 'movie' && hasCollections ? <Button label="Collections" size="sm" variant="secondary" onPress={() => open('collections')} /> : null}
      <Button label="My List" size="sm" variant="secondary" onPress={() => open('mylist')} />
    </View>
  );
}

function LibraryGenreRow({ kind, genre }: { kind: Kind; genre: string }) {
  const { data } = useLibraryByGenre(kind, genre);
  if (!data?.length) return null;
  return <Shelf title={genre} data={data} keyExtractor={(item) => item.Id ?? ''} renderItem={({ item }) => <ItemCard item={item} shape="portrait" />} />;
}

/** Without downloadarr: what's recently added, then your library, a row per genre. */
function LibraryRows({ kind, header, bottomSpace }: { kind: Kind; header: React.ReactElement; bottomSpace: number }) {
  const { gutter } = useLayout();
  const genres = useLibraryGenres(kind);
  return (
    <FlatList
      data={genres.data ?? []}
      keyExtractor={(genre) => genre}
      initialNumToRender={3}
      windowSize={5}
      contentContainerStyle={{ paddingBottom: bottomSpace + spacing.xl }}
      ListHeaderComponent={
        <View>
          {header}
          <RecentlyAdded kind={kind} />
          {genres.isPending ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} /> : null}
          {!genres.isPending && !genres.data?.length ? (
            <Text tone="secondary" style={{ paddingHorizontal: gutter }}>
              {`No ${kind === 'movie' ? 'movies' : 'shows'} in your library yet.`}
            </Text>
          ) : null}
        </View>
      }
      renderItem={({ item: genre }) => <LibraryGenreRow kind={kind} genre={genre} />}
    />
  );
}

/**
 * Movies or TV, laid out like the TV app: links to the whole library, collections
 * and My List, then rows. With downloadarr, the rows are discovery (your requests,
 * Trakt's picks, recently added, popular, then genres); without it, recently added
 * and your library by genre.
 */
export function BrowseScreen({ kind }: { kind: Kind }) {
  const bottomSpace = useBottomSpace();
  const client = useDownloadarr();
  const header = (
    <View>
      <SectionHeader title={kind === 'movie' ? 'Movies' : 'TV'} />
      <LibraryLinks kind={kind} />
    </View>
  );
  return client ? <DiscoverRows kind={kind} header={header} bottomSpace={bottomSpace} /> : <LibraryRows kind={kind} header={header} bottomSpace={bottomSpace} />;
}
