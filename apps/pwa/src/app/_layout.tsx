import 'react-native-url-polyfill/auto';
// Before anything plays: tell the shared code what this browser can play.
import '../platform';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@tv-and-j/design-system';
import { SessionProvider, useSession } from '@tv-and-j/core/state/SessionContext';
import { SettingsProvider } from '@tv-and-j/core/state/SettingsContext';
import { RemoteTargetProvider } from '../lib/remoteTarget';

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.canvas, card: colors.surface, primary: colors.accent, text: colors.textPrimary },
};

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } },
});

function RootStack() {
  const { ready, auth, profileChosen } = useSession();
  if (!ready) return null;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas }, animation: 'fade' }}>
      <Stack.Protected guard={auth === null}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={auth !== null}>
        {/* Signed in: who's watching first. */}
        <Stack.Screen name="profiles" />
        <Stack.Screen name="switch-user" />
        <Stack.Protected guard={profileChosen}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="item/[id]" />
          <Stack.Screen name="album/[id]" />
          <Stack.Screen name="watch/[id]" />
          <Stack.Screen name="discover/[kind]/[tmdbId]" />
          <Stack.Screen name="library/[kind]" />
          <Stack.Screen name="collection/[id]" />
          <Stack.Screen name="remote/[id]" />
          <Stack.Screen name="settings" />
        </Stack.Protected>
      </Stack.Protected>
    </Stack>
  );
}

/** Registers the service worker (production builds only), which makes the app installable and quick to open. */
function useServiceWorker() {
  useEffect(() => {
    if (__DEV__ || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
}

export default function RootLayout() {
  useServiceWorker();
  return (
    <ThemeProvider value={theme}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <SettingsProvider>
              <RemoteTargetProvider>
                <RootStack />
              </RemoteTargetProvider>
            </SettingsProvider>
          </SessionProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
