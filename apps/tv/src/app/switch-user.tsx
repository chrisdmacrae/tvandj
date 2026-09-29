import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ArrowLeftIcon, Avatar, Button, IconButton, Text, TextField, colors, radii, safeArea, spacing } from '@tv-and-j/design-system';
import { SignInError, pollQuickConnect, signInWithPassword, startQuickConnect, type QuickConnectSession } from '../jellyfin/auth';
import { useAuthedSession } from '../state/SessionContext';

const POLL_MS = 3000;
const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** First sign-in for another user on this device: their password, or Quick Connect. */
export default function SwitchUser() {
  const { name = '' } = useLocalSearchParams<{ userId: string; name: string }>();
  const { jellyfin, server, signIn } = useAuthedSession();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [quick, setQuick] = useState<QuickConnectSession | null>(null);

  const finish = async (auth: Parameters<typeof signIn>[0]) => {
    await signIn(auth);
    goBack();
  };

  // Quick Connect in parallel: approving the code from their phone also works.
  useEffect(() => {
    if (!jellyfin) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    startQuickConnect(jellyfin, server.address)
      .then((session) => {
        if (cancelled || !session) return;
        setQuick(session);
        const poll = async () => {
          try {
            const auth = await pollQuickConnect(jellyfin, server.address, session.secret);
            if (auth && !cancelled) return finish(auth);
          } catch {
            // Keep polling through transient errors.
          }
          if (!cancelled) timer = setTimeout(poll, POLL_MS);
        };
        timer = setTimeout(poll, POLL_MS);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jellyfin, server.address]);

  const submit = async () => {
    if (!jellyfin || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await finish(await signInWithPassword(jellyfin, server.address, name, password));
    } catch (e) {
      setError(e instanceof SignInError ? e.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingHorizontal: safeArea.horizontal, paddingVertical: safeArea.vertical }}>
      <IconButton accessibilityLabel="Back" icon={(color) => <ArrowLeftIcon color={color} />} onPress={goBack} />
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xxxl }}>
        <View style={{ flex: 2, gap: spacing.md }}>
          <Avatar name={name} size={72} />
          <Text variant="headline">Switch to {name}</Text>
          <Text tone="secondary">Enter {name}’s Jellyfin password, or leave it blank if they don’t have one. You’ll only need to do this once on this TV.</Text>
        </View>
        <View style={{ flex: 3, gap: spacing.lg }}>
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            error={error}
            secureTextEntry
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          <Button label={busy ? 'Signing in…' : 'Sign in'} onPress={submit} disabled={busy} />
          {quick ? (
            <View style={{ gap: spacing.xs }}>
              <Text variant="caption" tone="secondary">
                Or approve this Quick Connect code from {name}’s phone:
              </Text>
              <Text
                variant="title"
                accessibilityLabel={`Quick Connect code ${quick.code.split('').join(' ')}`}
                style={{
                  alignSelf: 'flex-start',
                  letterSpacing: 6,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xs,
                  borderRadius: radii.md,
                  backgroundColor: colors.surfaceRaised,
                }}
              >
                {quick.code}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}
