import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { posterUrl } from '@tv-and-j/core/jellyfin/images';
import { report, resolveStream, type Stream } from '@tv-and-j/core/jellyfin/playback';
import { PreviewProvider, usePreview } from '@tv-and-j/core/state/PreviewPlayer';
import { useSession } from '@tv-and-j/core/state/SessionContext';
import { createPreviewAudio } from '../lib/previewAudio';

export type Repeat = 'off' | 'all' | 'one';

const PROGRESS_INTERVAL_MS = 10_000;
/** Previous restarts the song past this point, like every music player. */
const RESTART_THRESHOLD_S = 3;
/**
 * A tenth of a second of silence. Played on the tap that starts the music, so
 * iOS lets this element play on its own afterwards (the song only arrives
 * after a round trip to the server, outside the tap).
 */
const SILENCE =
  'data:audio/wav;base64,UklGRogAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YWQAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';

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
 * The web app's music player, like the TV's: one queue on one <audio> that
 * keeps playing while you browse, with shuffle, repeat, Jellyfin playback
 * reporting and the lock screen's controls (Media Session). Lives at the root
 * for the whole signed-in session. Previews and radio live inside it: starting
 * one pauses the music, and the music starting stops them. Video pauses it
 * (see useWebPlayback).
 */
export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const { api, auth, profileChosen } = useSession();
  const enabled = !!api && !!auth && profileChosen;
  const userId = auth?.userId;
  const queryClient = useQueryClient();

  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
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
  const reported = useRef<string | null>(null);
  const unlocked = useRef(false);
  const advance = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled) return;
    const a = new Audio();
    a.preload = 'auto';
    const position = () => ({ seconds: a.currentTime, paused: a.paused, volume: a.volume, muted: a.muted });
    // The unlocking silence ending (or failing) isn't the song's business.
    const isSong = () => !!a.src && !a.src.startsWith('data:');
    const listeners: [string, () => void][] = [
      ['timeupdate', () => setProgress({ position: a.currentTime, duration: Number.isFinite(a.duration) ? a.duration : 0 })],
      [
        'playing',
        () => {
          setIsPlaying(true);
          const s = live.current.stream;
          if (s && api && reported.current !== s.playSessionId) {
            reported.current = s.playSessionId;
            report.start(api, s, position());
          }
        },
      ],
      ['pause', () => setIsPlaying(false)],
      ['ended', () => isSong() && advance.current()],
      // A song that won't play: move on rather than stall the queue.
      ['error', () => isSong() && advance.current()],
    ];
    listeners.forEach(([name, fn]) => a.addEventListener(name, fn));
    setAudio(a);
    return () => {
      listeners.forEach(([name, fn]) => a.removeEventListener(name, fn));
      a.pause();
      a.removeAttribute('src');
      a.load();
      unlocked.current = false;
      setAudio((cur) => (cur === a ? null : cur));
    };
  }, [api, enabled]);

  // A different profile (or signing out) starts with an empty queue.
  useEffect(() => {
    setQueue([]);
    setOriginal([]);
    setIndex(0);
    setStream(null);
  }, [userId]);

  // Called from the tap that starts the music: see SILENCE.
  const unlock = useCallback(() => {
    if (!audio || unlocked.current) return;
    unlocked.current = true;
    audio.src = SILENCE;
    audio.play().catch(() => {});
  }, [audio]);

  // End of a song: repeat it, go to the next, wrap around, or stop.
  advance.current = () => {
    const { queue: q, index: i, repeat: r } = live.current;
    if (r === 'one') return setLoadNonce((n) => n + 1);
    if (i < q.length - 1) return setIndex(i + 1);
    if (r === 'all' && q.length) {
      setIndex(0);
      return setLoadNonce((n) => n + 1);
    }
    audio?.pause();
  };

  // Load and play whichever song is up.
  const currentId = current?.Id;
  useEffect(() => {
    const item = live.current.queue[live.current.index];
    if (!audio || !item?.Id || !api || !userId) return;
    let cancelled = false;
    setError(null);
    resolveStream(api, userId, item, { startSeconds: 0 })
      .then((next) => {
        if (cancelled) return;
        setStream(next);
        live.current.stream = next;
        setProgress({ position: 0, duration: 0 });
        audio.src = next.url;
        // Blocked if the browser wants a tap first; the play button is there.
        audio.play().catch(() => {});
      })
      .catch(() => {
        if (!cancelled) setError('Couldn’t play this song.');
      });
    return () => {
      cancelled = true;
    };
  }, [api, userId, audio, currentId, loadNonce]);

  // Progress pings while playing; "stopped" when the song changes or the queue ends.
  useEffect(() => {
    if (!stream || !api || !audio) return;
    const position = () => ({ seconds: audio.currentTime, paused: audio.paused, volume: audio.volume, muted: audio.muted });
    const timer = setInterval(() => {
      if (reported.current === stream.playSessionId && !audio.paused) report.progress(api, stream, position());
    }, PROGRESS_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      if (reported.current === stream.playSessionId) {
        report.stopped(api, stream, position());
        queryClient.invalidateQueries({ queryKey: ['recentlyPlayedAlbums'] });
      }
    };
  }, [api, audio, stream, queryClient]);

  const playQueue = useCallback<MusicControls['playQueue']>(
    (items, options = {}) => {
      const playable = items.filter((i) => i.Id);
      if (!playable.length) return;
      unlock();
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
    },
    [unlock],
  );

  const pause = useCallback(() => audio?.pause(), [audio]);
  const resume = useCallback(() => void audio?.play().catch(() => {}), [audio]);
  const togglePlay = useCallback(() => {
    if (!audio || !live.current.queue.length) return;
    if (audio.paused) resume();
    else pause();
  }, [audio, pause, resume]);

  const jumpTo = useCallback(
    (i: number) => {
      if (i < 0 || i >= live.current.queue.length) return;
      unlock();
      setIndex(i);
      setLoadNonce((n) => n + 1);
    },
    [unlock],
  );

  const next = useCallback(() => {
    const { queue: q, index: i, repeat: r } = live.current;
    if (i < q.length - 1) jumpTo(i + 1);
    else if (r === 'all') jumpTo(0);
  }, [jumpTo]);

  const previous = useCallback(() => {
    if (!audio) return;
    if (audio.currentTime > RESTART_THRESHOLD_S || live.current.index === 0) audio.currentTime = 0;
    else jumpTo(live.current.index - 1);
  }, [audio, jumpTo]);

  const seekTo = useCallback(
    (seconds: number) => {
      if (!audio) return;
      const end = Number.isFinite(audio.duration) ? audio.duration : Infinity;
      audio.currentTime = Math.max(0, Math.min(seconds, end - 1));
    },
    [audio],
  );
  const seekBy = useCallback((seconds: number) => audio && seekTo(audio.currentTime + seconds), [audio, seekTo]);

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
    audio?.pause();
    setQueue([]);
    setOriginal([]);
    setIndex(0);
    setStream(null);
  }, [audio]);

  // The lock screen, headphones and the OS media keys.
  useEffect(() => {
    const session = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!session || !api) return;
    session.metadata = current
      ? new MediaMetadata({
          title: current.Name ?? '',
          artist: current.Artists?.join(', ') || current.AlbumArtist || '',
          album: current.Album ?? '',
          artwork: posterUrl(api, current, 512) ? [{ src: posterUrl(api, current, 512)!, sizes: '512x512' }] : [],
        })
      : null;
  }, [api, current]);
  useEffect(() => {
    const session = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!session || !current) return;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', resume],
      ['pause', pause],
      ['nexttrack', next],
      ['previoustrack', previous],
      ['seekto', (d) => d.seekTime != null && seekTo(d.seekTime)],
    ];
    const set = (h: MediaSessionActionHandler | null) =>
      handlers.forEach(([action, fn]) => {
        try {
          session.setActionHandler(action, h && fn);
        } catch {
          // Not every browser knows every action.
        }
      });
    set(() => {});
    return () => set(null);
  }, [current, resume, pause, next, previous, seekTo]);

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
      <ProgressContext value={progress}>
        {/* Deezer previews and artist radio: one clip at a time, app-wide, so a station plays on while you browse. */}
        <PreviewProvider createAudio={createPreviewAudio} onStart={() => isPlaying && pause()}>
          <StopPreviewForMusic playing={isPlaying} />
          {children}
        </PreviewProvider>
      </ProgressContext>
    </ControlsContext>
  );
}

function StopPreviewForMusic({ playing }: { playing: boolean }) {
  const { stop } = usePreview();
  useEffect(() => {
    if (playing) stop();
  }, [playing, stop]);
  return null;
}

export function useMusic(): MusicControls {
  const ctx = use(ControlsContext);
  if (!ctx) throw new Error('useMusic must be used inside <MusicPlayerProvider>');
  return ctx;
}

/** Position and duration; changes several times a second, so only what shows the timeline should listen. */
export function useMusicProgress() {
  return use(ProgressContext);
}
