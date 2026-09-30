import { requireOptionalNativeModule } from 'expo';

/** One title for the Android TV home screen's "Continue watching" (Watch Next) row. */
export type WatchNextProgram = {
  /** Jellyfin item id; the row opens tvandj://item/<id>. */
  id: string;
  type: 'movie' | 'episode';
  /** The film, or the show for an episode. */
  title: string;
  episodeTitle?: string;
  season?: number;
  episode?: number;
  description?: string;
  /** 16:9 artwork. */
  imageUrl?: string;
  durationMs?: number;
  positionMs?: number;
  lastEngagementMs?: number;
};

type AndroidTvHomeModule = {
  isSupported(): boolean;
  setSearchConfig(config: { baseUrl: string; token: string; userId: string } | null): void;
  setWatchNext(programs: WatchNextProgram[]): Promise<number>;
};

const native = requireOptionalNativeModule<AndroidTvHomeModule>('AndroidTvHome');

/**
 * Android TV / Google TV only. Fire TV reserves its equivalents for Amazon
 * catalog partners, and older builds of the app don't have the module.
 */
export const isAndroidTvHomeSupported = (() => {
  try {
    return native?.isSupported() ?? false;
  } catch {
    return false;
  }
})();

export function setSearchConfig(config: { baseUrl: string; token: string; userId: string } | null) {
  if (isAndroidTvHomeSupported) native?.setSearchConfig(config);
}

export async function setWatchNext(programs: WatchNextProgram[]) {
  if (!isAndroidTvHomeSupported || !native) return;
  await native.setWatchNext(programs).catch(() => {});
}
