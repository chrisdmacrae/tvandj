import { ActivityIndicator, ScrollView } from 'react-native';
import { Shelf, Text, colors, spacing, useLayout } from '@tv-and-j/design-system';
import { useMusicPlaylists, useRecentAlbums, useRecentlyPlayedAlbums } from '@tv-and-j/core/jellyfin/music';
import { ItemCard } from '../../components/ItemCard';
import { SectionHeader } from '../../components/SectionHeader';
import { useBottomSpace } from '../../lib/chrome';

/** The music library: recent and new albums, and playlists. */
export default function Music() {
  const bottomSpace = useBottomSpace();
  const { gutter } = useLayout();
  const recent = useRecentAlbums();
  const played = useRecentlyPlayedAlbums().data ?? [];
  const playlists = useMusicPlaylists().data ?? [];
  const rows = [
    { key: 'played', title: 'Recently played', items: played },
    { key: 'recent', title: 'Recently added', items: recent.data ?? [] },
    { key: 'playlists', title: 'Playlists', items: playlists },
  ].filter((row) => row.items.length);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: bottomSpace + spacing.xl }}>
      <SectionHeader title="Music" />
      {recent.isPending ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xxxl }} /> : null}
      {!recent.isPending && !rows.length ? (
        <Text tone="secondary" style={{ paddingHorizontal: gutter }}>
          No music in your library yet.
        </Text>
      ) : null}
      {rows.map((row) => (
        <Shelf key={row.key} title={row.title} data={row.items} keyExtractor={(item) => item.Id ?? ''} renderItem={({ item }) => <ItemCard item={item} shape="square" />} />
      ))}
    </ScrollView>
  );
}
