import { router } from 'expo-router';
import { useState } from 'react';
import { Button, Text, TextField } from '@tv-and-j/design-system';
import { ServerConnectionError, connectToServer } from '@tv-and-j/core/jellyfin/servers';
import { useSession } from '@tv-and-j/core/state/SessionContext';
import { AuthCard } from '../../components/AuthCard';

/** An https page can't talk to an http server (browsers block it), so say so up front. */
const servedSecurely = typeof location !== 'undefined' && location.protocol === 'https:';

/** Step 1: which Jellyfin server. A browser can't search the network, so it's typed in. */
export default function ServerStep() {
  const { saveServer } = useSession();
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      if (servedSecurely && /^\s*http:\/\//i.test(address)) {
        throw new ServerConnectionError('This page is secure (https), so browsers won’t let it reach an http server. Use your server’s https address.');
      }
      await saveServer(await connectToServer(address));
      router.push('/onboarding/sign-in');
    } catch (e) {
      setError(e instanceof ServerConnectionError ? e.message : 'Couldn’t reach that server. Check the address and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Connect to Jellyfin" description="Enter the address you use to open Jellyfin in a browser.">
      <TextField
        label="Server address"
        placeholder={servedSecurely ? 'https://jellyfin.example.com' : '192.168.1.20:8096'}
        value={address}
        onChangeText={(text) => {
          setAddress(text);
          setError(undefined);
        }}
        onSubmitEditing={connect}
        error={error}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
      />
      <Button label={busy ? 'Connecting…' : 'Connect'} onPress={connect} disabled={busy} />
      {servedSecurely ? (
        <Text variant="caption" tone="tertiary">
          This app is served over https, so your server needs an https address too (for example through a reverse proxy).
        </Text>
      ) : null}
    </AuthCard>
  );
}
