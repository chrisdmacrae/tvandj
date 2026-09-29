import { requireOptionalNativeModule } from 'expo';

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

const native = requireOptionalNativeModule<{ videoDecoders(): VideoDecoders }>('DeviceCapabilities');

/**
 * Where the native module isn't available (web, or an old build), assume only
 * H.264 so Jellyfin transcodes anything else rather than sending an unplayable stream.
 */
const CONSERVATIVE: VideoDecoders = {
  hevc: false,
  hevcMainMaxLevel: 0,
  hevcMain10MaxLevel: 0,
  vp9: false,
  av1: false,
  h264High10: false,
};

let cached: VideoDecoders | undefined;

export function videoDecoders(): VideoDecoders {
  cached ??= native?.videoDecoders() ?? CONSERVATIVE;
  return cached;
}
