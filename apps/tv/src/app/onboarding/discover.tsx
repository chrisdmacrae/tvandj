import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ListItem, Text, colors, spacing } from '@tv-and-j/design-system';
import { discoverServers, type DiscoveredServer } from '../../../modules/jellyfin-discovery';
import { WizardStep } from '../../components/WizardStep';

export default function Discover() {
  const [servers, setServers] = useState<DiscoveredServer[]>([]);
  const [searching, setSearching] = useState(true);

  const search = useCallback(async () => {
    setSearching(true);
    try {
      setServers(await discoverServers(3000));
    } catch {
      setServers([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    search();
  }, [search]);

  return (
    <WizardStep
      step={2}
      totalSteps={4}
      title="Choose your server"
      description="We're looking for Jellyfin servers on your network. Don't see yours? Enter its address instead."
    >
      {searching ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <ActivityIndicator color={colors.accent} />
          <Text tone="secondary">Searching your network…</Text>
        </View>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {servers.length === 0 ? (
            <Text tone="secondary" style={{ marginBottom: spacing.sm }}>
              No servers found on this network.
            </Text>
          ) : null}
          {servers.map((server, index) => (
            <ListItem
              key={server.id}
              title={server.name || 'Jellyfin'}
              subtitle={server.address}
              hasTVPreferredFocus={index === 0}
              onPress={() => router.push({ pathname: '/onboarding/connect', params: { address: server.address } })}
            />
          ))}
          <ListItem
            title="Enter address manually"
            hasTVPreferredFocus={servers.length === 0}
            onPress={() => router.push('/onboarding/manual')}
          />
          <ListItem title="Search again" onPress={search} />
        </View>
      )}
    </WizardStep>
  );
}
