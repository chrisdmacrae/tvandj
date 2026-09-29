import { ActivityIndicator, FlatList, View } from 'react-native';
import { Shelf, Text, colors, safeArea, spacing } from '@tv-and-j/design-system';
import type { MediaKind } from '../downloadarr/client';
import { useDiscoverGenre, useDiscoverGenres, useDownloadarr, usePopular, useRequestedItems } from '../downloadarr/hooks';
import { useLibraryByGenre, useLibraryGenres } from '../jellyfin/library';
import { DiscoverCard } from './DiscoverCard';
import { MediaCard } from './MediaCard';
import { RequestedRow } from './RequestedRow';

type Row = { key: string; title: string; genreId?: number };

/**
 * Movies / TV tab. With downloadarr connected it's discovery (TMDB popular,
 * then a row per genre); without it, the Jellyfin library grouped by genre.
 * Rows render lazily, so each genre is only fetched as it scrolls into view.
 */
export function BrowseScreen({ kind }: { kind: MediaKind }) {
  const client = useDownloadarr();
  return client ? <DiscoverBrowse kind={kind} /> : <LibraryBrowse kind={kind} />;
}

function DiscoverBrowse({ kind }: { kind: MediaKind }) {
  const genres = useDiscoverGenres(kind);
  // Initial focus goes to whichever section is on top: Requested when there is any.
  const requested = useRequestedItems(kind);
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
      ListHeaderComponent={<RequestedRow items={requested} autoFocus />}
      renderItem={({ item: row, index }) =>
        row.genreId == null ? (
          <PopularRow kind={kind} title={row.title} autoFocus={index === 0 && requested.length === 0} />
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
      renderItem={({ item: genre, index }) => <LibraryGenreRow kind={kind} genre={genre} autoFocus={index === 0} />}
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
