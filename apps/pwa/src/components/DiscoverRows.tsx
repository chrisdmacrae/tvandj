import { ActivityIndicator, FlatList, View } from 'react-native';
import { Shelf, Text, colors, spacing, useLayout } from '@tv-and-j/design-system';
import type { DiscoverItem, MediaKind } from '@tv-and-j/core/downloadarr/client';
import { videoRailTitles } from '@tv-and-j/core/downloadarr/display';
import { requestKey, useDiscoverGenre, useDiscoverGenres, usePopular, useRequestedItems, useVideoRails } from '@tv-and-j/core/downloadarr/hooks';
import { useLatest } from '@tv-and-j/core/jellyfin/library';
import { DiscoverCard } from './DiscoverCard';
import { ItemCard } from './ItemCard';

function DiscoverShelf({ title, kind, items }: { title: string; kind: MediaKind; items: DiscoverItem[] | undefined }) {
  if (!items?.length) return null;
  return <Shelf title={title} data={items} keyExtractor={(item) => requestKey(kind, item.id)} renderItem={({ item }) => <DiscoverCard item={item} kind={kind} />} />;
}

function GenreRow({ kind, genreId, title }: { kind: MediaKind; genreId: number; title: string }) {
  return <DiscoverShelf title={title} kind={kind} items={useDiscoverGenre(kind, genreId).data} />;
}

/**
 * Your requests, Trakt's recommendations and your watchlist, what's recently added to the
 * library, what's popular, then a row per genre, from TMDB via downloadarr. Rows load as they
 * scroll into view.
 */
export function DiscoverRows({ kind, header, bottomSpace }: { kind: MediaKind; header: React.ReactElement; bottomSpace: number }) {
  const { gutter } = useLayout();
  const genres = useDiscoverGenres(kind);
  const popular = usePopular(kind).data;
  const requested = useRequestedItems(kind).map(({ item }) => item);
  const rails = useVideoRails(kind);
  const titles = videoRailTitles(rails.profile?.name);
  return (
    <FlatList
      data={genres.data ?? []}
      keyExtractor={(g) => String(g.id)}
      initialNumToRender={3}
      windowSize={5}
      contentContainerStyle={{ paddingBottom: bottomSpace + spacing.xl }}
      ListHeaderComponent={
        <View>
          {header}
          {genres.isError ? (
            <Text tone="secondary" style={{ paddingHorizontal: gutter }}>
              Couldn’t reach downloadarr. Check the address in Settings.
            </Text>
          ) : null}
          <DiscoverShelf title="Requested" kind={kind} items={requested} />
          <DiscoverShelf title={titles.recommended} kind={kind} items={rails.recommended} />
          <DiscoverShelf title={titles.watchlist} kind={kind} items={rails.watchlist} />
          <RecentlyAdded kind={kind} />
          <DiscoverShelf title="Popular" kind={kind} items={popular} />
          {genres.isPending ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} /> : null}
        </View>
      }
      renderItem={({ item: genre }) => <GenreRow kind={kind} genreId={genre.id} title={genre.name} />}
    />
  );
}

/** Recently added to Jellyfin: new movies, and shows with new episodes. */
export function RecentlyAdded({ kind }: { kind: MediaKind }) {
  const items = useLatest(kind === 'movie' ? 'movies' : 'tvshows', true).data ?? [];
  if (!items.length) return null;
  return <Shelf title="Recently added" data={items} keyExtractor={(item) => item.Id ?? ''} renderItem={({ item }) => <ItemCard item={item} shape="portrait" />} />;
}
