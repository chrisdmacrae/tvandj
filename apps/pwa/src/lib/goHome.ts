import { router } from 'expo-router';

/** Land on Home with the profile and sign-in screens gone from history. */
export function goHome() {
  if (router.canDismiss()) router.dismissAll();
  router.replace('/');
}
