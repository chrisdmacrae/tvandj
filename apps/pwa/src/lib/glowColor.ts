import { toGlow } from '@tv-and-j/core/glow';

export { itemGlow } from '@tv-and-j/core/glow';

const remote = new Map<string, Promise<string | null>>();

/**
 * Glow colour for a remote image with no BlurHash (e.g. a TMDB poster from
 * downloadarr): the browser scales it to one pixel. Cached per URL; null if
 * the image can't be read (no CORS headers taint the canvas).
 */
export function imageGlow(uri: string): Promise<string | null> {
  let pending = remote.get(uri);
  if (!pending) {
    pending = new Promise<string | null>((resolve) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 1;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, 1, 1);
          const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
          resolve(toGlow([r, g, b]));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      // Its own URL: the card already loaded this image without CORS, and the
      // browser would answer a CORS request from that cached, unreadable copy.
      img.src = `${uri}${uri.includes('?') ? '&' : '?'}glow`;
    });
    remote.set(uri, pending);
  }
  return pending;
}
