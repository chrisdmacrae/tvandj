import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Shelf, Text, TextField, colors, spacing, useLayout } from '@tv-and-j/design-system';
import { requestKey, useDiscoverSearch, useMusicSearch } from '@tv-and-j/core/downloadarr/hooks';
import { useLibraryIndex, useLibrarySearch } from '@tv-and-j/core/jellyfin/library';
import { AlbumDiscoverCard } from '../../components/AlbumDiscoverCard';
import { DiscoverCard } from '../../components/DiscoverCard';
import { ItemCard } from '../../components/ItemCard';
import { SectionHeader } from '../../components/SectionHeader';
import { useBottomSpace } from '../../lib/chrome';

const DEBOUNCE_MS = 300;

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** Search the library: movies, shows and albums as you type. */
export default function Search() {
  const bottomSpace = useBottomSpace();
  const { gutter } = useLayout();
  const [text, setText] = useState('');
  const query = useDebounced(text, DEBOUNCE_MS);
  const movies = useLibrarySearch('movie', query);
  const shows = useLibrarySearch('tv', query);
  const libraryAlbums = useLibrarySearch('album', query);
  // Titles from downloadarr you don't have yet (when it's connected).
  const library = useLibraryIndex().data;
  const discoverMovies = useDiscoverSearch('movie', query).data ?? [];
  const discoverShows = useDiscoverSearch('tv', query).data ?? [];
  const toRequest = [
    ...discoverMovies.filter((i) => !library?.[requestKey('movie', i.id)]).map((item) => ({ item, kind: 'movie' as const })),
    ...discoverShows.filter((i) => !library?.[requestKey('tv', i.id)]).map((item) => ({ item, kind: 'tv' as const })),
  ];
  const albums = useMusicSearch(query);
  const searching = query.trim().length >= 2;
  const results = [
    { key: 'movies', title: 'Movies', items: movies.data ?? [], shape: 'portrait' as const },
    { key: 'shows', title: 'Shows', items: shows.data ?? [], shape: 'portrait' as const },
    { key: 'albums', title: 'Albums', items: libraryAlbums.data ?? [], shape: 'square' as const },
  ].filter((r) => r.items.length);
  const nothing = !results.length && !toRequest.length && !albums.albums.length;
  const fetching = movies.isFetching || shows.isFetching || libraryAlbums.isFetching || albums.isFetching;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: bottomSpace + spacing.xl }} keyboardShouldPersistTaps="handled">
      <SectionHeader title="Search" />
      <View style={{ paddingHorizontal: gutter, paddingBottom: spacing.lg, maxWidth: 640 + gutter * 2 }}>
        <TextField label="Search" placeholder="Movies, shows and music" value={text} onChangeText={setText} autoFocus autoCorrect={false} returnKeyType="search" />
      </View>
      {searching && fetching && nothing ? <ActivityIndicator color={colors.accent} /> : null}
      {searching && !fetching && nothing ? (
        <Text tone="secondary" style={{ paddingHorizontal: gutter }}>
          Nothing matches “{query}”.
        </Text>
      ) : null}
      {results.map((row) => (
        <Shelf key={row.key} title={row.title} data={row.items} keyExtractor={(item) => item.Id ?? ''} renderItem={({ item }) => <ItemCard item={item} shape={row.shape} />} />
      ))}
      {searching && toRequest.length ? (
        <Shelf
          title="Available to request"
          data={toRequest}
          keyExtractor={({ item, kind }) => requestKey(kind, item.id)}
          renderItem={({ item: { item, kind } }) => <DiscoverCard item={item} kind={kind} />}
        />
      ) : null}
      {searching && albums.albums.length ? (
        <Shelf
          title="Albums to request"
          data={albums.albums}
          keyExtractor={(album) => album.id}
          renderItem={({ item: album }) => <AlbumDiscoverCard album={album} />}
        />
      ) : null}
    </ScrollView>
  );
}
