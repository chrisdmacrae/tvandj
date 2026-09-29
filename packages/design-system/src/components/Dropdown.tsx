import { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, radii, safeArea, spacing } from '../tokens';
import { Focusable, type FocusableProps } from './Focusable';
import { ListItem } from './ListItem';
import { Text } from './Text';

export type DropdownOption<T> = {
  value: T;
  label: string;
  /** Secondary text, e.g. a download status. */
  detail?: string;
};

export type DropdownProps<T> = Pick<FocusableProps, 'onFocus' | 'hasTVPreferredFocus'> & {
  /** Announced and shown above the options, e.g. "Season". */
  label: string;
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
};

function ChevronDown({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M6 9l6 6 6-6" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * TV select: a pill showing the current choice that opens a focus-trapped
 * list. The current option takes focus; Back closes without changing it.
 */
export function Dropdown<T extends string | number>({ label, value, options, onChange, ...rest }: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <>
      <Focusable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? ''}. Opens a list.`}
        focusScale={1.05}
        onPress={() => setOpen(true)}
        style={({ focused }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: spacing.sm,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.sm,
          borderRadius: radii.pill,
          backgroundColor: focused ? colors.textPrimary : colors.surfaceRaised,
        })}
        {...rest}
      >
        {({ focused }) => (
          <>
            <Text variant="title" tone={focused ? 'inverse' : 'primary'}>
              {current?.label ?? label}
            </Text>
            {current?.detail ? (
              <Text variant="caption" style={{ color: focused ? colors.textInverse : colors.highlight }}>
                {current.detail}
              </Text>
            ) : null}
            <ChevronDown color={focused ? colors.textInverse : colors.textPrimary} />
          </>
        )}
      </Focusable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: 'center', paddingHorizontal: safeArea.horizontal }}>
          <View
            style={{
              alignSelf: 'flex-start',
              minWidth: 320,
              maxHeight: '80%',
              padding: spacing.lg,
              gap: spacing.md,
              borderRadius: radii.lg,
              backgroundColor: colors.surface,
            }}
          >
            <Text variant="label" tone="secondary">
              {label}
            </Text>
            <ScrollView contentContainerStyle={{ gap: spacing.sm, padding: spacing.xs }}>
              {options.map((o) => (
                <ListItem
                  key={String(o.value)}
                  title={o.label}
                  subtitle={o.detail}
                  trailing={o.value === value ? 'Selected' : undefined}
                  hasTVPreferredFocus={o.value === value}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                />
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
