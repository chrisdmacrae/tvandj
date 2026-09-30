import { router } from 'expo-router';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { Button, Shelf, Text, colors, safeArea, spacing } from '@tv-and-j/design-system';
import type { DiscoverItem, MediaKind } from '@tv-and-j/core/downloadarr/client';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { videoRailTitles } from '@tv-and-j/core/downloadarr/display';
import { useDiscoverGenre, useDiscoverGenres, useDownloadarr, usePopular, useRequestedItems, useVideoRails } from '@tv-and-j/core/downloadarr/hooks';
import { useHasCollections } from '@tv-and-j/core/jellyfin/browse';
import { useLatest, useLibraryByGenre, useLibraryGenres } from '@tv-and-j/core/jellyfin/library';
import { DiscoverCard } from './DiscoverCard';
import { MediaCard } from './MediaCard';
import { RequestedRow } from './RequestedRow';

type Row = { key: string; title: string; genreId?: number };

/**
 * Movies / TV tab. With downloadarr connected it's discovery: your requests,
 * Trakt's recommendations and your watchlist, what's recently added, then TMDB
 * popular and a row per genre. Without it, what's recently added and the
 * Jellyfin library by genre. Rows render lazily, so each genre is only fetched
 * as it scrolls into view.
 */
export function BrowseScreen({ kind }: { kind: MediaKind }) {
  const client = useDownloadarr();
  return client ? <DiscoverBrowse kind={kind} /> : <LibraryBrowse kind={kind} />;
}

const latestKind = (kind: MediaKind) => (kind === 'movie' ? 'movies' : 'tvshows');

/** Recently added to Jellyfin: new movies, and shows with new episodes. */
function RecentlyAddedRow({ items, autoFocus }: { items: BaseItemDto[]; autoFocus: boolean }) {
  if (!items.length) return null;
  return (
    <Shelf
      title="Recently added"
      data={items}
      keyExtractor={(item) => item.Id ?? ''}
      renderItem={({ item, index }) => <MediaCard item={item} shape="portrait" hasTVPreferredFocus={autoFocus && index === 0} />}
    />
  );
}

function DiscoverItemsRow({ kind, title, items, autoFocus }: { kind: MediaKind; title: string; items: DiscoverItem[]; autoFocus: boolean }) {
  if (!items.length) return null;
  return (
    <Shelf
      title={title}
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item, index }) => <DiscoverCard item={item} kind={kind} hasTVPreferredFocus={autoFocus && index === 0} />}
    />
  );
}

function DiscoverBrowse({ kind }: { kind: MediaKind }) {
  const genres = useDiscoverGenres(kind);
  const requested = useRequestedItems(kind);
  const rails = useVideoRails(kind);
  const recent = useLatest(latestKind(kind), true).data ?? [];
  const titles = videoRailTitles(rails.profile?.name);
  // Initial focus goes to whichever section is on top.
  const top = requested.length ? 'requested' : rails.recommended.length ? 'recommended' : rails.watchlist.length ? 'watchlist' : recent.length ? 'recent' : 'popular';
  if (genres.isPending) return <Loading />;
  if (genres.isError) return <Message text="Couldn’t reach downloadarr. Check the address in Settings." />;

  const rows: Row[] = [
    { key: 'popular', title: 'Popular' },
    ...genres.data.map((g) => ({ key: String(g.id), title: g.name, genreId: g.id })),
  ];
  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.key}
      initialNumToRender={3}
      windowSize={5}
      contentContainerStyle={{ paddingBottom: safeArea.vertical }}
      ListHeaderComponent={
        <>
          <LibraryLinks kind={kind} />
          <RequestedRow items={requested} autoFocus />
          <DiscoverItemsRow kind={kind} title={titles.recommended} items={rails.recommended} autoFocus={top === 'recommended'} />
          <DiscoverItemsRow kind={kind} title={titles.watchlist} items={rails.watchlist} autoFocus={top === 'watchlist'} />
          <RecentlyAddedRow items={recent} autoFocus={top === 'recent'} />
        </>
      }
      renderItem={({ item: row, index }) =>
        row.genreId == null ? (
          <PopularRow kind={kind} title={row.title} autoFocus={index === 0 && top === 'popular'} />
        ) : (
          <GenreRow kind={kind} title={row.title} genreId={row.genreId} />
        )
      }
    />
  );
}

