import { Image } from 'expo-image';
import { blurhashAverage, toGlow } from '@tv-and-j/core/glow';

export { itemGlow } from '@tv-and-j/core/glow';

const remote = new Map<string, Promise<string | null>>();

/**
 * Glow colour for a remote image (e.g. a TMDB poster from downloadarr),
 * via expo-image's native BlurHash encoder. Cached per URL; null on web or
 * if the image can't be read.
 */
export function imageGlow(uri: string): Promise<string | null> {
  let pending = remote.get(uri);
  if (!pending) {
    pending = Image.generateBlurhashAsync(uri, [1, 1])
      .then((hash) => {
        const avg = hash ? blurhashAverage(hash) : null;
        return avg ? toGlow(avg) : null;
      })
      .catch(() => null);
    remote.set(uri, pending);
  }
  return pending;
}
