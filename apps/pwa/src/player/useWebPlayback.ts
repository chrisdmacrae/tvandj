import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { useQueryClient } from '@tanstack/react-query';
import type Hls from 'hls.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { report, resolveStream, type Stream, type StreamOptions } from '@tv-and-j/core/jellyfin/playback';
import { forwardsCredentials } from '@tv-and-j/core/network';
import { usePreview } from '@tv-and-j/core/state/PreviewPlayer';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';
import type { PlaybackControls } from '@tv-and-j/player/types';
import { useMusic } from '../music/MusicPlayer';

const PROGRESS_INTERVAL_MS = 10_000;
const VOLUME_STEP = 0.1;

/**
 * The web app's player, behind the same interface as the TV's, so both share
 * the player UI. Drives a <video> element: HLS natively on iOS and Safari,
 * through hls.js elsewhere; reports to Jellyfin so resume points follow you
 * to the TV. Changing audio or subtitles asks Jellyfin for a new stream at
 * the same spot (browsers can't reliably switch tracks inside a file).
 */
export function useWebPlayback(item: BaseItemDto | undefined, options: { startAt?: number; onEnd?: () => void } = {}): PlaybackControls & {
  videoRef: (el: HTMLVideoElement | null) => void;
  error: string | null;
} {
  const { api, auth } = useAuthedSession();
  const queryClient = useQueryClient();
  // A preview, radio station or song playing on would talk over this.
  const stopPreview = usePreview().stop;
  useEffect(() => stopPreview(), [stopPreview]);
  const pauseMusic = useMusic().pause;
  useEffect(() => pauseMusic(), [pauseMusic]);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<Stream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const onEnd = useRef(options.onEnd);
  onEnd.current = options.onEnd;
  // Where to start: the requested spot, then (after a track change) wherever we'd got to.
  const prefs = useRef<StreamOptions>(options.startAt != null ? { startSeconds: options.startAt } : {});

  // Ask Jellyfin how to play it here.
  const load = useCallback(
    async (opts: StreamOptions) => {
      if (!item) return;
      setError(null);
      try {
        setStream(await resolveStream(api, auth.userId, item, opts));
      } catch {
        setError('This can’t be played right now. Check that the server is reachable.');
      }
    },
    [api, auth.userId, item],
  );
  const itemId = item?.Id;
  useEffect(() => {
    load(prefs.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  // Put it in the player: hls.js where the browser can't play HLS itself. Subtitles delivered in
  // the HLS stream (text ones; picture ones are burned into the video) are switched on.
  useEffect(() => {
    if (!video || !stream) return;
    let cancelled = false;
    let hls: Hls | null = null;
    const wantsSubtitles = stream.subtitles.some((t) => t.index === stream.subtitleIndex && t.text);
    const start = () => {
      if (stream.startSeconds > 0) video.currentTime = stream.startSeconds;
      video.play().catch(() => {}); // the browser may want a tap first; the controls are there
      setSwitching(false);
    };
    if (stream.url.includes('.m3u8') && !video.canPlayType('application/vnd.apple.mpegurl')) {
      import('hls.js').then(({ default: HlsJs }) => {
        if (cancelled) return;
        if (!HlsJs.isSupported()) return setError('This browser can’t play this stream.');
        hls = new HlsJs({
          startPosition: stream.startSeconds || -1,
          // Behind a sign-in proxy (Cloudflare Access), playlists and segments need its cookie too.
          xhrSetup: forwardsCredentials() ? (xhr) => void (xhr.withCredentials = true) : undefined,
        });
        hls.on(HlsJs.Events.ERROR, (_, data) => data.fatal && setError('Playback stopped. Check your connection and try again.'));
        hls.on(HlsJs.Events.MANIFEST_PARSED, () => {
          if (hls) {
            hls.subtitleDisplay = wantsSubtitles;
            hls.subtitleTrack = wantsSubtitles ? 0 : -1;
          }
          video.play().catch(() => {});
          setSwitching(false);
        });
        hls.loadSource(stream.url);
        hls.attachMedia(video);
      });
    } else {
      video.src = stream.url;
      video.addEventListener(
        'loadedmetadata',
        () => {
          // Native HLS (Safari): the stream's subtitle track, if one was asked for.
          for (let i = 0; i < video.textTracks.length; i++) video.textTracks[i].mode = wantsSubtitles && i === 0 ? 'showing' : 'disabled';
          start();
        },
        { once: true },
      );
    }
    return () => {
      cancelled = true;
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [video, stream]);

  // Follow the player, and tell Jellyfin: started (once it really plays), progress, stopped.
  useEffect(() => {
    if (!video || !stream) return;
    let started = false;
    const position = () => ({ seconds: video.currentTime, paused: video.paused, volume: video.volume, muted: video.muted });
    const onTime = () => {
      setCurrentTime(video.currentTime);
      if (Number.isFinite(video.duration)) setDuration(video.duration);
    };
    const onPlaying = () => {
      setIsPlaying(true);
      if (!started) report.start(api, stream, position());
      started = true;
    };
    const onPause = () => {
      setIsPlaying(false);
      if (started) report.progress(api, stream, position());
    };
    const onVolume = () => setVolume(video.muted ? 0 : video.volume);
    const onEnded = () => onEnd.current?.();
    const events: [string, () => void][] = [
      ['timeupdate', onTime],
      ['durationchange', onTime],
      ['playing', onPlaying],
      ['pause', onPause],
      ['volumechange', onVolume],
      ['ended', onEnded],
    ];
    events.forEach(([name, fn]) => video.addEventListener(name, fn));
    const timer = setInterval(() => started && !video.paused && report.progress(api, stream, position()), PROGRESS_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      events.forEach(([name, fn]) => video.removeEventListener(name, fn));
      if (started) {
        report.stopped(api, stream, position());
        queryClient.invalidateQueries({ queryKey: ['resume'] });
        queryClient.invalidateQueries({ queryKey: ['item'] });
        queryClient.invalidateQueries({ queryKey: ['queue'] });
      }
    };
  }, [api, video, stream, queryClient]);

  const seekTo = useCallback(
    (seconds: number) => {
      if (!video) return;
      const end = Number.isFinite(video.duration) ? video.duration : Infinity;
      video.currentTime = Math.min(Math.max(0, seconds), end - 1);
    },
    [video],
  );
  const seekBy = useCallback((seconds: number) => video && seekTo(video.currentTime + seconds), [video, seekTo]);
  const pause = useCallback(() => video?.pause(), [video]);
  const resume = useCallback(() => video?.play().catch(() => {}), [video]);
  const togglePlay = useCallback(() => (video?.paused ? resume() : pause()), [video, pause, resume]);
  const changeVolume = useCallback(
    (delta: number) => {
      if (!video) return;
      video.muted = false;
      video.volume = Math.round(Math.min(1, Math.max(0, video.volume + delta)) * 10) / 10;
    },
    [video],
  );

  // A different track: a new stream from Jellyfin, from where we are.
  const selectTracks = useCallback(
    (change: { audioIndex?: number; subtitleIndex?: number }) => {
      if (!stream) return;
      const next = { audioIndex: stream.audioIndex, subtitleIndex: stream.subtitleIndex, ...change };
      const plain = next.subtitleIndex < 0 && next.audioIndex === stream.audio.find((t) => t.isDefault)?.index;
      prefs.current = { audioIndex: next.audioIndex, subtitleIndex: next.subtitleIndex, startSeconds: video?.currentTime ?? 0, directPlay: plain };
      setSwitching(true);
      load(prefs.current);
    },
    [stream, video, load],
  );

  return {
    videoRef: setVideo,
    error,
    stream,
    switching,
    currentTime,
    duration,
    isPlaying,
    volume,
    isAudio: item?.MediaType === 'Audio',
    togglePlay,
    pause,
    resume,
    seekTo,
    seekBy,
    volumeUp: useCallback(() => changeVolume(VOLUME_STEP), [changeVolume]),
    volumeDown: useCallback(() => changeVolume(-VOLUME_STEP), [changeVolume]),
    selectAudio: useCallback((audioIndex: number) => selectTracks({ audioIndex }), [selectTracks]),
    selectSubtitle: useCallback((subtitleIndex: number) => selectTracks({ subtitleIndex }), [selectTracks]),
  };
}
