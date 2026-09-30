import { router } from 'expo-router';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Button, Shelf, Text, colors, safeArea, spacing } from '@tv-and-j/design-system';
import { MediaCard } from '../../components/MediaCard';
import { useAlbumArtists, useMusicPlaylists, useRecentAlbums, useRecentlyPlayedAlbums } from '../../jellyfin/music';

const ARTISTS_ROW = 24;

/** The music library: new and recent albums, artists and playlists, with the whole library a button away. */
export default function Music() {
  const recent = useRecentAlbums();
  const played = useRecentlyPlayedAlbums().data ?? [];
  const artists = useAlbumArtists(ARTISTS_ROW).data?.pages[0]?.items ?? [];
  const playlists = useMusicPlaylists().data ?? [];

  const rows = [
    { key: 'played', title: 'Recently played', items: played },
    { key: 'recent', title: 'Recently added', items: recent.data ?? [] },
    { key: 'artists', title: 'Artists', items: artists },
    { key: 'playlists', title: 'Playlists', items: playlists },
  ].filter((row) => row.items.length);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: safeArea.vertical }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: safeArea.horizontal, paddingBottom: spacing.lg }}>
        <Button label="All albums" size="sm" variant="secondary" onPress={() => router.push({ pathname: '/library/[kind]', params: { kind: 'albums' } })} />
        <Button label="All artists" size="sm" variant="secondary" onPress={() => router.push({ pathname: '/library/[kind]', params: { kind: 'artists' } })} />
      </View>
      {recent.isPending ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xxxl }} /> : null}
      {!recent.isPending && !rows.length ? (
        <Text tone="secondary" style={{ paddingHorizontal: safeArea.horizontal }}>
          No music in your library yet.
        </Text>
      ) : null}
      {rows.map((row, r) => (
        <Shelf
          key={row.key}
          title={row.title}
          data={row.items}
          keyExtractor={(item) => item.Id ?? ''}
          renderItem={({ item, index }) => <MediaCard item={item} shape="square" hasTVPreferredFocus={r === 0 && index === 0} />}
        />
      ))}
    </ScrollView>
  );
}
