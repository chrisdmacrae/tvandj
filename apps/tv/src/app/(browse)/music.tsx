import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Button, Shelf, Text, colors, safeArea, spacing } from '@tv-and-j/design-system';
import { AlbumDiscoverCard } from '../../components/AlbumDiscoverCard';
import { MediaCard } from '../../components/MediaCard';
import { RadioSection } from '../../components/RadioSection';
import type { AlbumRef } from '@tv-and-j/core/downloadarr/client';
import { useMusicDiscover, useRequestedAlbums } from '@tv-and-j/core/downloadarr/hooks';
import { MUSIC_ROWS } from '@tv-and-j/core/downloadarr/music';
import { albumKey, useAlbumArtists, useMusicPlaylists, useRecentAlbums, useRecentlyPlayedAlbums } from '@tv-and-j/core/jellyfin/music';

const ARTISTS_ROW = 24;

type Row =
  | { key: string; title: string; kind: 'library'; items: BaseItemDto[] }
  | { key: string; title: string; kind: 'discover'; items: AlbumRef[] };

/**
 * The music library: new and recent albums, artists and playlists, with the
 * whole library a button away. With downloadarr, artist radio comes first
 * (`?radio=Artist` tunes in), then albums you've requested, and its
 * recommendations (from your listening history) follow what you've been playing.
 */
export default function Music() {
  const radio = useLocalSearchParams<{ radio?: string }>().radio || undefined;
  const recent = useRecentAlbums();
  const played = useRecentlyPlayedAlbums().data ?? [];
  const artists = useAlbumArtists(ARTISTS_ROW).data?.pages[0]?.items ?? [];
  const playlists = useMusicPlaylists().data ?? [];
  const requested = useRequestedAlbums();
  const discover = useMusicDiscover().data;

  const rows = (
    [
      { key: 'requested', title: 'Requested', kind: 'discover', items: requested },
      { key: 'played', title: 'Recently played', kind: 'library', items: played },
      { key: 'recent', title: 'Recently added', kind: 'library', items: recent.data ?? [] },
      ...MUSIC_ROWS.map(({ list, title }) => ({ key: list, title, kind: 'discover' as const, items: discover?.lists[list] ?? [] })),
      { key: 'artists', title: 'Artists', kind: 'library', items: artists },
      { key: 'playlists', title: 'Playlists', kind: 'library', items: playlists },
    ] satisfies Row[]
  ).filter((row) => row.items.length);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: safeArea.vertical }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: safeArea.horizontal, paddingBottom: spacing.lg }}>
        <Button label="All albums" size="sm" variant="secondary" onPress={() => router.push({ pathname: '/library/[kind]', params: { kind: 'albums' } })} />
        <Button label="All artists" size="sm" variant="secondary" onPress={() => router.push({ pathname: '/library/[kind]', params: { kind: 'artists' } })} />
      </View>
      <RadioSection artist={radio} autoFocus={!!radio} />
      {recent.isPending ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xxxl }} /> : null}
      {!recent.isPending && !rows.length ? (
        <Text tone="secondary" style={{ paddingHorizontal: safeArea.horizontal }}>
          No music in your library yet.
        </Text>
      ) : null}
      {rows.map((row, r) =>
        row.kind === 'library' ? (
          <Shelf
            key={row.key}
            title={row.title}
            data={row.items}
            keyExtractor={(item) => item.Id ?? ''}
            renderItem={({ item, index }) => <MediaCard item={item} shape="square" hasTVPreferredFocus={!radio && r === 0 && index === 0} />}
          />
        ) : (
          <Shelf
            key={row.key}
            title={row.title}
            data={row.items}
            keyExtractor={(album) => albumKey(album.artistName, album.albumTitle)}
            renderItem={({ item: album, index }) => <AlbumDiscoverCard album={album} hasTVPreferredFocus={!radio && r === 0 && index === 0} />}
          />
        ),
      )}
    </ScrollView>
  );
}
