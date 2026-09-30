import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { useMemo } from 'react';
import { ActivityIndicator, ScrollView } from 'react-native';
import { Shelf, Text, colors, safeArea, spacing, type ArtworkShape } from '@tv-and-j/design-system';
import { DiscoverCard } from '../../components/DiscoverCard';
import { MediaCard } from '../../components/MediaCard';
import { RequestedRow } from '../../components/RequestedRow';
import type { DiscoverItem, MediaKind } from '@tv-and-j/core/downloadarr/client';
import { useDownloadarr, usePopular, requestKey, useRequestedItems } from '@tv-and-j/core/downloadarr/hooks';
import { useMyList } from '@tv-and-j/core/jellyfin/browse';
import { useContinueWatching, useLatest, useLibraryIndex, useLibraryKinds } from '@tv-and-j/core/jellyfin/library';

type Row =
  | { key: string; title: string; kind: 'library'; shape: ArtworkShape; items: BaseItemDto[] }
  | { key: string; title: string; kind: 'discover'; items: { item: DiscoverItem; kind: MediaKind }[] };

const NEW_FOR_YOU_LIMIT = 20;

/**
 * Popular movies and shows from downloadarr that aren't in the library yet,
 * interleaved so neither kind dominates. Empty when downloadarr isn't set up.
 */
function useNewForYou() {
  const client = useDownloadarr();
  const movies = usePopular('movie');
  const shows = usePopular('tv');
  const library = useLibraryIndex();
  return useMemo(() => {
    if (!client) return [];
    const notOwned = (kind: MediaKind) => (item: DiscoverItem) => !library.data?.[requestKey(kind, item.id)];
    const m = (movies.data ?? []).filter(notOwned('movie'));
    const s = (shows.data ?? []).filter(notOwned('tv'));
    const mixed: { item: DiscoverItem; kind: MediaKind }[] = [];
    for (let i = 0; i < Math.max(m.length, s.length) && mixed.length < NEW_FOR_YOU_LIMIT; i++) {
      if (m[i]) mixed.push({ item: m[i], kind: 'movie' });
      if (s[i]) mixed.push({ item: s[i], kind: 'tv' });
    }
    return mixed;
  }, [client, movies.data, shows.data, library.data]);
}

export default function Home() {
  const kinds = useLibraryKinds();
  const has = (kind: string) => kinds.data?.has(kind) ?? false;

  const resume = useContinueWatching();
  const myList = useMyList();
  const newForYou = useNewForYou();
  // Initial focus goes to whichever section is on top: Requested when there is any.
  const requested = useRequestedItems();
  const rowsHaveFocus = requested.length === 0;
  const movies = useLatest('movies', has('movies'));
  const shows = useLatest('tvshows', has('tvshows'));
  const music = useLatest('music', has('music'));

  // Rows only render when their source exists and has something in it.
  const rows: Row[] = (
    [
      { key: 'resume', title: 'Continue Watching', kind: 'library', shape: 'landscape', items: resume.data ?? [] },
      { key: 'mylist', title: 'My List', kind: 'library', shape: 'portrait', items: myList.data ?? [] },
      { key: 'new', title: 'New for you', kind: 'discover', items: newForYou },
      { key: 'movies', title: 'Latest Movies', kind: 'library', shape: 'portrait', items: has('movies') ? (movies.data ?? []) : [] },
      { key: 'shows', title: 'Latest Shows', kind: 'library', shape: 'portrait', items: has('tvshows') ? (shows.data ?? []) : [] },
      { key: 'music', title: 'Latest Music', kind: 'library', shape: 'square', items: has('music') ? (music.data ?? []) : [] },
    ] satisfies Row[]
  ).filter((row) => row.items.length > 0);

  const loading = kinds.isPending || resume.isPending;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: safeArea.vertical }}>
      {loading ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xxxl }} /> : null}

      <RequestedRow items={requested} autoFocus />

      {!loading && rows.length === 0 ? (
        <Text tone="secondary" style={{ paddingHorizontal: safeArea.horizontal, paddingTop: spacing.xl }}>
          Nothing here yet. Add some media to your Jellyfin libraries and it will show up here.
        </Text>
      ) : null}

      {rows.map((row, rowIndex) =>
        row.kind === 'library' ? (
          <Shelf
            key={row.key}
            title={row.title}
            data={row.items}
            keyExtractor={(item) => item.Id ?? ''}
            renderItem={({ item, index }) => (
              <MediaCard item={item} shape={row.shape} hasTVPreferredFocus={rowsHaveFocus && rowIndex === 0 && index === 0} />
            )}
          />
        ) : (
          <Shelf
            key={row.key}
            title={row.title}
            data={row.items}
            keyExtractor={({ item, kind }) => requestKey(kind, item.id)}
            renderItem={({ item: { item, kind }, index }) => (
              <DiscoverCard item={item} kind={kind} hasTVPreferredFocus={rowsHaveFocus && rowIndex === 0 && index === 0} />
            )}
          />
        ),
      )}
    </ScrollView>
  );
}
