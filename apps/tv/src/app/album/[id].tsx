import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Button, Text, spacing } from '@tv-and-j/design-system';
import { DeleteButton } from '../../components/DeleteButton';
import { MusicCollection } from '../../components/MusicCollection';
import { posterUrl } from '../../jellyfin/images';
import { useItem } from '../../jellyfin/library';
import { trackLength, useAlbumTracks } from '../../jellyfin/music';
import { useAuthedSession } from '../../state/SessionContext';

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** An album: its songs, Play / Shuffle / Instant Mix, and a way to its artist. */
export default function Album() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useAuthedSession();
  const album = useItem(id).data;
  const tracks = useAlbumTracks(id).data;
  const artist = album?.AlbumArtists?.[0];
  const minutes = album?.RunTimeTicks ? Math.round(album.RunTimeTicks / 600_000_000) : undefined;
  const meta = [album?.ProductionYear, tracks ? `${tracks.length} song${tracks.length === 1 ? '' : 's'}` : undefined, minutes ? `${minutes} min` : trackLength(album?.RunTimeTicks)]
    .filter(Boolean)
    .join(' · ');

  return (
    <MusicCollection
      item={album}
      artUri={album ? posterUrl(api, album, 440) : undefined}
      title={album?.Name ?? ''}
      tracks={tracks}
      details={
        <View style={{ gap: spacing.xs, alignItems: 'flex-start' }}>
          {artist?.Id ? (
            <Button label={artist.Name ?? 'Artist'} size="sm" variant="ghost" onPress={() => router.push({ pathname: '/artist/[id]', params: { id: artist.Id! } })} />
          ) : album?.AlbumArtist ? (
            <Text tone="secondary">{album.AlbumArtist}</Text>
          ) : null}
          {meta ? (
            <Text variant="caption" tone="tertiary">
              {meta}
            </Text>
          ) : null}
        </View>
      }
      actions={<DeleteButton item={album} onDeleted={goBack} />}
    />
  );
}
