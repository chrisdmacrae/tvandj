import { configurePlatform } from '@tv-and-j/core/platform';

/** Whether this browser can play a media type, natively or through Media Source Extensions (hls.js). */
function canPlay(type: string) {
  if (typeof document === 'undefined') return false;
  const native = document.createElement('video').canPlayType(type) !== '';
  const mse = typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(type);
  return native || mse;
}

// What this browser can play, so Jellyfin sends files as-is when it can and converts the rest.
configurePlatform({
  videoDecoders: () => ({
    // Off even where the browser decodes HEVC: Jellyfin's converted streams use MPEG-TS
    // segments, and browsers only play HEVC in fMP4, so claiming it breaks playback.
    hevc: false,
    hevcMainMaxLevel: 0,
    hevcMain10MaxLevel: 0,
    vp9: canPlay('video/webm; codecs="vp9"'),
    av1: canPlay('video/mp4; codecs="av01.0.08M.08"'),
    h264High10: false,
  }),
  audioCodecs: () => [
    'aac',
    'mp3',
    ...(canPlay('audio/webm; codecs="opus"') ? ['opus'] : []),
    ...(canPlay('audio/flac') ? ['flac'] : []),
    ...(canPlay('audio/mp4; codecs="ac-3"') ? ['ac3'] : []),
    ...(canPlay('audio/mp4; codecs="ec-3"') ? ['eac3'] : []),
  ],
  // Browsers can't open MKV; WebM where VP9 plays.
  directPlayContainers: () => ['mp4', 'm4v', ...(canPlay('video/webm; codecs="vp9"') ? ['webm'] : [])],
});
