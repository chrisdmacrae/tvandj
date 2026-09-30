import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, colors, spacing } from '@tv-and-j/design-system';
import { backdropUrl, posterUrl } from '@tv-and-j/core/jellyfin/images';
import { useItem } from '@tv-and-j/core/jellyfin/library';
import { useNextEpisode, useSegments } from '@tv-and-j/core/jellyfin/segments';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';
import { useSettings } from '@tv-and-j/core/state/SettingsContext';
import { PlayerOverlay } from '@tv-and-j/player/PlayerOverlay';
import { goBack } from '../../lib/nav';
import { useWebPlayback } from '../../player/useWebPlayback';

function episodeLine(item: { Type?: string | null; ParentIndexNumber?: number | null; IndexNumber?: number | null; Name?: string | null }) {
  if (item.Type !== 'Episode') return undefined;
  const code = item.ParentIndexNumber != null && item.IndexNumber != null ? `S${item.ParentIndexNumber}:E${item.IndexNumber}` : '';
  return [code, item.Name].filter(Boolean).join(' · ');
}

/**
 * Plays a title (or a song) with the same player as the TV: its controls,
 * scrubbing, audio & subtitles, Skip intro and the next-episode card, driven
 * by touch, mouse or keyboard. At the end: the next song in the queue, the
 * next episode (if this profile autoplays), or back.
 *
 * start: begin here (seconds) instead of the resume point. queue: song ids to play in order.
 */
export default function Watch() {
  const { id, start, queue } = useLocalSearchParams<{ id: string; start?: string; queue?: string }>();
  const { api } = useAuthedSession();
  const { settings } = useSettings();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const item = useItem(id).data;
  const nextEpisode = useNextEpisode(item).data ?? null;
  const upNextDismissed = useRef(false);

  const ids = queue ? queue.split(',') : [];
  const nextInQueue = ids[ids.indexOf(id) + 1];
  const playNext = useCallback(() => {
    if (nextEpisode?.Id) router.replace({ pathname: '/watch/[id]', params: { id: nextEpisode.Id } });
  }, [nextEpisode]);
  const onEnd = () => {
    if (nextInQueue) router.replace({ pathname: '/watch/[id]', params: { id: nextInQueue, queue } });
    else if (nextEpisode && settings.playback.autoplayNext && !upNextDismissed.current) playNext();
    else goBack();
  };

  const playback = useWebPlayback(item, { startAt: start != null ? Number(start) || 0 : undefined, onEnd });
  const segments = useSegments(playback.stream?.itemId).data ?? [];

  const isAudio = item?.MediaType === 'Audio';
  const poster = item ? (isAudio ? posterUrl(api, item, 1000) : backdropUrl(api, item, 1280)) : undefined;
  const title = item?.Type === 'Episode' ? (item.SeriesName ?? '') : (item?.Name ?? '');
  const subtitle = item ? (isAudio ? (item.Artists?.join(', ') ?? item.AlbumArtist ?? undefined) : episodeLine(item)) : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <video
        ref={playback.videoRef}
        playsInline
        poster={poster}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
      />
      <PlayerOverlay
        playback={playback}
        active={focused && !!item}
        title={title}
        subtitle={subtitle}
        nextEpisode={nextEpisode}
        segments={segments}
        autoSkipIntro={settings.playback.autoSkipIntro}
        autoplayNext={settings.playback.autoplayNext}
        onBack={goBack}
        onPlayNext={playNext}
        upNextDismissedRef={upNextDismissed}
        insets={insets}
      />
      {playback.error ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: '45%', alignItems: 'center' }}>
          <Text style={{ color: colors.danger, backgroundColor: colors.scrim, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>{playback.error}</Text>
        </View>
      ) : null}
    </View>
  );
}
