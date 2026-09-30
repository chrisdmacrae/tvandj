import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Avatar, Button, Text, spacing } from '@tv-and-j/design-system';
import { GlowScreen } from '../../components/GlowScreen';
import { CardGrid } from '../../components/ItemGrid';
import { MediaCard } from '../../components/MediaCard';
import { PageHeader } from '../../components/PageHeader';
import { tuneIn } from '../../lib/radio';
import { useDownloadarr } from '@tv-and-j/core/downloadarr/hooks';
import { posterUrl } from '@tv-and-j/core/jellyfin/images';
import { useItem } from '@tv-and-j/core/jellyfin/library';
import { fetchArtistSongs, fetchInstantMix, useArtistAlbums } from '@tv-and-j/core/jellyfin/music';
import { useMusic } from '../../music/MusicPlayer';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';

const PHOTO = 112;

/** An artist: photo, biography, Play all / Shuffle / Instant Mix, and their albums. */
export default function Artist() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, auth } = useAuthedSession();
  const music = useMusic();
  const artist = useItem(id).data;
  const albums = useArtistAlbums(id);
  const [busy, setBusy] = useState(false);
  const radio = !!useDownloadarr();
  const name = artist?.Name ?? '';

  const start = async (load: () => Promise<Parameters<typeof music.playQueue>[0]>, shuffle = false) => {
    if (busy) return;
    setBusy(true);
    try {
      const songs = await load();
      if (songs.length) {
        music.playQueue(songs, { shuffle });
        router.push('/now-playing');
      }
    } catch {
      // Nothing to play; stay put.
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlowScreen>
      <CardGrid
        items={albums.data ?? []}
        keyExtractor={(a) => a.Id ?? ''}
        renderCard={(a) => <MediaCard item={a} shape="square" />}
        loading={albums.isPending}
        empty={`No albums by ${name || 'them'} in your library.`}
        header={
          <PageHeader title={name}>
            <View style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' }}>
              {artist ? <Avatar name={name} imageUri={posterUrl(api, artist, PHOTO * 2)} size={PHOTO} /> : null}
              <View style={{ flex: 1, gap: spacing.sm, maxWidth: 640 }}>
                {artist?.Overview ? (
                  <Text tone="secondary" numberOfLines={4}>
                    {artist.Overview}
                  </Text>
                ) : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  <Button label="Play all" size="md" hasTVPreferredFocus onPress={() => start(() => fetchArtistSongs(api, auth.userId, id))} />
                  <Button label="Shuffle" size="md" variant="secondary" onPress={() => start(() => fetchArtistSongs(api, auth.userId, id), true)} />
                  <Button label="Instant Mix" size="md" variant="secondary" onPress={() => start(() => fetchInstantMix(api, auth.userId, id))} />
                  {/* downloadarr's radio: music like theirs that isn't in the library yet. */}
                  {radio && name ? <Button label="Artist radio" size="md" variant="secondary" onPress={() => tuneIn(name)} /> : null}
                </View>
              </View>
            </View>
            <Text variant="title" style={{ marginTop: spacing.lg }}>
              Albums
            </Text>
          </PageHeader>
        }
      />
    </GlowScreen>
  );
}
