import { forwardRef, useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { colors, focus, fontFamily, radii, spacing, typography } from '../tokens';
import { Text } from './Text';

export type TextFieldProps = Omit<TextInputProps, 'style' | 'placeholderTextColor'> & {
  label: string;
  hint?: string;
  error?: string;
};

/**
 * Single-line input. On TV, D-pad focus lands on the field and Select opens
 * the system keyboard, so the focus state has to be as obvious as a button's.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, hint, error, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const message = error ?? hint;

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.accent}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          typography.body,
          {
            fontFamily: fontFamily.sans,
            color: colors.textPrimary,
            backgroundColor: focused ? colors.surfaceFocused : colors.surfaceRaised,
            borderRadius: radii.md,
            borderWidth: focus.ringWidth,
            borderColor: focused ? colors.focusRing : error ? colors.danger : 'transparent',
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
          },
        ]}
        {...rest}
      />
      {message ? (
        <Text variant="caption" style={{ color: error ? colors.danger : colors.textSecondary }}>
          {message}
        </Text>
      ) : null}
    </View>
  );
});