function PopularRow({ kind, title, autoFocus }: { kind: MediaKind; title: string; autoFocus: boolean }) {
  const { data } = usePopular(kind);
  if (!data?.length) return null;
  return (
    <Shelf
      title={title}
      data={data}
      keyExtractor={(item) => item.id}
      renderItem={({ item, index }) => <DiscoverCard item={item} kind={kind} hasTVPreferredFocus={autoFocus && index === 0} />}
    />
  );
}

function GenreRow({ kind, title, genreId }: { kind: MediaKind; title: string; genreId: number }) {
  const { data } = useDiscoverGenre(kind, genreId);
  if (!data?.length) return null;
  return (
    <Shelf
      title={title}
      data={data}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <DiscoverCard item={item} kind={kind} />}
    />
  );
}

function LibraryBrowse({ kind }: { kind: MediaKind }) {
  const genres = useLibraryGenres(kind);
  const recent = useLatest(latestKind(kind), true).data ?? [];
  if (genres.isPending) return <Loading />;
  if (!genres.data?.length) {
    return <Message text={`No ${kind === 'movie' ? 'movies' : 'shows'} in your library yet.`} />;
  }
  return (
    <FlatList
      data={genres.data}
      keyExtractor={(genre) => genre}
      initialNumToRender={3}
      windowSize={5}
      contentContainerStyle={{ paddingBottom: safeArea.vertical }}
      ListHeaderComponent={
        <>
          <LibraryLinks kind={kind} />
          <RecentlyAddedRow items={recent} autoFocus />
        </>
      }
      renderItem={({ item: genre, index }) => <LibraryGenreRow kind={kind} genre={genre} autoFocus={index === 0 && !recent.length} />}
    />
  );
}

function LibraryGenreRow({ kind, genre, autoFocus }: { kind: MediaKind; genre: string; autoFocus: boolean }) {
  const { data } = useLibraryByGenre(kind, genre);
  if (!data?.length) return null;
  return (
    <Shelf
      title={genre}
      data={data}
      keyExtractor={(item) => item.Id ?? ''}
      renderItem={({ item, index }) => (
        <MediaCard item={item} shape="portrait" hasTVPreferredFocus={autoFocus && index === 0} />
      )}
    />
  );
}

/**
 * The whole library as a sortable, filterable grid, plus collections and My
 * List. Above the rows; Up from the first row reaches it.
 */
function LibraryLinks({ kind }: { kind: MediaKind }) {
  const hasCollections = useHasCollections();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: safeArea.horizontal, paddingBottom: spacing.lg }}>
      <Button
        label={kind === 'movie' ? 'Downloaded movies' : 'Downloaded shows'}
        size="sm"
        variant="secondary"
        onPress={() => router.push({ pathname: '/library/[kind]', params: { kind: kind === 'movie' ? 'movies' : 'tv' } })}
      />
      {kind === 'movie' && hasCollections ? (
        <Button label="Collections" size="sm" variant="secondary" onPress={() => router.push({ pathname: '/library/[kind]', params: { kind: 'collections' } })} />
      ) : null}
      <Button label="My List" size="sm" variant="secondary" onPress={() => router.push({ pathname: '/library/[kind]', params: { kind: 'mylist' } })} />
    </View>
  );
}

function Loading() {
  return <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xxxl }} />;
}

function Message({ text }: { text: string }) {
  return (
    <View style={{ paddingHorizontal: safeArea.horizontal, paddingTop: spacing.xl }}>
      <Text tone="secondary">{text}</Text>
    </View>
  );
}
