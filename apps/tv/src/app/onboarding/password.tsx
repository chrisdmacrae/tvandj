import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { Button, TextField } from '@tv-and-j/design-system';
import { WizardStep } from '../../components/WizardStep';
import { SignInError, signInWithPassword } from '../../jellyfin/auth';
import { useSession } from '../../state/SessionContext';

export default function PasswordSignIn() {
  const { jellyfin, server, signIn } = useSession();
  // Arriving from a user picked on the sign-in step: their name is filled in, focus goes to the password.
  const params = useLocalSearchParams<{ username?: string }>();
  const [username, setUsername] = useState(params.username ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

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
    <WizardStep
      step={4}
      totalSteps={4}
      title={`Sign in to ${server?.name ?? 'Jellyfin'}`}
      description="Use the same username and password you use for Jellyfin on the web."
    >
      <TextField
        label="Username"
        value={username}
        onChangeText={setUsername}
        autoFocus={!params.username}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={error}
        autoFocus={!!params.username}
        hint={params.username ? `Leave blank if ${params.username} doesn’t have a password.` : undefined}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button label={busy ? 'Signing in…' : 'Sign in'} onPress={submit} disabled={busy} />
    </WizardStep>
  );
}
