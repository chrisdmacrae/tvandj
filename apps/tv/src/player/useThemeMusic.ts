import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api';
import { useQuery } from '@tanstack/react-query';
import { createVideoPlayer, type VideoPlayer } from 'expo-video';
import { useEffect, useRef } from 'react';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';

const VOLUME = 0.5;
const FADE_MS = 1500;
const FADE_STEPS = 15;
const RELEASE_DELAY_MS = 500;

/** A title's theme song (a show's, for its episodes too), as a playable URL; undefined if it has none. */
export function useThemeSongUrl(item: BaseItemDto | undefined) {
  const { api, auth } = useAuthedSession();
  return useQuery({
    queryKey: ['themeSong', item?.Id, auth.userId],
    enabled: !!item?.Id,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data } = await getLibraryApi(api).getThemeSongs({ itemId: item!.Id!, userId: auth.userId, inheritFromParent: true });
      const song = data.Items?.[0];
      return song?.Id ? `${api.basePath}/Audio/${song.Id}/stream?static=true&api_key=${api.accessToken}` : null;
    },
  }).data ?? undefined;
}

/**
 * Loops a theme song quietly while `playing`, fading in and out rather than
 * cutting. Owns its player the same way usePlayback does (created and
 * released in an effect, never touched after release), since Expo Router runs
 * cleanups while a leaving screen can still render.
 */
export function useThemeMusic(url: string | undefined, playing: boolean) {
  const player = useRef<VideoPlayer | null>(null);
  const fade = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (!url) return;
    const p = createVideoPlayer({ uri: url });
    p.loop = true;
    p.volume = 0;
    player.current = p;
    return () => {
      clearInterval(fade.current);
      player.current = null;
      try {
        p.pause();
      } catch {
        // Already gone.
      }
      setTimeout(() => p.release(), RELEASE_DELAY_MS);
    };
  }, [url]);

  useEffect(() => {
    const p = player.current;
    if (!p) return;
    clearInterval(fade.current);
    const from = p.volume;
    const to = playing ? VOLUME : 0;
    if (playing) p.play();
    let step = 0;
    fade.current = setInterval(() => {
      // Released mid-fade (the screen closed): stop touching it.
      if (player.current !== p) return clearInterval(fade.current);
      step++;
      p.volume = from + ((to - from) * step) / FADE_STEPS;
      if (step >= FADE_STEPS) {
        clearInterval(fade.current);
        if (!playing) p.pause();
      }
    }, FADE_MS / FADE_STEPS);
    return () => clearInterval(fade.current);
  }, [playing, url]);
}
