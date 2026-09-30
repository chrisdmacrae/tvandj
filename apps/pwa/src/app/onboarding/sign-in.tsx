import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { AvatarButton, Button, Text, TextField, colors, radii, spacing } from '@tv-and-j/design-system';
import { SignInError, pollQuickConnect, signInWithPassword, startQuickConnect, type QuickConnectSession } from '@tv-and-j/core/jellyfin/auth';
import { fetchPublicUsers, userAvatarUrl } from '@tv-and-j/core/jellyfin/users';
import { useSession } from '@tv-and-j/core/state/SessionContext';
import { AuthCard } from '../../components/AuthCard';

const POLL_MS = 3000;

/** Step 2: who you are. A public user, a password, or a Quick Connect code approved from another Jellyfin app. */
export default function SignIn() {
  const { jellyfin, server, signIn, forgetServer } = useSession();
  const publicApi = jellyfin && server ? jellyfin.createApi(server.address) : null;
  const users = useQuery({ queryKey: ['publicUsers', server?.address], enabled: !!publicApi, queryFn: () => fetchPublicUsers(publicApi!) }).data ?? [];
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [quick, setQuick] = useState<QuickConnectSession | null>(null);

  // Quick Connect runs alongside: approving the code elsewhere signs this browser in.
  useEffect(() => {
    if (!jellyfin || !server) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    startQuickConnect(jellyfin, server.address)
      .then((session) => {
        if (cancelled || !session) return;
        setQuick(session);
        const poll = async () => {
          try {
            const auth = await pollQuickConnect(jellyfin, server.address, session.secret);
            if (auth && !cancelled) return signIn(auth);
          } catch {
            // Keep polling through blips.
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
  }, [jellyfin, server, signIn]);

  const submit = async () => {
    if (!jellyfin || !server || busy) return;
    if (!username.trim()) return setError('Enter your username.');
    setBusy(true);
    setError(undefined);
    try {
      await signIn(await signInWithPassword(jellyfin, server.address, username.trim(), password));
    } catch (e) {
      setError(e instanceof SignInError ? e.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  };

  return (
    <AuthCard title={`Sign in to ${server?.name ?? 'Jellyfin'}`}>
      {users.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg }}>
          {users.map((user) => (
            <View key={user.Id} style={{ alignItems: 'center', gap: spacing.xs, width: 72 }}>
              <AvatarButton
                name={user.Name}
                imageUri={publicApi ? userAvatarUrl(publicApi, user) : undefined}
                size={56}
                accessibilityLabel={`Sign in as ${user.Name}`}
                onPress={() => setUsername(user.Name)}
              />
              <Text variant="caption" numberOfLines={1}>
                {user.Name}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <TextField label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} autoComplete="username" />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={submit}
        error={error}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        returnKeyType="go"
      />
      <Button label={busy ? 'Signing in…' : 'Sign in'} onPress={submit} disabled={busy} />
      {quick ? (
        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="secondary">
            Or in another Jellyfin app, open your profile, choose Quick Connect and enter:
          </Text>
          <Text
            variant="title"
            style={{ alignSelf: 'flex-start', letterSpacing: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radii.md, backgroundColor: colors.surfaceRaised }}
          >
            {quick.code}
          </Text>
        </View>
      ) : null}
      <Button label="Use a different server" size="sm" variant="ghost" onPress={() => forgetServer().then(() => router.replace('/onboarding'))} />
    </AuthCard>
  );
}
