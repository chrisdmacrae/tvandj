import { useLocalSearchParams } from 'expo-router';
import { Text } from '@tv-and-j/design-system';
import { MusicCollection } from '../../components/MusicCollection';
import { posterUrl } from '../../jellyfin/images';
import { useItem } from '../../jellyfin/library';
import { usePlaylistItems } from '../../jellyfin/music';
import { useAuthedSession } from '../../state/SessionContext';

/** A music playlist: its songs in order, with Play / Shuffle / Instant Mix. */
export default function Playlist() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useAuthedSession();
  const playlist = useItem(id).data;
  const items = usePlaylistItems(id).data;
  // Music only; anything else in a mixed playlist plays from its own page.
  const tracks = items?.filter((i) => i.MediaType === 'Audio');

  return (
    <MusicCollection
      item={playlist}
      artUri={playlist ? posterUrl(api, playlist, 440) : undefined}
      title={playlist?.Name ?? ''}
      tracks={tracks}
      showArtist
      numberByPosition
      details={
        tracks ? (
          <Text variant="caption" tone="tertiary">
            {tracks.length} song{tracks.length === 1 ? '' : 's'}
          </Text>
        ) : null
      }
    />
  );
}
