import { ActivityIndicator, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, ListItem, Text, colors, radii, spacing, useLayout } from '@tv-and-j/design-system';
import { useRemoteDevices, useRemoteDiagnostics, type RemoteDevice } from '@tv-and-j/core/jellyfin/remote';

function describe(device: RemoteDevice) {
  const playing = device.NowPlayingItem?.Name;
  return [device.Client, playing ? `Playing ${playing}` : undefined].filter(Boolean).join(' · ');
}

/** Choose another screen to control through Jellyfin: a sheet from the bottom on phones, a dialog elsewhere. */
export function DevicePicker({ visible, onClose, onPick, title = 'Control another screen' }: { visible: boolean; onClose: () => void; onPick: (device: RemoteDevice) => void; title?: string }) {
  const insets = useSafeAreaInsets();
  const { isPhone } = useLayout();
  const devices = useRemoteDevices({ poll: visible, enabled: visible });
  const empty = !devices.isPending && !devices.data?.length;
  const others = useRemoteDiagnostics(visible && empty).data ?? [];
  return (
    <Modal visible={visible} transparent animationType={isPhone ? 'slide' : 'fade'} onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: isPhone ? 'flex-end' : 'center', alignItems: 'center' }}>
        <Pressable
          // Taps inside the sheet stay in it.
          onPress={() => {}}
          style={{
            width: isPhone ? '100%' : 440,
            maxHeight: '80%',
            gap: spacing.md,
            padding: spacing.lg,
            paddingBottom: spacing.lg + (isPhone ? insets.bottom : 0),
            backgroundColor: colors.surface,
            borderTopLeftRadius: radii.lg,
            borderTopRightRadius: radii.lg,
            borderBottomLeftRadius: isPhone ? 0 : radii.lg,
            borderBottomRightRadius: isPhone ? 0 : radii.lg,
          }}
        >
          <Text variant="title">{title}</Text>
          {devices.isPending ? <ActivityIndicator color={colors.accent} /> : null}
          {empty ? (
            <View style={{ gap: spacing.sm }}>
              <Text tone="secondary">No other screens are available. Open TV and J (or another Jellyfin app) on the TV, signed in as you.</Text>
              {others.length ? (
                // Why each device Jellyfin knows about isn't here.
                <View style={{ gap: spacing.xxs }}>
                  <Text variant="label" tone="secondary">
                    Jellyfin sees
                  </Text>
                  {others.map((o) => (
                    <Text key={o.id} variant="caption" tone="tertiary">
                      {o.name}: {o.reason}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={{ gap: spacing.xs }}>
            {devices.data?.map((device) => (
              <ListItem key={device.Id} title={device.DeviceName ?? 'Device'} subtitle={describe(device)} onPress={() => onPick(device)} />
            ))}
          </View>
          <Button label="Cancel" size="sm" variant="ghost" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
