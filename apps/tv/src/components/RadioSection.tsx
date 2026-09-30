import { useEffect, useRef } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Button, Shelf, Text, colors, safeArea, spacing } from '@tv-and-j/design-system';
import { DownloadarrError } from '@tv-and-j/core/downloadarr/client';
import { useArtistRadio, useMusicDiscover } from '@tv-and-j/core/downloadarr/hooks';
import { sourceNames } from '@tv-and-j/core/downloadarr/music';
import { albumKey } from '@tv-and-j/core/jellyfin/music';
import { radioQueueId, usePreview } from '@tv-and-j/core/state/PreviewPlayer';
import { tuneIn, tuneOut } from '../lib/radio';
import { AlbumDiscoverCard } from './AlbumDiscoverCard';

const TOP_ARTISTS = 8;

/**
 * Artist radio on the Music tab: your top artists to tune in to, then the
 * station playing (30-second clips from Deezer and ListenBrainz) with the
 * albums it's drawn from, to request. Nothing without downloadarr's music.
 */
export function RadioSection({ artist, autoFocus }: { artist: string | undefined; autoFocus?: boolean }) {
  const topArtists = useMusicDiscover().data?.topArtists.slice(0, TOP_ARTISTS) ?? [];
  const station = useArtistRadio(artist);
  const preview = usePreview();
  const queueId = radioQueueId(artist ?? '');
  const onAir = preview.queue?.id === queueId && preview.index != null;

  // Play as soon as a station arrives: once per station, and not again when you come back to one that's loaded.
  const started = useRef<number>(0);
  useEffect(() => {
    if (!artist || !station.data || started.current === station.dataUpdatedAt) return;
    started.current = station.dataUpdatedAt;
    if (preview.queue?.id === queueId) return;
    preview.play({ id: queueId, title: `${artist} radio`, tracks: station.data.tracks });
  }, [artist, station.data, station.dataUpdatedAt, queueId, preview]);

  const close = () => {
    preview.stopQueue(queueId);
    tuneOut();
  };

  if (!topArtists.length && !artist) return null;

  return (
    <View>
      {topArtists.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: safeArea.horizontal, paddingBottom: spacing.lg, alignItems: 'center' }}>
          <Text variant="label" tone="secondary" style={{ marginRight: spacing.xs }}>
            Artist radio
          </Text>
          {topArtists.map((a) => (
            <Button
              key={a.name}
              label={a.name}
              size="sm"
              variant={a.name === artist ? 'primary' : 'secondary'}
              // While tuning in, focus waits on the artist's own chip; the station's controls take it once they're up.
              hasTVPreferredFocus={autoFocus && a.name === artist && station.isPending}
              onPress={() => tuneIn(a.name)}
            />
          ))}
        </ScrollView>
      ) : null}

      {artist ? (
        station.isPending ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', paddingHorizontal: safeArea.horizontal, paddingBottom: spacing.xl }}>
            <ActivityIndicator color={colors.accent} />
            <Text tone="secondary">Tuning in to {artist} radio…</Text>
          </View>
        ) : station.isError ? (
          <View style={{ gap: spacing.sm, alignItems: 'flex-start', paddingHorizontal: safeArea.horizontal, paddingBottom: spacing.xl }}>
            <Text tone="secondary">
              {station.error instanceof DownloadarrError && station.error.status === 404
                ? `Deezer and ListenBrainz have nothing to play for ${artist}.`
                : `Couldn’t start ${artist} radio. ${station.error.message}`}
            </Text>
            <Button label="Close" size="sm" variant="secondary" hasTVPreferredFocus={autoFocus} onPress={close} />
          </View>
        ) : station.data ? (
          <View>
            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', paddingHorizontal: safeArea.horizontal, paddingBottom: spacing.md }}>
              <Button
                label={onAir ? 'Stop' : 'Play'}
                size="sm"
                hasTVPreferredFocus={autoFocus}
                disabled={!station.data.tracks.length}
                onPress={() => (onAir ? preview.stop() : preview.play({ id: queueId, title: `${artist} radio`, tracks: station.data.tracks }))}
              />
              <Button label="Close" size="sm" variant="ghost" onPress={close} />
              <Text variant="caption" tone="tertiary" numberOfLines={1} style={{ flex: 1 }}>
                {onAir && preview.track
                  ? `${preview.loading ? 'Loading' : '♪'} ${preview.track.title} · ${preview.track.artistName}`
                  : `${station.data.tracks.length} tracks from ${sourceNames(station.data.sources)}`}
              </Text>
            </View>
            {station.data.albums.length ? (
              <Shelf
                title={`${station.data.artistName} radio`}
                data={station.data.albums}
                keyExtractor={(a) => albumKey(a.artistName, a.albumTitle)}
                renderItem={({ item }) => <AlbumDiscoverCard album={item} />}
              />
            ) : (
              <View style={{ height: spacing.xl }} />
            )}
          </View>
        ) : null
      ) : null}
    </View>
  );
}
