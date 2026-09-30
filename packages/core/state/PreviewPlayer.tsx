import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

/** A 30-second clip: an album track from Deezer, or a radio station's. */
export type PreviewTrack = {
  id: string | number;
  title: string;
  artistName: string;
  albumTitle?: string;
  coverUrl?: string;
  durationSeconds: number;
  /** Missing when Deezer has no clip for the track; those are skipped. */
  previewUrl?: string;
};

/** What's loaded: one album's previews, or an artist radio station. `id` tells them apart. */
export type PreviewQueue = { id: string; title: string; tracks: PreviewTrack[] };

/** The platform's audio: expo-video on the TV, an <audio> element on the web. */
export type PreviewAudio = {
  /** Swap in a clip; resolves once it's ready to play. */
  load: (url: string) => Promise<void>;
  play: () => void;
  pause: () => void;
  /** Done with it; never touched again afterwards. */
  release: () => void;
};

export type CreatePreviewAudio = (events: { onEnded: () => void; onError: () => void; onPlaying: () => void }) => PreviewAudio;

type PreviewState = {
  queue: PreviewQueue | null;
  /** The track playing (or loading), or null when stopped. */
  index: number | null;
  track: PreviewTrack | null;
  loading: boolean;
  /** Load a queue and play from `index` (default: the first clip). */
  play: (queue: PreviewQueue, index?: number) => void;
  stop: () => void;
  /** Stop only if `queueId` is what's loaded. */
  stopQueue: (queueId: string) => void;
};

const PreviewContext = createContext<PreviewState | null>(null);

type PreviewProviderProps = {
  createAudio: CreatePreviewAudio;
  /** A clip is starting: pause anything else that's playing. */
  onStart?: () => void;
  children: ReactNode;
};

/**
 * The app's one preview player, for Deezer clips of albums that aren't in the
 * library and for artist radio. One clip at a time, running on to the next;
 * lives at the root so a station keeps playing while you browse.
 */
export function PreviewProvider({ createAudio, onStart, children }: PreviewProviderProps) {
  const [queue, setQueue] = useState<PreviewQueue | null>(null);
  const [index, setIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  // The platform player lives in a ref, dropped on cleanup and never touched after.
  const audio = useRef<PreviewAudio | null>(null);
  const live = useRef({ queue, index, onStart });
  live.current = { queue, index, onStart };
  const playFrom = useRef<(q: PreviewQueue, from: number) => void>(() => {});

  playFrom.current = (q, from) => {
    const a = audio.current;
    const next = q.tracks.findIndex((t, i) => i >= from && !!t.previewUrl);
    if (!a || next < 0) {
      a?.pause();
      setIndex(null);
      setLoading(false);
      return;
    }
    live.current.onStart?.();
    setQueue(q);
    setIndex(next);
    setLoading(true);
    live.current = { ...live.current, queue: q, index: next };
    a.load(q.tracks[next].previewUrl!)
      .then(() => {
        // Something else was picked while this loaded.
        if (audio.current !== a || live.current.queue !== q || live.current.index !== next) return;
        a.play();
      })
      .catch(() => live.current.queue === q && live.current.index === next && playFrom.current(q, next + 1));
  };

  useEffect(() => {
    const advance = () => {
      const { queue: q, index: i } = live.current;
      if (q && i != null) playFrom.current(q, i + 1);
    };
    const a = createAudio({ onEnded: advance, onError: advance, onPlaying: () => setLoading(false) });
    audio.current = a;
    return () => {
      audio.current = null;
      a.pause();
      a.release();
    };
  }, [createAudio]);

  const play = useCallback((q: PreviewQueue, from = 0) => playFrom.current(q, from), []);
  const stop = useCallback(() => {
    audio.current?.pause();
    setIndex(null);
    setLoading(false);
    live.current = { ...live.current, index: null };
  }, []);
  const stopQueue = useCallback((queueId: string) => live.current.queue?.id === queueId && stop(), [stop]);

  const value = useMemo(
    () => ({ queue, index, track: queue && index != null ? (queue.tracks[index] ?? null) : null, loading, play, stop, stopQueue }),
    [queue, index, loading, play, stop, stopQueue],
  );
  return <PreviewContext value={value}>{children}</PreviewContext>;
}

/** A radio station's queue id; the Music tab and the on-air indicators agree on it. */
export const radioQueueId = (artist: string) => `radio:${artist}`;

/** The artist whose station is playing, or null. */
export function useOnAirRadio() {
  const { queue, index } = usePreview();
  return queue?.id.startsWith('radio:') && index != null ? queue.id.slice('radio:'.length) : null;
}

export function usePreview() {
  const value = use(PreviewContext);
  if (!value) throw new Error('usePreview outside PreviewProvider');
  return value;
}

/**
 * An album page's previews: play or stop a track, or the whole album. They
 * stop when the page loses focus (`focused`); a radio station doesn't.
 */
export function useAlbumPreviews(queue: PreviewQueue, focused: boolean) {
  const preview = usePreview();
  const mine = preview.queue?.id === queue.id;
  const playing = mine ? preview.index : null;
  const { stopQueue } = preview;
  useEffect(() => {
    if (!focused) stopQueue(queue.id);
  }, [focused, queue.id, stopQueue]);
  return {
    playing,
    loading: mine && preview.loading,
    available: queue.tracks.some((t) => !!t.previewUrl),
    /** Play a track's preview, or stop it if it's the one playing. */
    toggle: (index: number) => (playing === index ? preview.stop() : preview.play(queue, index)),
    stop: () => stopQueue(queue.id),
  };
}
