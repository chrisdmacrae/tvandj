import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Button, TextField } from '@tv-and-j/design-system';
import { SignInError, signInWithPassword } from '@tv-and-j/core/jellyfin/auth';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';
import { AuthCard } from '../components/AuthCard';
import { goHome } from '../lib/goHome';
import { goBack } from '../lib/nav';

/** First sign-in for another profile on this device: their Jellyfin password, once. */
export default function SwitchUser() {
  const { name = '' } = useLocalSearchParams<{ userId: string; name: string }>();
  const { jellyfin, server, signIn, profileChosen } = useAuthedSession();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (done && profileChosen) goHome();
  }, [done, profileChosen]);

  const submit = async () => {
    if (!jellyfin || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await signIn(await signInWithPassword(jellyfin, server.address, name, password));
      setDone(true);
    } catch (e) {
      setError(e instanceof SignInError ? e.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  };

  return (
    <AuthCard title={`Switch to ${name}`} description={`Enter ${name}’s Jellyfin password. You’ll only need to do this once on this device.`}>
      <TextField label="Password" value={password} onChangeText={setPassword} onSubmitEditing={submit} error={error} secureTextEntry autoFocus returnKeyType="go" />
      <Button label={busy ? 'Signing in…' : 'Sign in'} onPress={submit} disabled={busy} />
      <Button label="Back" size="sm" variant="ghost" onPress={goBack} />
    </AuthCard>
  );
}
