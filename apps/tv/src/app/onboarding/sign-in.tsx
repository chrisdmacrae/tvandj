import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ListItem, Text, colors, radii, spacing } from '@tv-and-j/design-system';
import { WizardStep } from '../../components/WizardStep';
import { pollQuickConnect, startQuickConnect, type QuickConnectSession } from '../../jellyfin/auth';
import { useSession } from '../../state/SessionContext';

type State =
  | { status: 'starting' }
  | { status: 'waiting'; session: QuickConnectSession }
  | { status: 'unavailable' };

const POLL_MS = 3000;

export default function SignIn() {
  const { jellyfin, server, signIn, forgetServer } = useSession();
  const [state, setState] = useState<State>({ status: 'starting' });

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

  return (
    <WizardStep
      step={4}
      totalSteps={4}
      title={`Sign in to ${server?.name ?? 'Jellyfin'}`}
      description={
        state.status === 'unavailable'
          ? 'Sign in with your Jellyfin username and password.'
          : 'On your phone or computer, open Jellyfin, go to your profile, choose Quick Connect and enter this code.'
      }
    >
      {state.status === 'starting' ? <ActivityIndicator color={colors.accent} style={{ alignSelf: 'flex-start' }} /> : null}

      {state.status === 'waiting' ? (
        <View style={{ gap: spacing.md }}>
          <View
            style={{
              alignSelf: 'flex-start',
              paddingHorizontal: spacing.xl,
              paddingVertical: spacing.md,
              borderRadius: radii.lg,
              backgroundColor: colors.surfaceRaised,
            }}
          >
            <Text variant="display" accessibilityLabel={`Quick Connect code ${state.session.code.split('').join(' ')}`} style={{ letterSpacing: 8 }}>
              {state.session.code}
            </Text>
          </View>
          <Text variant="caption" tone="secondary">
            Waiting for approval…
          </Text>
        </View>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <ListItem
          title={state.status === 'unavailable' ? 'Sign in with password' : 'Use a password instead'}
          hasTVPreferredFocus
          onPress={usePassword}
        />
        <ListItem title="Use a different server" onPress={() => forgetServer().then(() => router.replace('/onboarding'))} />
      </View>
    </WizardStep>
  );
}
