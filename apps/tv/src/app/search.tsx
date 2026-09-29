import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { ArrowLeftIcon, IconButton, SelectChip, Shelf, Text, TextField, colors, safeArea, spacing } from '@tv-and-j/design-system';
import { DiscoverCard } from '../components/DiscoverCard';
import { MediaCard } from '../components/MediaCard';
import type { MediaKind } from '../downloadarr/client';
import { requestKey, useDiscoverSearch, useDownloadarr } from '../downloadarr/hooks';
import { useLibraryIndex, useLibrarySearch } from '../jellyfin/library';

const DEBOUNCE_MS = 400;

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * Search your Jellyfin library and, when downloadarr is connected, TMDB for
 * things to request. One kind at a time, chosen with the Movies / TV toggle.
 */
export default function SearchScreen() {
  const [text, setText] = useState('');
  const [kind, setKind] = useState<MediaKind>('movie');
  const query = useDebounced(text, DEBOUNCE_MS);

  const client = useDownloadarr();
  const library = useLibrarySearch(kind, query);
  const discover = useDiscoverSearch(kind, query);
  const libraryIndex = useLibraryIndex();

  // Discover only lists what you don't already have; the library row covers the rest.
  const toDiscover = (discover.data ?? []).filter((item) => !libraryIndex.data?.[requestKey(kind, item.id)]);
  const searching = query.trim().length >= 2;
  const loading = searching && (library.isFetching || discover.isFetching);
  const nothing = searching && !loading && !library.data?.length && !toDiscover.length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: spacing.lg,
          paddingHorizontal: safeArea.horizontal,
          paddingTop: safeArea.vertical,
          paddingBottom: spacing.sm,
        }}
      >
        <View style={{ paddingBottom: spacing.xs }}>
          <IconButton
            accessibilityLabel="Back"
            icon={(color) => <ArrowLeftIcon color={color} />}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          />
        </View>
        <View style={{ flex: 1, maxWidth: 520 }}>
          <TextField
            label="Search"
            placeholder={kind === 'movie' ? 'Movie title' : 'Show title'}
            value={text}
            onChangeText={setText}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.xs }}>
          <SelectChip label="Movies" selected={kind === 'movie'} onPress={() => setKind('movie')} />
          <SelectChip label="TV" selected={kind === 'tv'} onPress={() => setKind('tv')} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: safeArea.vertical }}>
        {!searching ? (
          <Message text={client ? 'Search your library, and find new things to request.' : 'Search your library.'} />
        ) : null}
        {loading && !library.data && !discover.data ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} /> : null}
        {nothing ? <Message text={`No ${kind === 'movie' ? 'movies' : 'shows'} match “${query.trim()}”.`} /> : null}

        {searching && library.data?.length ? (
          <Shelf
            title="In your library"
            data={library.data}
            keyExtractor={(item) => item.Id ?? ''}
            renderItem={({ item }) => <MediaCard item={item} shape="portrait" />}
          />
        ) : null}

        {searching && toDiscover.length ? (
          <Shelf
            title="Discover"
            data={toDiscover}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <DiscoverCard item={item} kind={kind} />}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

function Message({ text }: { text: string }) {
  return (
    <View style={{ paddingHorizontal: safeArea.horizontal, paddingTop: spacing.lg }}>
      <Text tone="secondary">{text}</Text>
    </View>
  );
}
