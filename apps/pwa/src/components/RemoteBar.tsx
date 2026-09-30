import { Image } from 'expo-image';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Focusable, IconButton, PauseIcon, PlayIcon, ProgressBar, Text, colors, radii, spacing, useLayout } from '@tv-and-j/design-system';
import { landscapeUrl } from '@tv-and-j/core/jellyfin/images';
import { remotePosition, useRemoteCommands, useRemoteDevice } from '@tv-and-j/core/jellyfin/remote';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';
import { useRemoteTarget } from '../lib/remoteTarget';

/** "Playing on Living Room TV": what the controlled screen is playing, with play/pause. Opens its remote. */
export function RemoteBar({ bottom = 0 }: { bottom?: number }) {
  const { api } = useAuthedSession();
  const { gutter } = useLayout();
  const { sessionId } = useRemoteTarget();
  const device = useRemoteDevice(sessionId ?? undefined).data;
  const commands = useRemoteCommands(sessionId ?? undefined);
  const item = device?.NowPlayingItem;
  if (!device || !item) return null;
  const { position, duration } = remotePosition(device);
  const paused = !!device.PlayState?.IsPaused;
  const title = item.Type === 'Episode' ? `${item.SeriesName} · ${item.Name}` : item.Name;

  return (
    <View style={{ position: 'absolute', left: gutter, right: gutter, bottom: bottom + spacing.sm }}>
      <Focusable
        accessibilityRole="button"
        accessibilityLabel={`Playing on ${device.DeviceName}: ${title}. Open the remote.`}
        focusScale={1}
        onPress={() => router.push({ pathname: '/remote/[id]', params: { id: device.Id } })}
        style={{ borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.surfaceRaised }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.sm }}>
          <View style={{ width: 64, aspectRatio: 16 / 9, borderRadius: radii.sm, overflow: 'hidden', backgroundColor: colors.surface }}>
            <Image source={landscapeUrl(api, item, 160)} style={{ flex: 1 }} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="caption" tone="secondary" numberOfLines={1}>
              Playing on {device.DeviceName}
            </Text>
            <Text variant="label" numberOfLines={1}>
              {title}
            </Text>
          </View>
          <IconButton
            accessibilityLabel={paused ? 'Play' : 'Pause'}
            icon={(c) => (paused ? <PlayIcon color={c} /> : <PauseIcon color={c} />)}
            onPress={() => commands.playstate('PlayPause')}
          />
        </View>
        {duration ? <ProgressBar value={position / duration} /> : null}
      </Focusable>
    </View>
  );
}
