import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { useQueryClient } from '@tanstack/react-query';
import { createVideoPlayer, type SubtitleTrack, type VideoPlayer } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { report, resolveStream, type Stream } from '../jellyfin/playback';
import { useAuthedSession } from '../state/SessionContext';

const PROGRESS_INTERVAL_MS = 10_000;
const VOLUME_STEP = 0.1;
const RELEASE_DELAY_MS = 500;

/**
 * Owns one native player for a play queue (a single movie/episode, or an
 * album's tracks). Loads each item paused so the summary screen can decide
 * when playback begins, reports progress to Jellyfin so Continue Watching
 * stays accurate, and advances through the queue.
 *
 * The player is created and released inside an effect rather than with
 * useVideoPlayer: Expo Router hides screens it's leaving, which runs effect
 * cleanups (releasing the player) while the component can still re-render.
 * useVideoPlayer keeps handing back the released player in that window and
 * any access to it throws. Owning the lifecycle lets us drop the reference
 * at the moment of release, and rebuild if the screen is shown again.
 */
export function usePlayback(queue: BaseItemDto[] | undefined) {
  const { api, auth } = useAuthedSession();
  const queryClient = useQueryClient();

  const [player, setPlayer] = useState<VideoPlayer | null>(null);
  const [index, setIndex] = useState(0);
  const [stream, setStream] = useState<Stream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [subtitleTrack, setSubtitleTrack] = useState<SubtitleTrack | null>(null);
  const current = queue?.[index];
  // Key loading on the id, not the object: refetches (e.g. after a progress report)
  // return fresh objects with new user data, which must not restart the stream.
  const currentId = current?.Id;
  const currentRef = useRef(current);
  currentRef.current = current;

  // Latest values for timers and cleanups. Reports read the snapshot, never
  // the player, so they're safe after release.
  const live = useRef({ player, stream, started, index, queue });
  live.current = { player, stream, started, index, queue };
  const snapshot = useRef({ seconds: 0, paused: true, volume: 1, muted: false });
  const position = useCallback(() => snapshot.current, []);

  // Only talk to Jellyfin about a session once it has actually played. A stream
  // that never starts (unsupported format, network failure, leaving during the
  // preview countdown) must not send "stopped at 0:00", which wipes the resume point.
  const reportedSession = useRef<string | null>(null);
  const apiRef = useRef(api);
  apiRef.current = api;
  const isReported = (s: Stream) => reportedSession.current === s.playSessionId;

  useEffect(() => {
    const p = createVideoPlayer(null);
    p.timeUpdateEventInterval = 0.5;
    const subs = [
      p.addListener('timeUpdate', ({ currentTime: t }) => {
        snapshot.current = { ...snapshot.current, seconds: t };
        setCurrentTime(t);
        setDuration(p.duration);
      }),
      p.addListener('playingChange', ({ isPlaying: playing }) => {
        snapshot.current = { ...snapshot.current, paused: !playing };
        setIsPlaying(playing);
        const { stream: current, started: wanted } = live.current;
        if (playing && wanted && current && reportedSession.current !== current.playSessionId) {
          reportedSession.current = current.playSessionId;
          report.start(apiRef.current, current, snapshot.current);
        }
      }),
      p.addListener('volumeChange', ({ volume: v }) => {
        snapshot.current = { ...snapshot.current, volume: v };
        setVolume(v);
      }),
      p.addListener('availableSubtitleTracksChange', ({ availableSubtitleTracks }) => setSubtitleTracks(availableSubtitleTracks)),
      p.addListener('subtitleTrackChange', ({ subtitleTrack: track }) => setSubtitleTrack(track)),
      p.addListener('playToEnd', () => {
        const { queue: q, index: i } = live.current;
        if (q && i < q.length - 1) setIndex(i + 1);
      }),
    ];
    setPlayer(p);
    return () => {
      subs.forEach((s) => s.remove());
      p.pause();
      live.current.player = null;
      // Defer: drop the reference first so any VideoView still holding it unmounts,
      // then release the native player. Setting state synchronously inside this
      // cleanup also trips React during Fast Refresh. If the screen is shown again
      // a new player is created, and the functional update won't clobber it.
      setTimeout(() => {
        setPlayer((cur) => (cur === p ? null : cur));
        setTimeout(() => p.release(), RELEASE_DELAY_MS);
      }, 0);
    };
  }, []);

  // Resolve and load each queue item, paused. If playback already started
  // (e.g. the next album track), continue straight into it.
  useEffect(() => {
    const item = currentRef.current;
    if (!currentId || !item || !player) return;
    let cancelled = false;
    setStream(null);
    setError(null);
    resolveStream(api, auth.userId, item)
      .then(async (next) => {
        if (cancelled) return;
        await player.replaceAsync({ uri: next.url, metadata: { title: item.Name ?? undefined } });
        if (cancelled) return;
        // Subtitles start off, even if the stream marks one as default.
        player.subtitleTrack = null;
        setStream(next);
        if (live.current.started) player.play();
      })
      .catch(() => !cancelled && setError('This can’t be played right now. Check that the server is reachable.'));
    return () => {
      cancelled = true;
    };
  }, [api, auth.userId, currentId, player, position]);

  // Progress pings while playing; a final "stopped" report when the stream changes or we leave.
  useEffect(() => {
    if (!stream) return;
    const timer = setInterval(() => {
      if (isReported(stream)) report.progress(api, stream, position());
    }, PROGRESS_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      if (isReported(stream)) {
        report.stopped(api, stream, position());
        queryClient.invalidateQueries({ queryKey: ['resume'] });
        queryClient.invalidateQueries({ queryKey: ['item', stream.itemId] });
      }
    };
  }, [api, stream, position, queryClient]);

  /** Begin playback from the resume point. Safe to call more than once. */
  const start = useCallback(() => {
    const p = live.current.player;
    if (!p || !stream || live.current.started) return;
    setStarted(true);
    live.current.started = true;
    if (stream.startSeconds > 0) p.currentTime = stream.startSeconds;
    p.play(); // reported to Jellyfin once the player confirms it is actually playing
  }, [stream]);

  const togglePlay = useCallback(() => {
    const p = live.current.player;
    if (!p) return;
    if (!live.current.started) return start();
    if (p.playing) p.pause();
    else p.play();
    if (stream && isReported(stream)) report.progress(api, stream, position());
  }, [api, stream, position, start]);

  const seekTo = useCallback((seconds: number) => {
    const p = live.current.player;
    if (!p) return;
    const end = p.duration || Infinity;
    p.currentTime = Math.min(Math.max(0, seconds), end - 1);
  }, []);
  const pause = useCallback(() => live.current.player?.pause(), []);
  const resume = useCallback(() => live.current.player?.play(), []);

  const seekBy = useCallback((seconds: number) => {
    const p = live.current.player;
    if (!p) return;
    const end = p.duration || Infinity;
    p.currentTime = Math.min(Math.max(0, p.currentTime + seconds), end - 1);
  }, []);

  const changeVolume = useCallback((delta: number) => {
    const p = live.current.player;
    if (!p) return;
    p.muted = false;
    p.volume = Math.round(Math.min(1, Math.max(0, p.volume + delta)) * 10) / 10;
  }, []);

  /** Off → each available track in turn → off. */
  const cycleSubtitles = useCallback(() => {
    const p = live.current.player;
    if (!p) return;
    const tracks = p.availableSubtitleTracks;
    if (!tracks.length) return;
    const at = p.subtitleTrack ? tracks.findIndex((t) => t.id === p.subtitleTrack?.id) : -1;
    p.subtitleTrack = at + 1 < tracks.length ? tracks[at + 1] : null;
  }, []);

  return {
    /** null before creation and after release; render the VideoView only when set. */
    player,
    current,
    stream,
    error,
    started,
    isAudio: stream?.isAudio ?? current?.MediaType === 'Audio',
    isPlaying,
    currentTime,
    duration,
    volume,
    subtitleTracks,
    subtitleTrack,
    start,
    togglePlay,
    seekBy,
    seekTo,
    pause,
    resume,
    volumeUp: useCallback(() => changeVolume(VOLUME_STEP), [changeVolume]),
    volumeDown: useCallback(() => changeVolume(-VOLUME_STEP), [changeVolume]),
    cycleSubtitles,
  };
}

export type Playback = ReturnType<typeof usePlayback>;
