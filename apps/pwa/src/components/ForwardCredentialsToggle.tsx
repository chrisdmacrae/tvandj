import { useState } from 'react';
import { View } from 'react-native';
import { SelectChip, Text } from '@tv-and-j/design-system';
import { forwardsCredentials, setForwardCredentials } from '@tv-and-j/core/network';

/**
 * For servers behind Cloudflare Access (or a similar sign-in proxy): send the
 * browser's sign-in cookie along with requests to Jellyfin and downloadarr.
 */
export function ForwardCredentialsToggle({ onChange }: { onChange?: (on: boolean) => void }) {
  const [on, setOn] = useState(forwardsCredentials);
  return (
    <>
      <View style={{ alignSelf: 'flex-start' }}>
        <SelectChip
          label="Behind Cloudflare Access"
          selected={on}
          onPress={() => {
            setOn(!on);
            setForwardCredentials(!on);
            onChange?.(!on);
          }}
        />
      </View>
      {on ? (
        <Text variant="caption" tone="tertiary">
          Sends this browser’s Cloudflare Access sign-in along to Jellyfin and downloadarr. Open each address in this browser once to sign in, and have both allow
          this app’s address with credentials (CORS).
        </Text>
      ) : null}
    </>
  );
}
