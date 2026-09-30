import { router } from 'expo-router';

/**
 * Land on Home with nothing behind it: after choosing who's watching, the
 * profile screens (and a sign-in on top of them) shouldn't be one Back away.
 */
export function goHome() {
  if (router.canDismiss()) router.dismissAll();
  router.replace('/');
}
