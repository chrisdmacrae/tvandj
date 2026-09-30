import type { CreatePreviewAudio } from '@tv-and-j/core/state/PreviewPlayer';

/** Deezer clips on a plain <audio>. */
export const createPreviewAudio: CreatePreviewAudio = ({ onEnded, onError, onPlaying }) => {
  const a = new Audio();
  a.addEventListener('ended', onEnded);
  a.addEventListener('error', onError);
  a.addEventListener('playing', onPlaying);
  return {
    load: async (url) => {
      a.src = url;
    },
    // Rejected when the browser blocks it, or when the source is swapped mid-start (harmless).
    play: () => void a.play().catch((e: DOMException) => e.name !== 'AbortError' && onError()),
    pause: () => a.pause(),
    release: () => {
      a.removeEventListener('ended', onEnded);
      a.removeEventListener('error', onError);
      a.removeEventListener('playing', onPlaying);
      a.removeAttribute('src');
    },
  };
};
