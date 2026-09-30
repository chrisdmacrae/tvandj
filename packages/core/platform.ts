/**
 * What the device underneath can do, supplied by each app at startup
 * (configurePlatform): the TV app asks its native module, the PWA asks the
 * browser. Until then, conservative defaults: H.264 and AAC/MP3 only, so
 * Jellyfin converts anything else rather than sending something unplayable.
 */

export type VideoDecoders = {
  hevc: boolean;
  /** Highest supported HEVC level as level_idc (150 = 5.0); 0 if unsupported. */
  hevcMainMaxLevel: number;
  /** Same for 10-bit HEVC; 0 means 10-bit HEVC can't be decoded at all. */
  hevcMain10MaxLevel: number;
  vp9: boolean;
  av1: boolean;
  h264High10: boolean;
};

export type Platform = {
  videoDecoders: () => VideoDecoders;
  /** Audio codecs (Jellyfin names) played by decoding or passthrough. */
  audioCodecs: () => string[];
  /** Containers the player opens as-is (a browser can't open MKV, a TV can). */
  directPlayContainers: () => string[];
  /** Find downloadarr on the local network, if the platform can broadcast. */
  discoverDownloadarr: (timeoutMs?: number) => Promise<string | null>;
};

const CONSERVATIVE_DECODERS: VideoDecoders = {
  hevc: false,
  hevcMainMaxLevel: 0,
  hevcMain10MaxLevel: 0,
  vp9: false,
  av1: false,
  h264High10: false,
};

let platform: Platform = {
  videoDecoders: () => CONSERVATIVE_DECODERS,
  audioCodecs: () => ['aac', 'mp3'],
  directPlayContainers: () => ['mp4', 'm4v'],
  discoverDownloadarr: async () => null,
};

/** Call once at startup, before anything plays. */
export function configurePlatform(overrides: Partial<Platform>) {
  platform = { ...platform, ...overrides };
}

export const videoDecoders = () => platform.videoDecoders();
export const audioCodecs = () => platform.audioCodecs();
export const directPlayContainers = () => platform.directPlayContainers();
export const discoverDownloadarr = (timeoutMs?: number) => platform.discoverDownloadarr(timeoutMs);
