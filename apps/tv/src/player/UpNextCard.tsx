import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { Image } from 'expo-image';
import { View } from 'react-native';
import { Button, ProgressBar, Text, colors, radii, safeArea, spacing } from '@tv-and-j/design-system';
import { landscapeUrl } from '@tv-and-j/core/jellyfin/images';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';

const THUMB_WIDTH = 200;

type UpNextCardProps = {
  episode: BaseItemDto;
  /** Seconds until it plays by itself; undefined when autoplay is off. */
  countdown?: number;
  total: number;
  onPlay: () => void;
  onCancel: () => void;
};

/** "Next episode" card in the bottom-right corner as the credits roll. */
export function UpNextCard({ episode, countdown, total, onPlay, onCancel }: UpNextCardProps) {
  const { api } = useAuthedSession();
  const thumb = landscapeUrl(api, episode, THUMB_WIDTH * 2);
  const code = episode.ParentIndexNumber != null && episode.IndexNumber != null ? `S${episode.ParentIndexNumber}:E${episode.IndexNumber}` : undefined;
  return (
    <View
      style={{
        position: 'absolute',
        right: safeArea.horizontal,
        bottom: safeArea.vertical,
        width: THUMB_WIDTH * 2 + spacing.lg,
        flexDirection: 'row',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radii.lg,
        backgroundColor: colors.scrim,
      }}
    >
      <View style={{ width: THUMB_WIDTH, aspectRatio: 16 / 9, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surface }}>
        {thumb ? <Image source={thumb} cachePolicy="memory-disk" style={{ flex: 1 }} /> : null}
        {countdown != null ? (
          <ProgressBar value={1 - countdown / total} style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} />
        ) : null}
      </View>
      <View style={{ flex: 1, gap: spacing.xs, justifyContent: 'space-between' }}>
        <View>
          <Text variant="caption" tone="secondary">
            {countdown != null ? `Next episode in ${Math.ceil(countdown)}` : 'Next episode'}
          </Text>
          <Text variant="label" numberOfLines={2}>
            {[code, episode.Name].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          <Button label="Play now" size="sm" hasTVPreferredFocus onPress={onPlay} />
          <Button label="Cancel" size="sm" variant="ghost" onPress={onCancel} />
        </View>
      </View>
    </View>
  );
}
