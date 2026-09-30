import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { ArrowLeftIcon, IconButton, SelectChip, Shelf, Text, TextField, colors, safeArea, spacing } from '@tv-and-j/design-system';
import { AlbumDiscoverCard } from '../components/AlbumDiscoverCard';
import { DiscoverCard } from '../components/DiscoverCard';
import { MediaCard } from '../components/MediaCard';
import type { MediaKind } from '@tv-and-j/core/downloadarr/client';
import { requestKey, useDiscoverSearch, useDownloadarr, useMusicSearch } from '@tv-and-j/core/downloadarr/hooks';
import { useLibraryIndex, useLibraryKinds, useLibrarySearch } from '@tv-and-j/core/jellyfin/library';

const DEBOUNCE_MS = 400;

type Kind = MediaKind | 'music';

const PLACEHOLDER: Record<Kind, string> = { movie: 'Movie title', tv: 'Show title', music: 'Album or artist' };
const NOUN: Record<Kind, string> = { movie: 'movies', tv: 'shows', music: 'albums' };

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
 * things to request. One kind at a time, chosen with the Movies / TV / Music
 * toggle; Music shows when there's a music library or downloadarr to search.
 */
export default function SearchScreen() {
  // q: a search handed over from the TV's system search.
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [text, setText] = useState(q ?? '');
  const [kind, setKind] = useState<Kind>('movie');
  const query = useDebounced(text, DEBOUNCE_MS);
  const music = kind === 'music';
  const videoKind: MediaKind = music ? 'movie' : kind;

  const client = useDownloadarr();
  const hasMusic = !!client || !!useLibraryKinds().data?.has('music');
  const library = useLibrarySearch(music ? 'album' : kind, query);
  // Only the selected kind's search runs; the other gets no query.
  const discover = useDiscoverSearch(videoKind, music ? '' : query);
  const albums = useMusicSearch(music ? query : '');
  const libraryIndex = useLibraryIndex();

  // Discover only lists what you don't already have; the library row covers the rest.
  const toDiscover = music ? [] : (discover.data ?? []).filter((item) => !libraryIndex.data?.[requestKey(videoKind, item.id)]);
  const searching = query.trim().length >= 2;
  const loading = searching && (library.isFetching || discover.isFetching || albums.isFetching);
  const nothing = searching && !loading && !library.data?.length && !toDiscover.length && !albums.albums.length;

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
            placeholder={PLACEHOLDER[kind]}
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
          {hasMusic ? <SelectChip label="Music" selected={music} onPress={() => setKind('music')} /> : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: safeArea.vertical }}>
        {!searching ? (
          <Message text={client ? 'Search your library, and find new things to request.' : 'Search your library.'} />
        ) : null}
        {loading && !library.data && !discover.data && !albums.albums.length ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} /> : null}
        {nothing ? <Message text={`No ${NOUN[kind]} match “${query.trim()}”.`} /> : null}

        {searching && library.data?.length ? (
          <Shelf
            title="In your library"
            data={library.data}
            keyExtractor={(item) => item.Id ?? ''}
            renderItem={({ item }) => <MediaCard item={item} shape={music ? 'square' : 'portrait'} />}
          />
        ) : null}

        {searching && toDiscover.length ? (
          <Shelf
            title="Discover"
            data={toDiscover}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <DiscoverCard item={item} kind={videoKind} />}
          />
        ) : null}

        {searching && albums.albums.length ? (
          <Shelf
            title="Discover"
            data={albums.albums}
            keyExtractor={(album) => album.id}
            renderItem={({ item: album }) => <AlbumDiscoverCard album={album} />}
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
