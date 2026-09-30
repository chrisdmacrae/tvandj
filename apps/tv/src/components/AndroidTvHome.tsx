import { useEffect } from 'react';
import { setSearchConfig, setWatchNext, isAndroidTvHomeSupported } from '../../modules/jellyfin-discovery/androidTv';
import { landscapeUrl } from '@tv-and-j/core/jellyfin/images';
import { useContinueWatching } from '@tv-and-j/core/jellyfin/library';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';

const TICKS_PER_MS = 10_000;

/**
 * Keeps the Android TV home screen in step with whoever's watching: their
 * Continue Watching in the launcher's row, and their library behind the
 * system search. Renders nothing; does nothing on Fire TV.
 */
export function AndroidTvHome() {
  const { api, auth } = useAuthedSession();
  const resume = useContinueWatching().data;

  useEffect(() => {
    if (!isAndroidTvHomeSupported) return;
    setSearchConfig({ baseUrl: api.basePath, token: api.accessToken, userId: auth.userId });
  }, [api, auth.userId]);

  useEffect(() => {
    if (!isAndroidTvHomeSupported || !resume) return;
    setWatchNext(
      resume
        .filter((item) => item.Id && (item.Type === 'Movie' || item.Type === 'Episode'))
        .map((item) => ({
          id: item.Id!,
          type: item.Type === 'Episode' ? 'episode' : 'movie',
          title: (item.Type === 'Episode' ? item.SeriesName : item.Name) ?? '',
          episodeTitle: item.Type === 'Episode' ? (item.Name ?? undefined) : undefined,
          season: item.ParentIndexNumber ?? undefined,
          episode: item.IndexNumber ?? undefined,
          description: item.Overview ?? undefined,
          imageUrl: landscapeUrl(api, item, 640),
          durationMs: item.RunTimeTicks ? Math.round(item.RunTimeTicks / TICKS_PER_MS) : undefined,
          positionMs: item.UserData?.PlaybackPositionTicks ? Math.round(item.UserData.PlaybackPositionTicks / TICKS_PER_MS) : undefined,
          lastEngagementMs: item.UserData?.LastPlayedDate ? Date.parse(item.UserData.LastPlayedDate) : undefined,
        })),
    );
  }, [api, resume]);

  return null;
}
