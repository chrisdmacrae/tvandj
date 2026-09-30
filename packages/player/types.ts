import type { Stream } from '@tv-and-j/core/jellyfin/playback';

/**
 * What the shared player UI needs from a player. The TV app's (expo-video) and
 * the web app's (<video> + hls.js) both provide it, so both get the same
 * controls, scrubbing, tracks panel, skip intro and up next.
 */
export type PlaybackControls = {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  /** 0–1 */
  volume: number;
  isAudio: boolean;
  /** What's loaded: its audio and subtitle tracks, trickplay thumbnails. */
  stream: Stream | null;
  /** Reloading for a new audio or subtitle track. */
  switching: boolean;
  togglePlay: () => unknown;
  pause: () => unknown;
  resume: () => unknown;
  seekTo: (seconds: number) => unknown;
  seekBy: (seconds: number) => unknown;
  volumeUp: () => unknown;
  volumeDown: () => unknown;
  selectAudio: (index: number) => unknown;
  selectSubtitle: (index: number) => unknown;
};
