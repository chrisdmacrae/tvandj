import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, spacing } from '../tokens';
import { Focusable } from './Focusable';
import { Text } from './Text';

export type PinPadProps = {
  /** Digits entered so far. */
  value: string;
  onChange: (value: string) => void;
  /** Number of digits, shown as dots. */
  length?: number;
  /** Shown under the dots, e.g. "Wrong PIN". Shakes nothing; just says so. */
  error?: string;
  /** Focus the first key when shown. */
  hasTVPreferredFocus?: boolean;
};

const KEY = 56;
const ROWS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['', '0', 'delete']] as const;

function BackspaceIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M17 9.5l-5 5M12 9.5l5 5" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function Key({ label, onPress, hasTVPreferredFocus }: { label: string; onPress: () => void; hasTVPreferredFocus?: boolean }) {
  const isDelete = label === 'delete';
  return (
    <Focusable
      accessibilityRole="button"
      accessibilityLabel={isDelete ? 'Delete' : label}
      focusScale={1.1}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onPress={onPress}
      style={({ focused }) => ({
        width: KEY,
        height: KEY,
        borderRadius: KEY / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? colors.textPrimary : colors.surfaceRaised,
      })}
    >
      {({ focused }) =>
        isDelete ? (
          <BackspaceIcon color={focused ? colors.textInverse : colors.textPrimary} />
        ) : (
          <Text variant="title" tone={focused ? 'inverse' : 'primary'}>
            {label}
          </Text>
        )
      }
    </Focusable>
  );
}

/**
 * PIN entry for the remote: dots for the digits so far, and a 3×4 keypad the
 * D-pad moves around (a Fire TV remote has no number keys). Delete removes
 * the last digit; the caller decides what a full PIN means.
 */
export function PinPad({ value, onChange, length = 4, error, hasTVPreferredFocus }: PinPadProps) {
  const press = (key: string) => {
    if (key === 'delete') onChange(value.slice(0, -1));
    else if (value.length < length) onChange(value + key);
  };
  return (
    <View style={{ alignItems: 'center', gap: spacing.lg }}>
      <View accessible accessibilityLabel={`${value.length} of ${length} digits entered`} style={{ flexDirection: 'row', gap: spacing.md }}>
        {Array.from({ length }, (_, i) => (
          <View
            key={i}
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              borderWidth: 2,
              borderColor: error ? colors.danger : colors.textSecondary,
              backgroundColor: i < value.length ? (error ? colors.danger : colors.textPrimary) : 'transparent',
            }}
          />
        ))}
      </View>
      <Text variant="caption" style={{ color: colors.danger, minHeight: 18 }}>
        {error ?? ''}
      </Text>
      <View style={{ gap: spacing.sm }}>
        {ROWS.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row', gap: spacing.sm }}>
            {row.map((key, c) =>
              key ? (
                <Key key={key} label={key} onPress={() => press(key)} hasTVPreferredFocus={hasTVPreferredFocus && r === 0 && c === 0} />
              ) : (
                <View key={`blank-${c}`} style={{ width: KEY, height: KEY }} />
              ),
            )}
          </View>
        ))}
      </View>
    </View>
  );
}
