import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { usePathname } from 'expo-router';
import { createVideoPlayer, type VideoPlayer } from 'expo-video';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { report, resolveStream, type Stream } from '../jellyfin/playback';
import { useRemoteKeys } from '../player/useRemoteKeys';
import { useRemoteHandlers } from '../remote/RemoteControl';
import { useSession } from '../state/SessionContext';

export type Repeat = 'off' | 'all' | 'one';

const PROGRESS_INTERVAL_MS = 10_000;
/** Previous restarts the song past this point, like every music player. */
const RESTART_THRESHOLD_S = 3;
const RELEASE_DELAY_MS = 500;

type MusicControls = {
  /** The song playing (or paused), or null when nothing's queued. */
  current: BaseItemDto | null;
  /** Play order (shuffled when shuffle is on). */
  queue: BaseItemDto[];
  index: number;
  isPlaying: boolean;
  shuffle: boolean;
  repeat: Repeat;
  error: string | null;
  /** Replace the queue and start playing, from `startIndex` (or shuffled). */
  playQueue: (items: BaseItemDto[], options?: { startIndex?: number; shuffle?: boolean }) => void;
  togglePlay: () => void;
  pause: () => void;
  resume: () => void;
  next: () => void;
  previous: () => void;
  jumpTo: (index: number) => void;
  seekTo: (seconds: number) => void;
  seekBy: (seconds: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  stop: () => void;
};

type MusicProgress = { position: number; duration: number };

const ControlsContext = createContext<MusicControls | null>(null);
const ProgressContext = createContext<MusicProgress>({ position: 0, duration: 0 });

function shuffled<T>(items: T[]) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The app's music player: one queue that keeps playing while you browse,
 * with shuffle, repeat and Jellyfin playback reporting (so plays count and
 * phones can follow and control it). Lives at the root for the whole signed-in
 * session, so screens coming and going never interrupt it. Video playback
 * stops it (see the item screen).
 */
export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  // Always wraps the navigator (so screens can use it) but only runs once someone's
  // chosen who's watching; before that, and between profiles, there's no player.
  const { api, auth, profileChosen } = useSession();
  const enabled = !!api && !!auth && profileChosen;
  const userId = auth?.userId;
  const pathname = usePathname();

  const [player, setPlayer] = useState<VideoPlayer | null>(null);
  const [original, setOriginal] = useState<BaseItemDto[]>([]);
  const [queue, setQueue] = useState<BaseItemDto[]>([]);
  const [index, setIndex] = useState(0);
  // Bumped to reload the same song (repeat one, or picking the song that's already up).
  const [loadNonce, setLoadNonce] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<Repeat>('off');
  const [progress, setProgress] = useState<MusicProgress>({ position: 0, duration: 0 });
  const [stream, setStream] = useState<Stream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = queue[index] ?? null;
  const live = useRef({ queue, index, repeat, stream });
  live.current = { queue, index, repeat, stream };
  const snapshot = useRef({ seconds: 0, paused: true, volume: 1, muted: false });
  const position = useCallback(() => snapshot.current, []);
  const reported = useRef<string | null>(null);
  const advance = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled || !api) return;
    const p = createVideoPlayer(null);
    p.timeUpdateEventInterval = 0.5;
    p.staysActiveInBackground = true;
    const subs = [
      p.addListener('timeUpdate', ({ currentTime }) => {
        snapshot.current = { ...snapshot.current, seconds: currentTime };
        setProgress({ position: currentTime, duration: p.duration });
      }),
      p.addListener('playingChange', ({ isPlaying: playing }) => {
        snapshot.current = { ...snapshot.current, paused: !playing };
        setIsPlaying(playing);
        const s = live.current.stream;
        if (playing && s && api && reported.current !== s.playSessionId) {
          reported.current = s.playSessionId;
          report.start(api, s, snapshot.current);
        }
      }),
      p.addListener('playToEnd', () => advance.current()),
      // A song that won't play: move on rather than stall the queue.
      p.addListener('statusChange', ({ status }) => status === 'error' && advance.current()),
    ];
    setPlayer(p);
    return () => {
      subs.forEach((s) => s.remove());
      p.pause();
      setTimeout(() => {
        setPlayer((cur) => (cur === p ? null : cur));
        setTimeout(() => p.release(), RELEASE_DELAY_MS);
      }, 0);
    };
  }, [api, enabled]);

  // A different profile (or signing out) starts with an empty queue.
  useEffect(() => {
    setQueue([]);
    setOriginal([]);
    setIndex(0);
    setStream(null);
  }, [userId]);

  // End of a song: repeat it, go to the next, wrap around, or stop.
  advance.current = () => {
    const { queue: q, index: i, repeat: r } = live.current;
    if (r === 'one') return setLoadNonce((n) => n + 1);
    if (i < q.length - 1) return setIndex(i + 1);
    if (r === 'all' && q.length) {
      setIndex(0);
      return setLoadNonce((n) => n + 1);
    }
    player?.pause();
  };

  // Load and play whichever song is up.
  const currentId = current?.Id;
  useEffect(() => {
    const item = live.current.queue[live.current.index];
    if (!player || !item?.Id || !api || !userId) return;
    let cancelled = false;
    setError(null);
    resolveStream(api, userId, item, { startSeconds: 0 })
      .then(async (next) => {
        if (cancelled) return;
        setStream(next);
        live.current.stream = next;
        await player.replaceAsync({
          uri: next.url,
          metadata: { title: item.Name ?? undefined, artist: item.AlbumArtist ?? item.Artists?.[0] ?? undefined },
        });
        if (cancelled) return;
        player.play();
      })
      .catch(() => {
        if (!cancelled) setError('Couldn’t play this song.');
      });
    return () => {
      cancelled = true;
    };
  }, [api, userId, player, currentId, loadNonce]);

  // Progress pings while playing; "stopped" when the song changes or the queue ends.
  useEffect(() => {
    if (!stream || !api) return;
    const timer = setInterval(() => {
      if (reported.current === stream.playSessionId) report.progress(api, stream, position());
    }, PROGRESS_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      if (reported.current === stream.playSessionId) report.stopped(api, stream, position());
    };
  }, [api, stream, position]);

  const playQueue = useCallback<MusicControls['playQueue']>((items, options = {}) => {
    const playable = items.filter((i) => i.Id);
    if (!playable.length) return;
    setOriginal(playable);
    setShuffle(!!options.shuffle);
    if (options.shuffle) {
      setQueue(shuffled(playable));
      setIndex(0);
    } else {
      setQueue(playable);
      setIndex(Math.min(options.startIndex ?? 0, playable.length - 1));
    }
    setLoadNonce((n) => n + 1);
  }, []);

  const togglePlay = useCallback(() => {
    if (!player || !live.current.queue.length) return;
    if (player.playing) player.pause();
    else player.play();
  }, [player]);
  const pause = useCallback(() => player?.pause(), [player]);
  const resume = useCallback(() => player?.play(), [player]);

  const jumpTo = useCallback((i: number) => {
    if (i < 0 || i >= live.current.queue.length) return;
    setIndex(i);
    setLoadNonce((n) => n + 1);
  }, []);

  const next = useCallback(() => {
    const { queue: q, index: i, repeat: r } = live.current;
    if (i < q.length - 1) jumpTo(i + 1);
    else if (r === 'all') jumpTo(0);
  }, [jumpTo]);

  const previous = useCallback(() => {
    if (!player) return;
    if (snapshot.current.seconds > RESTART_THRESHOLD_S || live.current.index === 0) player.currentTime = 0;
    else jumpTo(live.current.index - 1);
  }, [player, jumpTo]);

  const seekTo = useCallback(
    (seconds: number) => {
      if (!player) return;
      player.currentTime = Math.max(0, Math.min(seconds, (player.duration || Infinity) - 1));
    },
    [player],
  );
  const seekBy = useCallback((seconds: number) => seekTo(snapshot.current.seconds + seconds), [seekTo]);

  // Shuffle keeps the current song playing and shuffles the rest; turning it off
  // goes back to the original order, from the same song.
  const toggleShuffle = useCallback(() => {
    const { queue: q, index: i } = live.current;
    const song = q[i];
    if (!song) return setShuffle((s) => !s);
    if (!shuffle) {
      setQueue([song, ...shuffled(q.filter((_, k) => k !== i))]);
      setIndex(0);
    } else {
      setQueue(original);
      setIndex(Math.max(0, original.findIndex((s) => s.Id === song.Id)));
    }
    setShuffle(!shuffle);
  }, [shuffle, original]);

  const cycleRepeat = useCallback(() => setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')), []);

  const stop = useCallback(() => {
    player?.pause();
    setQueue([]);
    setOriginal([]);
    setIndex(0);
    setStream(null);
  }, [player]);

  // The remote's play/pause key works for music anywhere except a title page (its own player).
  useRemoteKeys(
    useCallback(
      (event) => {
        if (event.eventKeyAction === 0 || pathname.startsWith('/item/') || !live.current.queue.length) return;
        if (event.eventType === 'playPause' || event.eventType === 'play' || event.eventType === 'pause') togglePlay();
      },
      [pathname, togglePlay],
    ),
  );

  // Phones can control the music too, while nothing else has the floor.
  useRemoteHandlers(
    {
      pause,
      resume,
      togglePlay,
      stop,
      seekTo,
      seekBy,
      next,
      setVolume: (v) => player && (player.volume = v),
      changeVolume: (d) => player && (player.volume = Math.max(0, Math.min(1, player.volume + d))),
      toggleMute: (m) => player && (player.muted = m ?? !player.muted),
      selectAudio: () => {},
      selectSubtitle: () => {},
    },
    enabled && !!current,
  );

  const controls = useMemo<MusicControls>(
    () => ({
      current,
      queue,
      index,
      isPlaying,
      shuffle,
      repeat,
      error,
      playQueue,
      togglePlay,
      pause,
      resume,
      next,
      previous,
      jumpTo,
      seekTo,
      seekBy,
      toggleShuffle,
      cycleRepeat,
      stop,
    }),
    [current, queue, index, isPlaying, shuffle, repeat, error, playQueue, togglePlay, pause, resume, next, previous, jumpTo, seekTo, seekBy, toggleShuffle, cycleRepeat, stop],
  );

  return (
    <ControlsContext value={controls}>
      <ProgressContext value={progress}>{children}</ProgressContext>
    </ControlsContext>
  );
}

export function useMusic(): MusicControls {
  const ctx = use(ControlsContext);
  if (!ctx) throw new Error('useMusic must be used inside <MusicPlayerProvider>');
  return ctx;
}

/** Position and duration; changes twice a second, so only the Now Playing screen should listen. */
export function useMusicProgress() {
  return use(ProgressContext);
}
