import 'react-native-url-polyfill/auto';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@tv-and-j/design-system';
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
  const { ready, auth } = useSession();
  // Wait for storage so we don't flash onboarding at returning users.
  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
      <Stack.Protected guard={auth === null}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={auth !== null}>
        <Stack.Screen name="(browse)" />
        <Stack.Screen name="item/[id]" options={{ animation: 'fade' }} />
        <Stack.Screen name="discover/[kind]/[tmdbId]" options={{ animation: 'fade' }} />
        <Stack.Screen name="settings" options={{ animation: 'fade' }} />
        <Stack.Screen name="search" options={{ animation: 'fade' }} />
        <Stack.Screen name="switch-user" options={{ animation: 'fade' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider value={theme}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <SettingsProvider>
            <StatusBar hidden />
            <RootStack />
          </SettingsProvider>
        </SessionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
