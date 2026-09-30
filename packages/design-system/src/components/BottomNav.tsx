import type { ReactNode } from 'react';
import { View } from 'react-native';
import { colors, spacing } from '../tokens';
import { Focusable } from './Focusable';
import { Text } from './Text';

export type BottomNavItem = {
  key: string;
  label: string;
  /** Receives the colour to draw in (accent when selected). */
  icon: (color: string) => ReactNode;
};

export type BottomNavProps = {
  items: BottomNavItem[];
  selected: string;
  onSelect: (key: string) => void;
  /** Extra space under the items for the phone's home indicator (safe-area inset). */
  bottomInset?: number;
};

/**
 * Phone navigation: icon-and-label tabs along the bottom, in thumb reach.
 * Larger screens use TabBar across the top instead.
 */
export function BottomNav({ items, selected, onSelect, bottomInset = 0 }: BottomNavProps) {
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        paddingBottom: bottomInset,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      {items.map((item) => {
        const isSelected = item.key === selected;
        return (
          <Focusable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={item.label}
            focusScale={1}
            onPress={() => onSelect(item.key)}
            style={{ flex: 1, alignItems: 'center', gap: spacing.xxs, paddingVertical: spacing.sm }}
          >
            {({ focused }) => {
              const color = isSelected ? colors.accentStrong : focused ? colors.textPrimary : colors.textSecondary;
              return (
                <>
                  {item.icon(color)}
                  <Text variant="caption" style={{ color }}>
                    {item.label}
                  </Text>
                </>
              );
            }}
          </Focusable>
        );
      })}
    </View>
  );
}
