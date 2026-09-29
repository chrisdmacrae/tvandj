import { Image } from 'expo-image';
import { View } from 'react-native';
import { artwork, colors, focus, radii, spacing, type ArtworkShape } from '../tokens';
import { Badge } from './Badge';
import { DownloadBar } from './DownloadBar';
import { Focusable, type FocusableProps } from './Focusable';
import { ProgressBar } from './ProgressBar';
import { Text } from './Text';

export type PosterCardProps = Omit<FocusableProps, 'children' | 'style'> & {
  title: string;
  subtitle?: string;
  imageUri?: string;
  shape?: ArtworkShape;
  /** 0–1 playback progress; hidden when undefined or 0. */
  progress?: number;
  /** Top-right badge, e.g. unplayed episode count. */
  badge?: string;
  watched?: boolean;
  /**
   * Shown instead of the playback progress bar while the item is being
   * fetched: a 0–1 fraction, or null for indeterminate (searching, indexing).
   */
  download?: number | null;
  /** Short status line under the title, e.g. "Downloading 42%". Replaces the subtitle. */
  status?: string;
};

export function PosterCard({
  title,
  subtitle,
  imageUri,
  shape = 'portrait',
  progress,
  badge,
  watched,
  download,
  status,
  ...rest
}: PosterCardProps) {
  const { width, aspectRatio } = artwork[shape];
  const height = width / aspectRatio;

  return (
    <Focusable accessibilityRole="button" accessibilityLabel={title} style={{ width }} {...rest}>
      {({ focused }) => (
        <>
          <View
            style={{
              width,
              height,
              borderRadius: radii.md,
              backgroundColor: colors.surfaceRaised,
              overflow: 'hidden',
              borderWidth: focused ? focus.ringWidth : 0,
              borderColor: colors.focusRing,
            }}
          >
            {imageUri ? (
              // expo-image: memory + disk cache, decodes at the displayed size, and recycles as rows scroll.
              <Image
                source={imageUri}
                recyclingKey={imageUri}
                cachePolicy="memory-disk"
                contentFit="cover"
                transition={120}
                style={{ width: '100%', height: '100%' }}
              />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.sm }}>
                <Text variant="label" tone="tertiary" numberOfLines={2} style={{ textAlign: 'center' }}>
                  {title}
                </Text>
              </View>
            )}
            {badge || watched ? (
              <Badge
                label={watched ? '✓' : badge!}
                tone={watched ? 'success' : 'accent'}
                style={{ position: 'absolute', top: spacing.xs, right: spacing.xs }}
              />
            ) : null}
            {download !== undefined ? (
              <DownloadBar
                progress={download ?? undefined}
                style={{ position: 'absolute', left: spacing.xs, right: spacing.xs, bottom: spacing.xs }}
              />
            ) : progress ? (
              <ProgressBar
                value={progress}
                style={{ position: 'absolute', left: spacing.xs, right: spacing.xs, bottom: spacing.xs }}
              />
            ) : null}
          </View>
          <View style={{ marginTop: spacing.sm, opacity: focused ? 1 : 0.8 }}>
            <Text variant="label" numberOfLines={1}>
              {title}
            </Text>
            {status || subtitle ? (
              <Text
                variant="caption"
                tone={status ? 'primary' : 'secondary'}
                numberOfLines={1}
                style={status ? { color: colors.highlight } : undefined}
              >
                {status ?? subtitle}
              </Text>
            ) : null}
          </View>
        </>
      )}
    </Focusable>
  );
}
