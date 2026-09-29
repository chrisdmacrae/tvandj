import type { ReactNode } from 'react';
import { View } from 'react-native';
import { colors, radii, spacing } from '../tokens';
import { Focusable, type FocusableProps } from './Focusable';
import { Text } from './Text';

export type ListItemProps = Omit<FocusableProps, 'children' | 'style'> & {
  title: string;
  subtitle?: string;
  /** Leading icon or artwork. */
  leading?: ReactNode;
  /** Trailing text such as a version or status. */
  trailing?: string;
};

/** Full-width selectable row for menus, settings and pickers. */
export function ListItem({ title, subtitle, leading, trailing, ...rest }: ListItemProps) {
  return (
    <Focusable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      focusScale={1.02}
      style={({ focused }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.lg,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderRadius: radii.lg,
        backgroundColor: focused ? colors.textPrimary : colors.surface,
      })}
      {...rest}
    >
      {({ focused }) => (
        <>
          {leading ? <View>{leading}</View> : null}
          <View style={{ flex: 1 }}>
            <Text variant="title" tone={focused ? 'inverse' : 'primary'} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text variant="caption" tone={focused ? 'inverse' : 'secondary'} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {trailing ? (
            <Text variant="label" tone={focused ? 'inverse' : 'tertiary'}>
              {trailing}
            </Text>
          ) : null}
        </>
      )}
    </Focusable>
  );
}
