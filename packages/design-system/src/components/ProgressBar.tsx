import { View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii } from '../tokens';

export type ProgressBarProps = {
  /** 0–1 */
  value: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
};

export function ProgressBar({ value, height = 4, style }: ProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[
        { height, borderRadius: radii.pill, backgroundColor: colors.border, overflow: 'hidden' },
        style,
      ]}
    >
      <View style={{ width: `${clamped * 100}%`, height, backgroundColor: colors.accent }} />
    </View>
  );
}
