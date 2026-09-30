import { useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { focus, motion } from '../tokens';

export type FocusableProps = Omit<PressableProps, 'children' | 'style'> & {
  children: ReactNode | ((state: { focused: boolean }) => ReactNode);
  style?: StyleProp<ViewStyle> | ((state: { focused: boolean }) => StyleProp<ViewStyle>);
  /** Scale applied while focused. Pass 1 to disable the zoom. */
  focusScale?: number;
};

/**
 * Base building block for anything the D-pad can land on. Tracks focus,
 * animates the focus zoom, and hands `focused` to children and styles.
 */
export function Focusable({
  children,
  style,
  focusScale = focus.scale,
  onFocus,
  onBlur,
  onHoverIn,
  onHoverOut,
  ...rest
}: FocusableProps) {
  // Keyboard/D-pad focus, or a mouse over it (web): both show the focused look.
  const [hasFocus, setHasFocus] = useState(false);
  const [hovered, setHovered] = useState(false);
  const focused = hasFocus || hovered;
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (toValue: number) =>
    Animated.timing(scale, { toValue, duration: motion.normal, useNativeDriver: true }).start();

  return (
    <Pressable
      {...rest}
      onFocus={(e) => {
        setHasFocus(true);
        animateTo(focusScale);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setHasFocus(false);
        if (!hovered) animateTo(1);
        onBlur?.(e);
      }}
      // Pointer hover (web; never fires on TV or touch screens).
      onHoverIn={(e) => {
        setHovered(true);
        animateTo(focusScale);
        onHoverIn?.(e);
      }}
      onHoverOut={(e) => {
        setHovered(false);
        if (!hasFocus) animateTo(1);
        onHoverOut?.(e);
      }}
    >
      <Animated.View
        style={[
          typeof style === 'function' ? style({ focused }) : style,
          { transform: [{ scale }] },
        ]}
      >
        {typeof children === 'function' ? children({ focused }) : children}
      </Animated.View>
    </Pressable>
  );
}
