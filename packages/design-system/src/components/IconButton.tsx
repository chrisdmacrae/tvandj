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

/** Magnifying glass. */
export function SearchIcon({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.35-4.35" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Gear (Feather "settings", MIT). */
export function SettingsIcon({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
