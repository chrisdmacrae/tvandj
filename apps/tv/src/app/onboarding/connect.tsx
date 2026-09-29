import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, Text, colors, spacing } from '@tv-and-j/design-system';
import { WizardStep } from '../../components/WizardStep';
import { ServerConnectionError, connectToServer, type ServerInfo } from '../../jellyfin/servers';
import { useSession } from '../../state/SessionContext';

type State =
  | { status: 'connecting' }
  | { status: 'connected'; server: ServerInfo }
  | { status: 'failed'; message: string };

export default function Connect() {
  const { address = '' } = useLocalSearchParams<{ address: string }>();
  const { saveServer } = useSession();
  const [state, setState] = useState<State>({ status: 'connecting' });

  const connect = useCallback(async () => {
    setState({ status: 'connecting' });
    try {
      setState({ status: 'connected', server: await connectToServer(address) });
    } catch (e) {
      const message =
        e instanceof ServerConnectionError ? e.message : 'Something went wrong while connecting. Try again.';
      setState({ status: 'failed', message });
    }
  }, [address]);

  useEffect(() => {
    connect();
  }, [connect]);

  const editAddress = () => router.replace({ pathname: '/onboarding/manual', params: { address } });

  return (
    <WizardStep
      step={3}
      totalSteps={4}
      title={
        state.status === 'connected'
          ? state.server.name
          : state.status === 'failed'
            ? 'Couldn’t connect'
            : 'Connecting'
      }
      description={
        state.status === 'connected'
          ? 'Found it. Continue to sign in.'
          : state.status === 'failed'
            ? state.message
            : `Checking ${address}…`
      }
    >
      {state.status === 'connecting' ? (
        <ActivityIndicator color={colors.accent} size="large" style={{ alignSelf: 'flex-start' }} />
      ) : null}

      {state.status === 'connected' ? (
        <>
          <View style={{ gap: spacing.xs }}>
            <Text variant="label" tone="secondary">
              {state.server.address}
            </Text>
            {state.server.version ? (
              <Text variant="caption" tone="tertiary">
                Jellyfin {state.server.version}
              </Text>
            ) : null}
          </View>
          <Button
            label="Continue"
            size="lg"
            hasTVPreferredFocus
            onPress={async () => {
              await saveServer(state.server);
              router.push('/onboarding/sign-in');
            }}
          />
        </>
      ) : null}

      {state.status === 'failed' ? (
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Button label="Try again" hasTVPreferredFocus onPress={connect} />
          <Button label="Edit address" variant="secondary" onPress={editAddress} />
        </View>
      ) : null}
    </WizardStep>
  );
}
