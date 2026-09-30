import type { ReactNode } from 'react';
import { View } from 'react-native';
import { colors, radii, spacing } from '../tokens';
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
        paddingTop: spacing.xs,
        paddingBottom: Math.max(bottomInset, spacing.xs),
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      {items.map((item) => {
        const isSelected = item.key === selected;
        return (
          // Each tab gets an equal share of the width (Focusable styles its inner view, so the share goes here).
          <View key={item.key} style={{ flex: 1 }}>
            <Focusable
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={item.label}
              focusScale={1}
              onPress={() => onSelect(item.key)}
              style={{ alignItems: 'center', gap: 2, paddingVertical: spacing.xxs }}
            >
              {({ focused }) => {
                const color = isSelected ? colors.accentStrong : focused ? colors.textPrimary : colors.textSecondary;
                return (
                  <>
                    {/* The selected tab's icon sits on a soft pill. */}
                    <View
                      style={{
                        width: 56,
                        height: 30,
                        borderRadius: radii.pill,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isSelected ? colors.accentMuted : focused ? colors.surfaceRaised : 'transparent',
                      }}
                    >
                      {item.icon(color)}
                    </View>
                    <Text variant="caption" numberOfLines={1} style={{ color, fontSize: 11, lineHeight: 14, fontWeight: isSelected ? '600' : '500' }}>
                      {item.label}
                    </Text>
                  </>
                );
              }}
            </Focusable>
          </View>
        );
      })}
    </View>
  );
}
