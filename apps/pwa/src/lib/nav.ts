import { router } from 'expo-router';

/** Back if there's somewhere to go back to (a shared or reloaded link has no history), otherwise Home. */
export const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
