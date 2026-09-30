import { Redirect, router } from 'expo-router';
import { Button } from '@tv-and-j/design-system';
import { isDiscoverySupported } from '../../../modules/jellyfin-discovery';
import { WizardStep } from '../../components/WizardStep';
import { useSession } from '@tv-and-j/core/state/SessionContext';

export default function Welcome() {
  const { server } = useSession();
  // Server already chosen (e.g. after signing out): go straight to sign-in.
  if (server) return <Redirect href="/onboarding/sign-in" />;

  return (
    <WizardStep
      step={1}
      totalSteps={4}
      title="Welcome to TV and J"
      description="Watch your Jellyfin library on the big screen. First, let's find your server."
    >
      <Button
        label="Get started"
        size="lg"
        hasTVPreferredFocus
        onPress={() => router.push(isDiscoverySupported ? '/onboarding/discover' : '/onboarding/manual')}
      />
    </WizardStep>
  );
}
