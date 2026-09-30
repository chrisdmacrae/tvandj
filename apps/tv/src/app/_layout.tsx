import 'react-native-url-polyfill/auto';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Linking } from 'react-native';
import { rememberDeepLink } from '../lib/navigation';
import { colors } from '@tv-and-j/design-system';
import { AndroidTvHome } from '../components/AndroidTvHome';
import { Screensaver } from '../components/Screensaver';
import { MusicPlayerProvider } from '../music/MusicPlayer';
import { RemoteControl } from '../remote/RemoteControl';
import { SessionProvider, useSession } from '../state/SessionContext';
import { SettingsProvider } from '../state/SettingsContext';

// Dark navigation chrome so nothing flashes the default light theme.
const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.canvas, primary: colors.accent, text: colors.textPrimary },
};

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
});

function RootStack() {
  const { ready, auth, profileChosen } = useSession();

  // A home-screen tile or search result can open the app before anyone's picked a profile;
  // hold where it was going until they have (see goHome).
  useEffect(() => {
    if (profileChosen) return;
    Linking.getInitialURL().then(rememberDeepLink).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => rememberDeepLink(url));
    return () => sub.remove();
  }, [profileChosen]);
  // Wait for storage so we don't flash onboarding at returning users.
  if (!ready) return null;

  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
        <Stack.Protected guard={auth === null}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={auth !== null}>
          {/* Signed in: first, who's watching (and their PIN, if any). */}
          <Stack.Screen name="profiles" options={{ animation: 'fade' }} />
          <Stack.Screen name="switch-user" options={{ animation: 'fade' }} />
          <Stack.Protected guard={profileChosen}>
            <Stack.Screen name="(browse)" />
            <Stack.Screen name="item/[id]" options={{ animation: 'fade' }} />
            <Stack.Screen name="discover/[kind]/[tmdbId]" options={{ animation: 'fade' }} />
            <Stack.Screen name="settings" options={{ animation: 'fade' }} />
            <Stack.Screen name="search" options={{ animation: 'fade' }} />
            <Stack.Screen name="library/[kind]" options={{ animation: 'fade' }} />
            <Stack.Screen name="collection/[id]" options={{ animation: 'fade' }} />
            <Stack.Screen name="person/[id]" options={{ animation: 'fade' }} />
            <Stack.Screen name="people/[tmdbId]" options={{ animation: 'fade' }} />
          <Stack.Screen name="album/[id]" options={{ animation: 'fade' }} />
          <Stack.Screen name="artist/[id]" options={{ animation: 'fade' }} />
          <Stack.Screen name="playlist/[id]" options={{ animation: 'fade' }} />
          <Stack.Screen name="now-playing" options={{ animation: 'fade' }} />
          </Stack.Protected>
        </Stack.Protected>
      </Stack>
      {auth !== null && profileChosen ? (
        <>
          <RemoteControl />
          <Screensaver />
          <AndroidTvHome />
        </>
      ) : null}
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider value={theme}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <SettingsProvider>
            {/* Always mounted, so music plays on across screens; idle until a profile is chosen. */}
            <MusicPlayerProvider>
              <StatusBar hidden />
              <RootStack />
            </MusicPlayerProvider>
          </SettingsProvider>
        </SessionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
