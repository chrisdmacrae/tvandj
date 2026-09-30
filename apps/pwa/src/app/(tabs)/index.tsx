import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { ActivityIndicator, ScrollView } from 'react-native';
import { Shelf, Text, colors, spacing, useLayout, type ArtworkShape } from '@tv-and-j/design-system';
import { useMyList } from '@tv-and-j/core/jellyfin/browse';
import { useContinueWatching, useLatest, useLibraryKinds } from '@tv-and-j/core/jellyfin/library';
import { ItemCard } from '../../components/ItemCard';
import { SectionHeader } from '../../components/SectionHeader';
import { useBottomSpace } from '../../lib/chrome';

type Row = { key: string; title: string; shape: ArtworkShape; items: BaseItemDto[] };

/** What's on: carry on watching, your list, and what's new in each library. */
export default function Home() {
  const bottomSpace = useBottomSpace();
  const { gutter } = useLayout();
  const kinds = useLibraryKinds();
  const has = (kind: string) => kinds.data?.has(kind) ?? false;
  const resume = useContinueWatching();
  const myList = useMyList();
  const movies = useLatest('movies', has('movies'));
  const shows = useLatest('tvshows', has('tvshows'));
  const music = useLatest('music', has('music'));

  const rows: Row[] = (
    [
      { key: 'resume', title: 'Continue Watching', shape: 'landscape', items: resume.data ?? [] },
      { key: 'mylist', title: 'My List', shape: 'portrait', items: myList.data ?? [] },
      { key: 'movies', title: 'Latest Movies', shape: 'portrait', items: has('movies') ? (movies.data ?? []) : [] },
      { key: 'shows', title: 'Latest Shows', shape: 'portrait', items: has('tvshows') ? (shows.data ?? []) : [] },
      { key: 'music', title: 'Latest Music', shape: 'square', items: has('music') ? (music.data ?? []) : [] },
    ] satisfies Row[]
  ).filter((row) => row.items.length);
  const loading = kinds.isPending || resume.isPending;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: bottomSpace + spacing.xl }}>
      <SectionHeader title="Home" />
      {loading ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xxxl }} /> : null}
      {!loading && !rows.length ? (
        <Text tone="secondary" style={{ paddingHorizontal: gutter }}>
          Nothing here yet. Add some media to your Jellyfin libraries and it will show up here.
        </Text>
      ) : null}
      {rows.map((row) => (
        <Shelf key={row.key} title={row.title} data={row.items} keyExtractor={(item) => item.Id ?? ''} renderItem={({ item }) => <ItemCard item={item} shape={row.shape} />} />
      ))}
    </ScrollView>
  );
}
