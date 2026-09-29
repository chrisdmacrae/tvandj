import type { ReactNode } from 'react';
import { View } from 'react-native';
import { colors, focus, radii, spacing } from '../tokens';
import { Focusable, type FocusableProps } from './Focusable';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = Omit<FocusableProps, 'children' | 'style'> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
};

const background: Record<ButtonVariant, { rest: string; focused: string }> = {
  primary: { rest: colors.accent, focused: colors.accentStrong },
  secondary: { rest: colors.surfaceRaised, focused: colors.textPrimary },
  ghost: { rest: 'transparent', focused: colors.textPrimary },
};

const padding: Record<ButtonSize, { paddingVertical: number; paddingHorizontal: number }> = {
  sm: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  md: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  lg: { paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
};

export function Button({ label, variant = 'primary', size = 'md', icon, ...rest }: ButtonProps) {
  return (
    <Focusable
      accessibilityRole="button"
      accessibilityLabel={label}
      focusScale={1.05}
      style={({ focused }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: spacing.sm,
          borderRadius: radii.pill,
          backgroundColor: focused ? background[variant].focused : background[variant].rest,
          borderWidth: variant === 'ghost' && !focused ? focus.ringWidth / 2 : 0,
          borderColor: colors.border,
        },
        padding[size],
      ]}
      {...rest}
    >
      {({ focused }) => (
        <>
          {icon ? <View>{icon}</View> : null}
          <Text
            variant={size === 'lg' ? 'title' : size === 'sm' ? 'caption' : 'label'}
            tone={focused ? 'inverse' : 'primary'}
          >
            {label}
          </Text>
        </>
      )}
    </Focusable>
  );
}
