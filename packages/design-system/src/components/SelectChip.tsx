import { View } from 'react-native';
import { colors, focus, radii, spacing } from '../tokens';
import { Focusable, type FocusableProps } from './Focusable';
import { Text } from './Text';

export type SelectChipProps = Omit<FocusableProps, 'children' | 'style'> & {
  label: string;
  selected: boolean;
};

/** Toggleable option for multi-select settings (quality, codec, language). */
export function SelectChip({ label, selected, ...rest }: SelectChipProps) {
  return (
    <Focusable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      focusScale={1.05}
      style={({ focused }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radii.pill,
        borderWidth: focus.ringWidth / 2,
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: focused ? colors.textPrimary : selected ? colors.accentMuted : 'transparent',
      })}
      {...rest}
    >
      {({ focused }) => (
        <>
          <View
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              borderWidth: 2,
              borderColor: focused ? colors.textInverse : selected ? colors.accent : colors.textTertiary,
              backgroundColor: selected ? (focused ? colors.textInverse : colors.accent) : 'transparent',
            }}
          />
          <Text variant="label" tone={focused ? 'inverse' : 'primary'}>
            {label}
          </Text>
        </>
      )}
    </Focusable>
  );
}
