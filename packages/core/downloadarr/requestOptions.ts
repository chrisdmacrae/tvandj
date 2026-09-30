import type { Codec, Language, Quality } from '../state/SettingsContext';

/** The choices for what downloadarr looks for when you request something. Both apps' Settings use these. */
export const QUALITIES: { value: Quality; label: string }[] = [
  { value: '1080p', label: '1080p' },
  { value: '4k', label: '4K' },
];

export const CODECS: { value: Codec; label: string }[] = [
  { value: 'h264', label: 'H.264' },
  { value: 'hevc', label: 'HEVC (H.265)' },
];

export const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'english', label: 'English' },
  { value: 'french', label: 'French' },
  { value: 'german', label: 'German' },
  { value: 'spanish', label: 'Spanish' },
  { value: 'japanese', label: 'Japanese' },
];

/** Normalise what someone typed into downloadarr's API address: kept as-is if it's already a full one, otherwise http://host:3001. */
export function downloadarrAddress(input: string, normalize: (s: string) => string) {
  const trimmed = input.trim();
  return /^https?:\/\/.+(:\d+|\/api)$/.test(trimmed) ? trimmed : normalize(trimmed);
}
