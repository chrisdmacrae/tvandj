import { View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, spacing } from '../tokens';
import { Text } from './Text';

export type ChipTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const toneColor: Record<ChipTone, string> = {
  neutral: colors.textSecondary,
  accent: colors.accentStrong,
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
};

export type ChipProps = {
  label: string;
  /** Short leading label such as a source name ("IMDb") or a glyph. */
  leading?: string;
  tone?: ChipTone;
  style?: StyleProp<ViewStyle>;
};

/** Non-interactive metadata tag: ratings, genres, content rating, runtime. */
export function Chip({ label, leading, tone = 'neutral', style }: ChipProps) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          alignSelf: 'flex-start',
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xxs,
          borderRadius: radii.sm,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
        style,
      ]}
    >
      {leading ? (
        <Text variant="caption" style={{ color: toneColor[tone], fontWeight: '700' }}>
          {leading}
        </Text>
      ) : null}
      <Text variant="caption" tone="primary">
        {label}
      </Text>
    </View>
  );
}
