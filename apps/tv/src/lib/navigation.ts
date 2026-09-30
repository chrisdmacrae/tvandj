import { router, type Href } from 'expo-router';

/**
 * Where a deep link (a Continue Watching tile or search result on the Android
 * TV home screen) wanted to go, held while "Who's watching?" is up.
 */
let pending: Href | null = null;

/** Hold a tvandj:// link until a profile is chosen. Only the app's own title and search links. */
export function rememberDeepLink(url: string | null) {
  if (!url) return;
  const match = url.match(/^tvandj:\/\/(item\/[^/?#]+|search)(\?[^#]*)?/);
  if (match) pending = `/${match[1]}${match[2] ?? ''}` as Href;
}

/**
 * Land on Home with nothing behind it: after choosing who's watching, the
 * profile screens (and a sign-in on top of them) shouldn't be one Back away.
 * If a deep link was waiting, carry on to it from there.
 */
export function goHome() {
  if (router.canDismiss()) router.dismissAll();
  router.replace('/');
  if (pending) {
    const target = pending;
    pending = null;
    router.push(target);
  }
}
