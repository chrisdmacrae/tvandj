import { View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, spacing } from '../tokens';
import { Text } from './Text';

export type BadgeTone = 'accent' | 'neutral' | 'success';

const tone: Record<BadgeTone, { bg: string; fg: 'primary' | 'inverse' }> = {
  accent: { bg: colors.accent, fg: 'primary' },
  neutral: { bg: colors.scrim, fg: 'primary' },
  success: { bg: colors.success, fg: 'inverse' },
};

export type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  style?: StyleProp<ViewStyle>;
};

export function Badge({ label, tone: t = 'accent', style }: BadgeProps) {
  return (
    <View
      style={[
        {
          alignSelf: 'flex-start',
          minWidth: 20,
          paddingHorizontal: spacing.xs + spacing.xxs,
          paddingVertical: spacing.xxs,
          borderRadius: radii.pill,
          backgroundColor: tone[t].bg,
          alignItems: 'center',
        },
        style,
      ]}
    >
      <Text variant="caption" tone={tone[t].fg} style={{ fontWeight: '700' }}>
        {label}
      </Text>
    </View>
  );
}
