import { useCallback, useEffect, useRef, useState } from 'react';
import type { Playback } from './usePlayback';

/** Scrub speeds in seconds of media per second. Each press in one direction steps up. */
export const SCRUB_RATES = [1, 2, 5, 10, 30, 60, 300];

const TICK_MS = 250;
/** How often the paused frame is refreshed while scrubbing; seeking HLS every tick is wasteful. */
const PREVIEW_SEEK_MS = 1000;

/**
 * DVR-style continuous scrub. Left/Right start rewinding/fast-forwarding at
 * 1s per second; further presses in the same direction speed it up through
 * SCRUB_RATES, the opposite direction slows it back down and then stops.
 * Playback pauses while scrubbing and resumes from the new spot on commit.
 */
export function useScrubber(playback: Playback) {
  const { seekTo, pause, resume } = playback;
  const [rate, setRate] = useState(0); // signed seconds-per-second; 0 = not scrubbing
  const [position, setPosition] = useState<number | null>(null);
  const pos = useRef(0);
  const active = useRef(false);
  const wasPlaying = useRef(false);

  // Keep the latest media values reachable from stable callbacks.
  const media = useRef({ currentTime: 0, duration: 0, isPlaying: false });
  media.current = { currentTime: playback.currentTime, duration: playback.duration, isPlaying: playback.isPlaying };
  const rateRef = useRef(rate);
  rateRef.current = rate;

  const commit = useCallback(() => {
    if (!active.current) return;
    active.current = false;
    seekTo(pos.current);
    setRate(0);
    setPosition(null);
    if (wasPlaying.current) resume();
  }, [seekTo, resume]);

  const step = useCallback(
    (direction: 1 | -1) => {
      const current = rateRef.current;
      if (current === 0) {
        pos.current = media.current.currentTime;
        wasPlaying.current = media.current.isPlaying;
        active.current = true;
        pause();
        setPosition(pos.current);
        setRate(direction * SCRUB_RATES[0]);
        return;
      }
      const at = SCRUB_RATES.indexOf(Math.abs(current));
      if (Math.sign(current) === direction) {
        setRate(direction * SCRUB_RATES[Math.min(at + 1, SCRUB_RATES.length - 1)]);
      } else if (at === 0) {
        commit();
      } else {
        setRate(Math.sign(current) * SCRUB_RATES[at - 1]);
      }
    },
    [pause, commit],
  );

  useEffect(() => {
    if (rate === 0) return;
    let sinceSeek = 0;
    const timer = setInterval(() => {
      const { duration } = media.current;
      const end = duration > 0 ? duration - 1 : Infinity;
      pos.current = Math.min(Math.max(0, pos.current + (rate * TICK_MS) / 1000), end);
      setPosition(pos.current);
      sinceSeek += TICK_MS;
      if (sinceSeek >= PREVIEW_SEEK_MS) {
        sinceSeek = 0;
        seekTo(pos.current);
      }
      // Hit either end: stop there rather than spinning against the edge.
      if (pos.current <= 0 || pos.current >= end) commit();
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [rate, seekTo, commit]);

  const label =
    rate === 0 ? undefined : `${rate < 0 ? '◀◀' : '▶▶'} ${formatRate(Math.abs(rate))}`;

  return { rate, position, scrubbing: rate !== 0, label, step, commit };
}

function formatRate(secondsPerSecond: number) {
  return secondsPerSecond >= 60 ? `${secondsPerSecond / 60}m/s` : `${secondsPerSecond}s/s`;
}

export type Scrubber = ReturnType<typeof useScrubber>;
