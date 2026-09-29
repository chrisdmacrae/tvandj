import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { useQueryClient } from '@tanstack/react-query';
import { createVideoPlayer, type VideoPlayer } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { audioCodecs } from '../../modules/jellyfin-discovery/capabilities';
import { report, resolveStream, stopTranscode, type Stream, type StreamOptions } from '../jellyfin/playback';
import { useAuthedSession } from '../state/SessionContext';

const PROGRESS_INTERVAL_MS = 10_000;
const VOLUME_STEP = 0.1;
const RELEASE_DELAY_MS = 500;
const PLAY_FAILED = 'This can’t be played right now. Check that the server is reachable.';

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
export function usePlayback(queue: BaseItemDto[] | undefined, options: { onEnd?: () => void; active?: boolean } = {}) {
  // false while another screen is on top: the stream is unloaded so this screen's
  // player doesn't keep buffering. Jellyfin runs one conversion per device, so two
  // players loading at once kill each other's streams.
  const active = options.active ?? true;
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
  const [switching, setSwitching] = useState(false);
  const current = queue?.[index];
  // Key loading on the id, not the object: refetches (e.g. after a progress report)
  // return fresh objects with new user data, which must not restart the stream.
  const currentId = current?.Id;
  const currentRef = useRef(current);
  currentRef.current = current;
  const onEnd = useRef(options.onEnd);
  onEnd.current = options.onEnd;

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

  const applyTracks = useCallback((p: VideoPlayer, st: Stream | null) => {
    if (!st) return;
    try {
      p.subtitleTrack = nativeSubtitle(p, st);
      const audio = nativeAudio(p, st);
      if (audio) p.audioTrack = audio;
    } catch {
      // Released mid-update; nothing to apply to.
    }
  }, []);

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
      p.addListener('statusChange', ({ status }) => {
        if (status === 'error') onPlayerError.current();
      }),
      p.addListener('availableSubtitleTracksChange', () => applyTracks(p, live.current.stream)),
      p.addListener('availableAudioTracksChange', () => applyTracks(p, live.current.stream)),
      p.addListener('playToEnd', () => {
        // ExoPlayer also reports "ended" while swapping sources (the empty player it
        // starts as counts as finished). Only a stream that has been started and played
        // through to its end counts.
        const { queue: q, index: i, started: wasStarted, stream: st } = live.current;
        const { seconds } = snapshot.current;
        if (!wasStarted || !st || seconds <= 0 || (p.duration > 0 && seconds < p.duration - 5)) return;
        if (q && i < q.length - 1) setIndex(i + 1);
        else onEnd.current?.();
      }),
    ];
    setPlayer(p);
    return () => {
      loadToken.current++;
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
  }, [applyTracks]);

  // Bumped on every load so a slow resolve can't land on top of a newer one.
  const loadToken = useRef(0);

  // Resolve and load each queue item, paused. If playback already started
  // (e.g. the next album track), continue straight into it.
  useEffect(() => {
    const item = currentRef.current;
    if (!currentId || !item || !player || !active) return;
    const token = ++loadToken.current;
    const cancelled = () => token !== loadToken.current;
    setStream(null);
    setError(null);
    resolveStream(api, auth.userId, item, trackPrefs.current)
      .then(async (next) => {
        if (cancelled()) return;
        live.current.stream = next;
        await player.replaceAsync({ uri: next.url, metadata: { title: item.Name ?? undefined } });
        if (cancelled()) return;
        applyTracks(player, next);
        setStream(next);
        if (live.current.started) {
          if (next.startSeconds > 0) player.currentTime = next.startSeconds;
          player.play();
        }
      })
      .catch(() => !cancelled() && setError(PLAY_FAILED));
    return () => {
      loadToken.current++;
    };
  }, [api, auth.userId, currentId, player, active, applyTracks]);

  // Covered by another screen: drop the stream (ending the session with Jellyfin at the
  // current spot). Coming back loads it again from there.
  useEffect(() => {
    if (active || !player) return;
    loadToken.current++;
    player.pause();
    setStream(null);
    setSwitching(false);
    // After the "stopped" report has read the position.
    const timer = setTimeout(() => {
      if (live.current.player === player) player.replaceAsync(null).catch(() => {});
    }, 0);
    return () => clearTimeout(timer);
  }, [active, player]);

  // Progress pings while playing; when the session ends (new stream, or we leave), a final
  // "stopped" report, and the server's conversion is shut down either way. Keyed on the
  // session, not the object: switching tracks inside the file keeps the same session.
  const sessionId = stream?.playSessionId;
  const streamRef = useRef(stream);
  streamRef.current = stream ?? streamRef.current;
  useEffect(() => {
    const s = streamRef.current;
    if (!sessionId || !s) return;
    const timer = setInterval(() => {
      const latest = streamRef.current;
      if (latest && isReported(latest)) report.progress(api, latest, position());
    }, PROGRESS_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      if (isReported(s)) {
        report.stopped(api, s, position());
        queryClient.invalidateQueries({ queryKey: ['resume'] });
        queryClient.invalidateQueries({ queryKey: ['item', s.itemId] });
        // A show's Play button reads its next-up episode and resume point from here.
        queryClient.invalidateQueries({ queryKey: ['queue'] });
      } else {
        stopTranscode(api, s);
      }
    };
  }, [api, sessionId, position, queryClient]);

  /** Begin playback from the resume point (or the beginning). Safe to call more than once. */
  const start = useCallback((options?: { fromStart?: boolean }) => {
    const p = live.current.player;
    if (!p || !stream || live.current.started) return;
    setStarted(true);
    live.current.started = true;
    const at = options?.fromStart ? 0 : stream.startSeconds;
    p.currentTime = at;
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

  // Choices carry over to the next episode in the queue (same show, usually same tracks).
  const trackPrefs = useRef<StreamOptions>({});

  /**
   * Switch audio or subtitles. When the file is playing untouched and the
   * track is inside it, the player switches natively. Anything else (a
   * transcoded stream, an external subtitle file, a picture subtitle that has
   * to be burned in) needs a new stream from the server at the same spot.
   */
  /**
   * Swap in a new stream for the current item at the same spot, keeping
   * playing or paused as it was. Used for track changes the file can't make
   * itself, and to fall back to the server when direct play fails.
   */
  const reload = useCallback(
    async (options: StreamOptions, failure: string) => {
      const p = live.current.player;
      const current = live.current.stream;
      const item = currentRef.current;
      if (!p || !current || !item) return;
      const token = ++loadToken.current;
      const started = live.current.started;
      const at = started ? snapshot.current.seconds : current.startSeconds;
      const wasPlaying = started && !snapshot.current.paused;
      setSwitching(true);
      try {
        const reloaded = await resolveStream(api, auth.userId, item, { ...options, startSeconds: at });
        if (token !== loadToken.current) return;
        live.current.stream = reloaded;
        await p.replaceAsync({ uri: reloaded.url, metadata: { title: item.Name ?? undefined } });
        if (token !== loadToken.current) return;
        applyTracks(p, reloaded);
        setStream(reloaded);
        if (started) p.currentTime = at;
        if (wasPlaying) p.play();
      } catch {
        if (token === loadToken.current) setError(failure);
      } finally {
        if (token === loadToken.current) setSwitching(false);
      }
    },
    [api, auth.userId, applyTracks],
  );

  // The player couldn't play the file as-is (e.g. an audio format the decoders
  // reported but can't open): ask the server for a stream it has converted. Once per item.
  const onPlayerError = useRef(() => {});
  onPlayerError.current = () => {
    const current = live.current.stream;
    if (current?.playMethod === 'DirectPlay') {
      reload({ ...trackPrefs.current, directPlay: false }, PLAY_FAILED);
    } else if (current) {
      setError(PLAY_FAILED);
    }
  };

  /**
   * Switch audio or subtitles. When the file is playing untouched and the
   * track is inside it, the player switches natively. Anything else (a
   * transcoded stream, an external subtitle file, a picture subtitle that has
   * to be burned in) needs a new stream from the server at the same spot.
   */
  const selectTracks = useCallback(
    (change: { audioIndex?: number; subtitleIndex?: number }) => {
      const p = live.current.player;
      const current = live.current.stream;
      if (!p || !current) return;
      const next: Stream = { ...current, ...change };
      trackPrefs.current = { audioIndex: next.audioIndex, subtitleIndex: next.subtitleIndex };

      if (current.playMethod === 'DirectPlay' && playsNatively(next)) {
        live.current.stream = next;
        setStream(next);
        applyTracks(p, next);
        return;
      }
      // Anything the file can't carry to the player comes through the server.
      return reload({ ...trackPrefs.current, directPlay: playsNatively(next) }, 'Couldn’t switch tracks. Check that the server is reachable.');
    },
    [applyTracks, reload],
  );

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
    /** Reloading the stream for a new audio or subtitle track. */
    switching,
    start,
    togglePlay,
    seekBy,
    seekTo,
    pause,
    resume,
    volumeUp: useCallback(() => changeVolume(VOLUME_STEP), [changeVolume]),
    volumeDown: useCallback(() => changeVolume(-VOLUME_STEP), [changeVolume]),
    selectAudio: useCallback((audioIndex: number) => selectTracks({ audioIndex }), [selectTracks]),
    selectSubtitle: useCallback((subtitleIndex: number) => selectTracks({ subtitleIndex }), [selectTracks]),
  };
}

