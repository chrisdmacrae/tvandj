import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView } from 'react-native';
import { Shelf, Text, colors, spacing, useLayout } from '@tv-and-j/design-system';
import type { AlbumRef } from '@tv-and-j/core/downloadarr/client';
import { useMusicDiscover, useRequestedAlbums } from '@tv-and-j/core/downloadarr/hooks';
import { MUSIC_ROWS } from '@tv-and-j/core/downloadarr/music';
import { albumKey, useMusicPlaylists, useRecentAlbums, useRecentlyPlayedAlbums } from '@tv-and-j/core/jellyfin/music';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { AlbumDiscoverCard } from '../../components/AlbumDiscoverCard';
import { ItemCard } from '../../components/ItemCard';
import { RadioSection } from '../../components/RadioSection';
import { SectionHeader } from '../../components/SectionHeader';
import { useBottomSpace } from '../../lib/chrome';

type Row =
  | { key: string; title: string; kind: 'library'; items: BaseItemDto[] }
  | { key: string; title: string; kind: 'discover'; items: AlbumRef[] };

/**
 * The music library: recent and new albums, and playlists. With downloadarr,
 * artist radio comes first (`?radio=Artist` tunes in), then albums you've
 * requested, and its recommendations (from your listening history) follow
 * what you've been playing.
 */
export default function Music() {
  const radio = useLocalSearchParams<{ radio?: string }>().radio || undefined;
  const bottomSpace = useBottomSpace();
  const { gutter } = useLayout();
  const recent = useRecentAlbums();
  const played = useRecentlyPlayedAlbums().data ?? [];
  const playlists = useMusicPlaylists().data ?? [];
  const requested = useRequestedAlbums();
  const discover = useMusicDiscover().data;
  const rows = (
    [
      { key: 'requested', title: 'Requested', kind: 'discover', items: requested },
      { key: 'played', title: 'Recently played', kind: 'library', items: played },
      { key: 'recent', title: 'Recently added', kind: 'library', items: recent.data ?? [] },
      ...MUSIC_ROWS.map(({ list, title }) => ({ key: list, title, kind: 'discover' as const, items: discover?.lists[list] ?? [] })),
      { key: 'playlists', title: 'Playlists', kind: 'library', items: playlists },
    ] satisfies Row[]
  ).filter((row) => row.items.length);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: bottomSpace + spacing.xl }}>
      <SectionHeader title="Music" />
      <RadioSection artist={radio} />
      {recent.isPending ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xxxl }} /> : null}
      {!recent.isPending && !rows.length ? (
        <Text tone="secondary" style={{ paddingHorizontal: gutter }}>
          No music in your library yet.
        </Text>
      ) : null}
      {rows.map((row) =>
        row.kind === 'library' ? (
          <Shelf key={row.key} title={row.title} data={row.items} keyExtractor={(item) => item.Id ?? ''} renderItem={({ item }) => <ItemCard item={item} shape="square" />} />
        ) : (
          <Shelf
            key={row.key}
            title={row.title}
            data={row.items}
            keyExtractor={(album) => albumKey(album.artistName, album.albumTitle)}
            renderItem={({ item: album }) => <AlbumDiscoverCard album={album} />}
          />
        ),
      )}
    </ScrollView>
  );
}
