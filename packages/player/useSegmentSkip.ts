import { useEffect, useRef } from 'react';
import type { Segment } from '@tv-and-j/core/jellyfin/segments';
import type { PlaybackControls as Playback } from './types';

const LABELS: Record<string, string> = {
  Intro: 'Skip intro',
  Recap: 'Skip recap',
  Outro: 'Skip credits',
  Preview: 'Skip preview',
};

/**
 * The skippable segment playing now, and a way to skip it. With auto-skip on,
 * intros and recaps are jumped over once each; scrubbing back into one plays it.
 */
export function useSegmentSkip(playback: Playback, segments: Segment[], { enabled, autoSkip }: { enabled: boolean; autoSkip: boolean }) {
  const { currentTime, isPlaying, seekTo } = playback;
  // Stop offering the skip in its last second, where it would do next to nothing.
  const active = enabled ? segments.find((s) => currentTime >= s.start && currentTime < s.end - 1) : undefined;
  const skipped = useRef(new Set<string>());

  useEffect(() => {
    if (!active || !autoSkip || !isPlaying || skipped.current.has(active.id)) return;
    if (active.type !== 'Intro' && active.type !== 'Recap') return;
    skipped.current.add(active.id);
    seekTo(active.end);
  }, [active, autoSkip, isPlaying, seekTo]);

  return {
    segment: active,
    label: active ? LABELS[active.type] : undefined,
    skip: () => {
      if (!active) return;
      skipped.current.add(active.id);
      seekTo(active.end);
    },
  };
}
