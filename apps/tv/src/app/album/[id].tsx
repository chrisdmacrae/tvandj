import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Button, Text, spacing } from '@tv-and-j/design-system';
import { DeleteButton } from '../../components/DeleteButton';
import { tuneIn } from '../../lib/radio';
import { ScrobbleButton } from '../../components/ScrobbleButton';
import { useDownloadarr } from '@tv-and-j/core/downloadarr/hooks';
import { MusicCollection } from '../../components/MusicCollection';
import { SimilarAlbums } from '../../components/SimilarAlbums';
import { posterUrl } from '@tv-and-j/core/jellyfin/images';
import { useItem } from '@tv-and-j/core/jellyfin/library';
import { trackLength, useAlbumTracks } from '@tv-and-j/core/jellyfin/music';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** An album: its songs, Play / Shuffle / Instant Mix, a way to its artist, and albums like it. */
export default function Album() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useAuthedSession();
  const album = useItem(id).data;
  const tracks = useAlbumTracks(id).data;
  const artist = album?.AlbumArtists?.[0];
  // downloadarr's artist radio: music like this that isn't in the library yet.
  const artistName = artist?.Name ?? album?.AlbumArtist ?? undefined;
  const radioArtist = useDownloadarr() ? artistName : undefined;
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
      footer={<SimilarAlbums album={artistName && album?.Name ? { artistName, albumTitle: album.Name } : undefined} />}
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
      actions={
        <>
          {radioArtist ? <Button label="Artist radio" size="md" variant="secondary" onPress={() => tuneIn(radioArtist)} /> : null}
          <ScrobbleButton itemId={album?.Id} itemType={album?.Type} />
          <DeleteButton item={album} onDeleted={goBack} />
        </>
      }
    />
  );
}
