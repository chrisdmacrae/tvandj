import type { ReactNode } from 'react';
import { View } from 'react-native';
import { colors, radii, safeArea, spacing } from '../tokens';
import { Focusable } from './Focusable';
import { Text } from './Text';

export type Tab = { key: string; label: string };

export type TabBarProps = {
  tabs: Tab[];
  selected: string;
  onSelect: (key: string) => void;
  /** Right-aligned content, e.g. a settings button. */
  trailing?: ReactNode;
};

/** Top-level navigation. The selected tab is underlined; the focused one inverts like a button. */
export function TabBar({ tabs, selected, onSelect, trailing }: TabBarProps) {
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: safeArea.horizontal,
        paddingTop: safeArea.vertical,
        paddingBottom: spacing.md,
        gap: spacing.xs,
      }}
    >
      {tabs.map((tab) => {
        const isSelected = tab.key === selected;
        return (
          <Focusable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={tab.label}
            focusScale={1.05}
            onPress={() => onSelect(tab.key)}
            style={({ focused }) => ({
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.sm,
              borderRadius: radii.pill,
              backgroundColor: focused ? colors.textPrimary : 'transparent',
            })}
          >
            {({ focused }) => (
              <View style={{ alignItems: 'center', gap: spacing.xxs }}>
                <Text variant="title" tone={focused ? 'inverse' : isSelected ? 'primary' : 'secondary'}>
                  {tab.label}
                </Text>
                <View
                  style={{
                    height: 3,
                    width: 20,
                    borderRadius: radii.pill,
                    backgroundColor: isSelected && !focused ? colors.accent : 'transparent',
                  }}
                />
              </View>
            )}
          </Focusable>
        );
      })}
      <View style={{ flex: 1 }} />
      {trailing}
    </View>
  );
}
