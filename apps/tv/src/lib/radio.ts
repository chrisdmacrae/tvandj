import { router } from 'expo-router';

/** Start an artist's radio: stations live on the Music tab, which tunes in from `?radio=`. */
export function tuneIn(artist: string) {
  if (router.canDismiss()) router.dismissAll();
  router.replace({ pathname: '/music', params: { radio: artist } });
}

/** Turn the station off (the Music tab keeps its place). */
export function tuneOut() {
  router.setParams({ radio: '' });
}
