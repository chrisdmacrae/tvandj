// Ambient glow colours from artwork, shared by both apps. Pixel-reading (for
// remote images without a BlurHash) is per platform and stays in each app.
import type { BaseItemDto, ImageType } from '@jellyfin/sdk/lib/generated-client/models';

const BASE83 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';

function decode83(s: string) {
  let value = 0;
  for (const c of s) value = value * 83 + BASE83.indexOf(c);
  return value;
}

/**
 * A BlurHash's average colour: characters 2–5 are its DC component, the
 * image's mean sRGB. No pixels to decode, so this is effectively free.
 */
export function blurhashAverage(hash: string): [number, number, number] | null {
  if (hash.length < 6) return null;
  const dc = decode83(hash.slice(2, 6));
  return [dc >> 16, (dc >> 8) & 255, dc & 255];
}

/**
 * Make an average colour usable as a glow: average colours are muddy and
 * often near-black, so keep the hue, lift saturation and lightness into a
 * range that reads as light against the dark canvas.
 */
export function toGlow([r, g, b]: [number, number, number]): string {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  // Greys stay grey (a white poster shouldn't glow violet); colours get pushed.
  const sat = s < 0.08 ? s : Math.min(0.85, Math.max(0.55, s));
  const light = Math.min(0.62, Math.max(0.48, l));
  return `hsl(${Math.round(h)}, ${Math.round(sat * 100)}%, ${Math.round(light * 100)}%)`;
}

/** Glow colour for a Jellyfin item from the BlurHash of the art its card shows. */
export function itemGlow(item: BaseItemDto, prefer: ImageType[] = ['Primary']): string | null {
  const hashes = item.ImageBlurHashes;
  if (!hashes) return null;
  for (const type of [...prefer, 'Primary', 'Thumb', 'Backdrop'] as ImageType[]) {
    const byTag = hashes[type];
    const first = byTag && Object.values(byTag)[0];
    const avg = first ? blurhashAverage(first) : null;
    if (avg) return toGlow(avg);
  }
  return null;
}
