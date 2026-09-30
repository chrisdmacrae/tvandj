import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Button, ListItem, Text, colors, radii, spacing, useLayout } from '@tv-and-j/design-system';
import { posterUrl } from '@tv-and-j/core/jellyfin/images';
import { useItem } from '@tv-and-j/core/jellyfin/library';
import { trackLength, useAlbumTracks } from '@tv-and-j/core/jellyfin/music';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';
import { Page } from '../../components/Page';
import { tuneIn } from '../../lib/radio';
import { ScrobbleButton } from '../../components/ScrobbleButton';
import { useDownloadarr } from '@tv-and-j/core/downloadarr/hooks';

/** An album: artwork, details, and its songs. Playing a song queues the rest of the album after it. */
export default function Album() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useAuthedSession();
  const { isPhone, gutter } = useLayout();
  const album = useItem(id).data;
  const tracks = useAlbumTracks(id).data ?? [];
  const queue = tracks.map((t) => t.Id).filter(Boolean).join(',');
  const play = (index: number) => {
    const track = tracks[index];
    if (track?.Id) router.push({ pathname: '/watch/[id]', params: { id: track.Id, queue } });
  };
  const art = album ? posterUrl(api, album, 600) : undefined;
  // downloadarr's artist radio: music like this that isn't in the library yet.
  const radioArtist = useDownloadarr() ? (album?.AlbumArtists?.[0]?.Name ?? album?.AlbumArtist ?? undefined) : undefined;
  const size = isPhone ? 180 : 240;

  return (
    <Page back>
      <View style={{ paddingHorizontal: gutter, gap: spacing.xl }}>
        <View style={{ flexDirection: isPhone ? 'column' : 'row', alignItems: isPhone ? 'center' : 'flex-end', gap: spacing.lg }}>
          <View style={{ width: size, height: size, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.surface }}>
            {art ? <Image source={art} style={{ flex: 1 }} cachePolicy="memory-disk" /> : null}
          </View>
          <View style={{ flex: isPhone ? undefined : 1, gap: spacing.xs, alignItems: isPhone ? 'center' : 'flex-start' }}>
            <Text variant="headline" style={{ textAlign: isPhone ? 'center' : 'left' }}>
              {album?.Name}
            </Text>
            <Text tone="secondary">{[album?.AlbumArtist, album?.ProductionYear].filter(Boolean).join(' · ')}</Text>
            <View style={{ marginTop: spacing.sm, flexDirection: 'row', gap: spacing.sm }}>
              <Button label="Play" disabled={!tracks.length} onPress={() => play(0)} />
              {radioArtist ? <Button label="Artist radio" variant="secondary" onPress={() => tuneIn(radioArtist)} /> : null}
              <ScrobbleButton itemId={album?.Id} itemType={album?.Type} />
            </View>
          </View>
        </View>
        <View style={{ gap: spacing.xs }}>
          {tracks.map((track, i) => (
            // Scrobble sits beside the row, not in it: the row itself is a button (it plays).
            <View key={track.Id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <View style={{ flex: 1 }}>
                <ListItem title={`${track.IndexNumber ?? i + 1}. ${track.Name ?? ''}`} trailing={trackLength(track.RunTimeTicks)} onPress={() => play(i)} />
              </View>
              <ScrobbleButton itemId={track.Id} itemType={track.Type} compact />
            </View>
          ))}
        </View>
      </View>
    </Page>
  );
}
