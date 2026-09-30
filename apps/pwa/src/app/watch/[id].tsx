import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeftIcon, IconButton, Text, colors, spacing, useLayout } from '@tv-and-j/design-system';
import { posterUrl, backdropUrl } from '@tv-and-j/core/jellyfin/images';
import { useItem } from '@tv-and-j/core/jellyfin/library';
import { report, resolveStream, type Stream } from '@tv-and-j/core/jellyfin/playback';
import { useNextEpisode } from '@tv-and-j/core/jellyfin/segments';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';
import { useSettings } from '@tv-and-j/core/state/SettingsContext';
import { goBack } from '../../lib/nav';

const PROGRESS_INTERVAL_MS = 10_000;

/**
 * Plays a title (or a song) in the browser's own player: native controls, full
 * screen, picture-in-picture and AirPlay come with it. HLS plays natively on
 * iOS and Safari and through hls.js elsewhere. Progress is reported to
 * Jellyfin so resume points follow you to the TV. At the end: the next song in
 * the queue, the next episode, or back.
 *
 * start: begin here (seconds) instead of the resume point. queue: song ids to play in order.
 */
export default function Watch() {
  const { id, start, queue } = useLocalSearchParams<{ id: string; start?: string; queue?: string }>();
  const { api, auth } = useAuthedSession();
  const { gutter } = useLayout();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const item = useItem(id).data;
  const nextEpisode = useNextEpisode(item).data ?? null;
  const video = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<Stream | null>(null);
  const [error, setError] = useState<string>();

  // Ask Jellyfin how to play it here (direct, or converted to HLS).
  const itemId = item?.Id;
  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    setStream(null);
    setError(undefined);
    resolveStream(api, auth.userId, item, start != null ? { startSeconds: Number(start) || 0 } : {})
      .then((s) => !cancelled && setStream(s))
      .catch(() => !cancelled && setError('This can’t be played right now. Check that the server is reachable.'));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, auth.userId, itemId, start]);

  // Load it into the player (hls.js only where the browser can't play HLS itself).
  useEffect(() => {
    const el = video.current;
    if (!el || !stream) return;
    let cancelled = false;
    let destroy = () => {};
    const isHls = stream.url.includes('.m3u8');
    if (isHls && !el.canPlayType('application/vnd.apple.mpegurl')) {
      import('hls.js').then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) return setError('This browser can’t play this stream.');
        const hls = new Hls({ startPosition: stream.startSeconds || -1 });
        hls.on(Hls.Events.ERROR, (_, data) => data.fatal && setError('Playback stopped. Check your connection and try again.'));
        hls.on(Hls.Events.MANIFEST_PARSED, () => el.play().catch(() => {}));
        hls.loadSource(stream.url);
        hls.attachMedia(el);
        destroy = () => hls.destroy();
      });
    } else {
      el.src = stream.url;
      el.addEventListener('loadedmetadata', () => {
        if (stream.startSeconds > 0) el.currentTime = stream.startSeconds;
        el.play().catch(() => {}); // the browser may want a tap first; the controls are there
      }, { once: true });
      destroy = () => {
        el.removeAttribute('src');
        el.load();
      };
    }
    return () => {
      cancelled = true;
      destroy();
    };
  }, [stream]);

  // Tell Jellyfin: started (once it really plays), progress, stopped.
  const onEnd = useRef<() => void>(() => {});
  useEffect(() => {
    const el = video.current;
    if (!el || !stream) return;
    let started = false;
    const position = () => ({ seconds: el.currentTime, paused: el.paused, volume: el.volume, muted: el.muted });
    const onPlaying = () => {
      if (!started) report.start(api, stream, position());
      started = true;
    };
    const onPause = () => started && report.progress(api, stream, position());
    const onEnded = () => onEnd.current();
    el.addEventListener('playing', onPlaying);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    const timer = setInterval(() => started && !el.paused && report.progress(api, stream, position()), PROGRESS_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      if (started) {
        report.stopped(api, stream, position());
        queryClient.invalidateQueries({ queryKey: ['resume'] });
        queryClient.invalidateQueries({ queryKey: ['item'] });
        queryClient.invalidateQueries({ queryKey: ['queue'] });
      }
    };
  }, [api, stream, queryClient]);

  // What comes next when it finishes.
  const ids = queue ? queue.split(',') : [];
  const nextInQueue = ids[ids.indexOf(id) + 1];
  onEnd.current = () => {
    if (nextInQueue) router.replace({ pathname: '/watch/[id]', params: { id: nextInQueue, queue } });
    // The next episode only if this profile wants that (synced from the TV too).
    else if (nextEpisode?.Id && settings.playback.autoplayNext) router.replace({ pathname: '/watch/[id]', params: { id: nextEpisode.Id } });
    else goBack();
  };

  const isAudio = item?.MediaType === 'Audio';
  const poster = item ? (isAudio ? posterUrl(api, item, 1000) : backdropUrl(api, item, 1280)) : undefined;
  const title = item?.Type === 'Episode' ? `${item.SeriesName} · S${item.ParentIndexNumber}:E${item.IndexNumber} ${item.Name}` : item?.Name;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <video
        ref={video}
        controls
        playsInline
        autoPlay
        poster={poster}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
      />
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', top: insets.top + spacing.md, left: gutter, right: gutter, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
      >
        <IconButton accessibilityLabel="Back" icon={(color) => <ArrowLeftIcon color={color} />} onPress={goBack} />
        {title ? (
          <Text variant="label" numberOfLines={1} style={{ flex: 1, textShadowColor: '#000', textShadowRadius: 6 }}>
            {title}
          </Text>
        ) : null}
      </View>
      {error ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 96, alignItems: 'center' }}>
          <Text style={{ color: colors.danger, backgroundColor: colors.scrim, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}
