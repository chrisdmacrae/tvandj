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
  /** A toggle that's on (e.g. shuffle): accent background while not focused. */
  selected?: boolean;
};

/** Round, icon-only button. Same colours as a secondary Button. */
export function IconButton({ icon, size = 40, selected, ...rest }: IconButtonProps) {
  return (
    <Focusable
      accessibilityRole="button"
      accessibilityState={selected != null ? { selected } : undefined}
      focusScale={1.1}
      style={({ focused }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? colors.textPrimary : selected ? colors.accent : colors.surfaceRaised,
      })}
      {...rest}
    >
      {({ focused }) => icon(focused || selected ? colors.textInverse : colors.textPrimary)}
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

type IconProps = { color: string; size?: number };

/** Filled play triangle, nudged right so it looks centred in a circle. */
export function PlayIcon({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill={color} />
    </Svg>
  );
}

export function PauseIcon({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill={color} />
    </Svg>
  );
}

export function SkipNextIcon({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 6.2v11.6a.8.8 0 0 0 1.25.66L14.5 12.7a.8.8 0 0 0 0-1.4L6.25 5.54A.8.8 0 0 0 5 6.2z" fill={color} />
      <Path d="M17 5.5h2.5v13H17z" fill={color} />
    </Svg>
  );
}

export function SkipPreviousIcon({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M19 6.2v11.6a.8.8 0 0 1-1.25.66L9.5 12.7a.8.8 0 0 1 0-1.4l8.25-5.76A.8.8 0 0 1 19 6.2z" fill={color} />
      <Path d="M4.5 5.5H7v13H4.5z" fill={color} />
    </Svg>
  );
}

export function ShuffleIcon({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Repeat; with `one`, a small 1 in the middle (repeat this song). */
export function RepeatIcon({ color, size = 20, one }: IconProps & { one?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      {one ? <Path d="M11 10.5l1.5-1v5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /> : null}
    </Svg>
  );
}

/** Trash can, for delete actions. */
export function TrashIcon({ color, size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
