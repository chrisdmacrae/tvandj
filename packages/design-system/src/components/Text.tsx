import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { colors, fontFamily, typography, type TypographyVariant } from '../tokens';

type TextTone = 'primary' | 'secondary' | 'tertiary' | 'inverse' | 'accent';

const toneColor: Record<TextTone, string> = {
  primary: colors.textPrimary,
  secondary: colors.textSecondary,
  tertiary: colors.textTertiary,
  inverse: colors.textInverse,
  accent: colors.accentStrong,
};

export type TextProps = RNTextProps & {
  variant?: TypographyVariant;
  tone?: TextTone;
};

export function Text({ variant = 'body', tone = 'primary', style, ...rest }: TextProps) {
  return (
    <RNText
      style={[{ fontFamily: fontFamily.sans, color: toneColor[tone] }, typography[variant], style]}
      {...rest}
    />
  );
}
