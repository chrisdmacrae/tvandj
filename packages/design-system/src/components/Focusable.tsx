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
  ...rest
}: FocusableProps) {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (toValue: number) =>
    Animated.timing(scale, { toValue, duration: motion.normal, useNativeDriver: true }).start();

  return (
    <Pressable
      {...rest}
      onFocus={(e) => {
        setFocused(true);
        animateTo(focusScale);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        animateTo(1);
        onBlur?.(e);
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
