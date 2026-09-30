import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { AvatarButton, ListItem, Text, colors, radii, spacing } from '@tv-and-j/design-system';
import { WizardStep } from '../../components/WizardStep';
import { pollQuickConnect, startQuickConnect, type QuickConnectSession } from '@tv-and-j/core/jellyfin/auth';
import { fetchPublicUsers, userAvatarUrl } from '@tv-and-j/core/jellyfin/users';
import { useSession } from '@tv-and-j/core/state/SessionContext';

type State =
  | { status: 'starting' }
  | { status: 'waiting'; session: QuickConnectSession }
  | { status: 'unavailable' };

const POLL_MS = 3000;

export default function SignIn() {
  const { jellyfin, server, signIn, forgetServer } = useSession();
  const [state, setState] = useState<State>({ status: 'starting' });

  // Users the server lists on its sign-in screen (Jellyfin hides users by default, so often none).
  const publicApi = jellyfin && server ? jellyfin.createApi(server.address) : null;
  const users = useQuery({
    queryKey: ['publicUsers', server?.address],
    enabled: !!publicApi,
    queryFn: () => fetchPublicUsers(publicApi!),
  }).data ?? [];

  useEffect(() => {
    if (!jellyfin || !server) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    startQuickConnect(jellyfin, server.address)
      .then((session) => {
        if (cancelled) return;
        if (!session) return setState({ status: 'unavailable' });
        setState({ status: 'waiting', session });

        const poll = async () => {
          try {
            const auth = await pollQuickConnect(jellyfin, server.address, session.secret);
            // Signing in flips the root guard from onboarding to home.
            if (auth && !cancelled) return signIn(auth);
          } catch {
            // Transient network errors: keep polling.
          }
          if (!cancelled) timer = setTimeout(poll, POLL_MS);
        };
        timer = setTimeout(poll, POLL_MS);
      })
      .catch(() => !cancelled && setState({ status: 'unavailable' }));

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jellyfin, server, signIn]);

  const usePassword = () => router.push('/onboarding/password');
  const pickUser = (name: string) => router.push({ pathname: '/onboarding/password', params: { username: name } });

  return (
    <WizardStep
      step={4}
      totalSteps={4}
      title={`Sign in to ${server?.name ?? 'Jellyfin'}`}
      description={
        state.status === 'unavailable'
          ? 'Sign in with your Jellyfin username and password.'
          : users.length
            ? 'Pick your account, or approve the code from Jellyfin on your phone under Profile → Quick Connect.'
            : 'On your phone or computer, open Jellyfin, go to your profile, choose Quick Connect and enter this code.'
      }
    >
      {users.length ? (
        <Section label="Sign in to a public account">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            // ScrollView defaults to flexGrow: 1, which can stretch the column off-centre on Android.
            style={{ flexGrow: 0, marginHorizontal: -spacing.xs }}
            contentContainerStyle={{ gap: spacing.lg, padding: spacing.xs }}
          >
            {users.map((user, i) => (
              <View key={user.Id} style={{ alignItems: 'center', gap: spacing.xs, width: 72 }}>
                <AvatarButton
                  name={user.Name}
                  imageUri={publicApi ? userAvatarUrl(publicApi, user) : undefined}
                  size={56}
                  accessibilityLabel={`Sign in as ${user.Name}`}
                  hasTVPreferredFocus={i === 0}
                  onPress={() => pickUser(user.Name)}
                />
                <Text variant="caption" numberOfLines={1}>
                  {user.Name}
                </Text>
              </View>
            ))}
          </ScrollView>
        </Section>
      ) : null}

      {state.status === 'starting' ? <ActivityIndicator color={colors.accent} style={{ alignSelf: 'flex-start' }} /> : null}

      {state.status === 'waiting' ? (
        <Section label="Sign in with a code">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <View
              style={{
                paddingHorizontal: spacing.xl,
                paddingVertical: spacing.sm,
                borderRadius: radii.lg,
                backgroundColor: colors.surfaceRaised,
              }}
            >
              <Text
                variant={users.length ? 'headline' : 'display'}
                accessibilityLabel={`Quick Connect code ${state.session.code.split('').join(' ')}`}
                style={{ letterSpacing: 8 }}
              >
                {state.session.code}
              </Text>
            </View>
            <Text variant="caption" tone="secondary">
              Waiting for approval…
            </Text>
          </View>
        </Section>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <ListItem
          title={state.status === 'unavailable' ? 'Sign in with password' : 'Use a password instead'}
          hasTVPreferredFocus={!users.length}
          onPress={usePassword}
        />
        <ListItem title="Use a different server" onPress={() => forgetServer().then(() => router.replace('/onboarding'))} />
      </View>
    </WizardStep>
  );
}

/** A labelled group on the sign-in step. */
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      {children}
    </View>
  );
}
