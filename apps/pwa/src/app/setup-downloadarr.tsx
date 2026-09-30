import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Text, spacing } from '@tv-and-j/design-system';
import { isRestricted, useCurrentUser } from '@tv-and-j/core/jellyfin/users';
import { useSettings } from '@tv-and-j/core/state/SettingsContext';
import { AuthCard } from '../components/AuthCard';
import { DownloadarrAddress } from '../components/DownloadarrAddress';

/**
 * The last onboarding step, once per device: does this household use
 * downloadarr? Skipped when the household already has it (the TV and J
 * plugin), and for profiles with content limits, which can't use it.
 */
export default function DownloadarrSetup() {
  const { settings, update, downloadarrFromHousehold } = useSettings();
  const user = useCurrentUser().data;
  const [uses, setUses] = useState(false);
  const answered = settings.downloadarrAsked || !!settings.downloadarrUrl;
  const nothingToAsk = downloadarrFromHousehold || isRestricted(user?.Policy);

  useEffect(() => {
    if (nothingToAsk && !answered) update({ downloadarrAsked: true });
  }, [nothingToAsk, answered, update]);
  // Answered (here, or by connecting): on to Home.
  useEffect(() => {
    if (answered) router.replace('/');
  }, [answered]);

  const skip = () => update({ downloadarrAsked: true });

  if (!uses) {
    return (
      <AuthCard
        title="Do you use downloadarr?"
        description="downloadarr finds new movies and shows for you to request, and downloads them into Jellyfin. It’s optional: everything else works without it."
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <Button label="Yes, connect it" onPress={() => setUses(true)} />
          <Button label="No" variant="secondary" onPress={skip} />
        </View>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Connect downloadarr" description="Enter downloadarr’s address. If it runs next to Jellyfin, it’s filled in for you.">
      <DownloadarrAddress />
      <Button label="Skip for now" size="sm" variant="ghost" onPress={skip} />
      <Text variant="caption" tone="tertiary">
        You can change this any time in Settings.
      </Text>
    </AuthCard>
  );
}