/** Whether the file itself carries the chosen tracks in a form the player handles, so it can switch without the server. */
function playsNatively(s: Stream) {
  const audio = s.audio.find((t) => t.index === s.audioIndex);
  if (audio?.codec && !audioCodecs().includes(audio.codec)) return false;
  if (s.subtitleIndex < 0) return true;
  const sub = s.subtitles.find((t) => t.index === s.subtitleIndex);
  return !!sub && sub.text && !sub.external;
}

/**
 * The player's own track for the chosen subtitle. Direct play: the player
 * lists the file's embedded text subtitles in file order, so match by
 * position. A server stream carries only the chosen text subtitle (picture
 * subtitles are burned into the video), so it's the first one listed.
 */
function nativeSubtitle(p: VideoPlayer, s: Stream) {
  if (s.subtitleIndex < 0) return null;
  const available = p.availableSubtitleTracks;
  const chosen = s.subtitles.find((t) => t.index === s.subtitleIndex);
  if (!chosen?.text) return null;
  if (s.playMethod !== 'DirectPlay') return available[0] ?? null;
  const embedded = s.subtitles.filter((t) => t.text && !t.external);
  return available[embedded.findIndex((t) => t.index === chosen.index)] ?? null;
}

/** Direct play keeps every audio track in the file; pick the chosen one by position. */
function nativeAudio(p: VideoPlayer, s: Stream) {
  if (s.playMethod !== 'DirectPlay' || s.audioIndex == null) return null;
  const at = s.audio.findIndex((t) => t.index === s.audioIndex);
  return p.availableAudioTracks.length === s.audio.length ? (p.availableAudioTracks[at] ?? null) : null;
}

export type Playback = ReturnType<typeof usePlayback>;
