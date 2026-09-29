import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Button, TextField } from '@tv-and-j/design-system';
import { WizardStep } from '../../components/WizardStep';

export default function ManualEntry() {
  const params = useLocalSearchParams<{ address?: string }>();
  const [address, setAddress] = useState(params.address ?? '');
  const [error, setError] = useState<string>();

  const submit = () => {
    if (!address.trim()) {
      setError('Enter your server’s address.');
      return;
    }
    router.push({ pathname: '/onboarding/connect', params: { address: address.trim() } });
  };

  return (
    <WizardStep
      step={2}
      totalSteps={4}
      title="Enter your server"
      description="Type the IP address or hostname you use to open Jellyfin in a browser. We'll work out the port and protocol."
    >
      <TextField
        label="Server address"
        placeholder="192.168.1.20 or jellyfin.example.com"
        hint="Include the port if it isn't 8096, e.g. 192.168.1.20:9000"
        error={error}
        value={address}
        onChangeText={(text) => {
          setAddress(text);
          setError(undefined);
        }}
        onSubmitEditing={submit}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
      />
      <Button label="Connect" onPress={submit} />
    </WizardStep>
  );
}
