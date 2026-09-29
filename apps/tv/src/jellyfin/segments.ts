import type { BaseItemDto, MediaSegmentType } from '@jellyfin/sdk/lib/generated-client/models';
import { getMediaSegmentApi, getShowApi } from '@jellyfin/sdk/lib/utils/api';
import { useQuery } from '@tanstack/react-query';
import { useAuthedSession } from '../state/SessionContext';
import { TICKS_PER_SECOND } from './playback';

export type Segment = { id: string; type: MediaSegmentType; start: number; end: number };

const SKIPPABLE: MediaSegmentType[] = ['Intro', 'Recap', 'Outro', 'Preview'];

/**
 * Intros, recaps, credits and previews in an item, in seconds. Jellyfin
 * detects these with a plugin (e.g. Intro Skipper); without one, or on
 * servers older than 10.10, there are none and nothing offers a skip.
 */
export function useSegments(itemId: string | undefined) {
  const { api } = useAuthedSession();
  return useQuery({
    queryKey: ['segments', itemId],
    enabled: !!itemId,
    staleTime: Infinity,
    queryFn: async (): Promise<Segment[]> => {
      try {
        const { data } = await getMediaSegmentApi(api).getItemSegments({ itemId: itemId!, includeSegmentTypes: SKIPPABLE });
        return (data.Items ?? [])
          .filter((s) => s.Id && s.Type && s.EndTicks != null && s.StartTicks != null && s.EndTicks > s.StartTicks)
          .map((s) => ({ id: s.Id!, type: s.Type!, start: s.StartTicks! / TICKS_PER_SECOND, end: s.EndTicks! / TICKS_PER_SECOND }))
          .sort((a, b) => a.start - b.start);
      } catch {
        return [];
      }
    },
  });
}

/** The episode after this one in the show (crossing into the next season), or null at the end. */
export function useNextEpisode(item: BaseItemDto | undefined) {
  const { api, auth } = useAuthedSession();
  const episodeId = item?.Type === 'Episode' ? item.Id : undefined;
  return useQuery({
    queryKey: ['nextEpisode', episodeId],
    enabled: !!episodeId && !!item?.SeriesId,
    queryFn: async () => {
      const { data } = await getShowApi(api).getEpisodes({
        seriesId: item!.SeriesId!,
        userId: auth.userId,
        adjacentTo: episodeId,
        fields: ['Overview', 'PrimaryImageAspectRatio'],
      });
      const episodes = data.Items ?? [];
      const at = episodes.findIndex((e) => e.Id === episodeId);
      return (at >= 0 ? episodes[at + 1] : undefined) ?? null;
    },
  });
}
