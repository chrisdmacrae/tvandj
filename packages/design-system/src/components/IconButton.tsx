import type { ReactNode } from 'react';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../tokens';
import { Focusable, type FocusableProps } from './Focusable';

export type IconButtonProps = Omit<FocusableProps, 'children' | 'style' | 'accessibilityLabel'> & {
  /** Receives the colour to draw in, which flips when focused. */
  icon: (color: string) => ReactNode;
  /** Required: there's no visible text to announce. */
  accessibilityLabel: string;
  size?: number;
};

/** Round, icon-only button. Same colours as a secondary Button. */
export function IconButton({ icon, size = 40, ...rest }: IconButtonProps) {
  return (
    <Focusable
      accessibilityRole="button"
      focusScale={1.1}
      style={({ focused }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? colors.textPrimary : colors.surfaceRaised,
      })}
      {...rest}
    >
      {({ focused }) => icon(focused ? colors.textInverse : colors.textPrimary)}
    </Focusable>
  );
}

/** Left arrow, drawn as a stroke so it stays centred and crisp at any size. */
export function ArrowLeftIcon({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M19 12H5M11 18l-6-6 6-6" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
