import { useRef, type ReactNode } from 'react';
import { View, type GestureResponderEvent } from 'react-native';
import { colors, focus, radii, spacing } from '../tokens';
import { Focusable, type FocusableProps } from './Focusable';
import { Text } from './Text';

export type ScrubBarProps = Omit<FocusableProps, 'children' | 'style'> & {
  /** 0–1 */
  value: number;
  /** Drives the knob's icon: pause bars while playing, a play triangle while paused. */
  playing: boolean;
  /** Shown above the knob while scrubbing, e.g. "◀◀ 2s/s". */
  label?: string;
  /** A frame from the scrub position (e.g. a trickplay thumbnail), shown above the knob with the label. */
  preview?: ReactNode;
  /**
   * Touch and mouse: a tap or click on the bar jumps to that point (0–1)
   * instead of pressing it. Leave out on TV, where OK presses it.
   */
  onSeek?: (fraction: number) => void;
};

const KNOB = 28;

function PlayGlyph({ color }: { color: string }) {
  // CSS-border triangle; avoids ▶, which Android may render as a color emoji.
  return (
    <View
      style={{
        marginLeft: 3,
        width: 0,
        height: 0,
        borderTopWidth: 6,
        borderBottomWidth: 6,
        borderLeftWidth: 10,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderLeftColor: color,
      }}
    />
  );
}

function PauseGlyph({ color }: { color: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      <View style={{ width: 3.5, height: 12, borderRadius: 1, backgroundColor: color }} />
      <View style={{ width: 3.5, height: 12, borderRadius: 1, backgroundColor: color }} />
    </View>
  );
}

/**
 * Focusable playback timeline with a round knob at the current position that
 * shows play/pause state. The bar only renders state; the player decides what
 * OK and Left/Right do while it has focus.
 */
export function ScrubBar({ value, playing, label, preview, onSeek, onPress, ...rest }: ScrubBarProps) {
  const clamped = Math.min(1, Math.max(0, value));
  const width = useRef(0);
  const press = (e: GestureResponderEvent) => {
    // A pointer press lands somewhere on the bar (keyboard and D-pad presses don't): seek there.
    const x = e.nativeEvent?.locationX;
    if (onSeek && typeof x === 'number' && width.current > 0 && (e.nativeEvent as { pageX?: number }).pageX) {
      onSeek(Math.min(1, Math.max(0, x / width.current)));
    } else {
      onPress?.(e);
    }
  };
  return (
    <Focusable
      accessibilityRole="adjustable"
      focusScale={1}
      style={{ paddingVertical: spacing.sm }}
      onLayout={(e) => {
        width.current = e.nativeEvent.layout.width;
      }}
      onPress={press}
      {...rest}
    >
      {({ focused }) => {
        const trackHeight = focused ? 8 : 5;
        const knobColor = focused ? colors.textPrimary : colors.accent;
        const glyphColor = focused ? colors.textInverse : colors.textPrimary;
        return (
          <View style={{ height: KNOB + focus.ringWidth * 2, justifyContent: 'center' }}>
            <View style={{ height: trackHeight, borderRadius: radii.pill, backgroundColor: colors.border, overflow: 'hidden' }}>
              <View style={{ width: `${clamped * 100}%`, height: trackHeight, backgroundColor: knobColor }} />
            </View>
            <View
              style={{
                position: 'absolute',
                left: `${clamped * 100}%`,
                marginLeft: -(KNOB / 2 + focus.ringWidth),
                width: KNOB + focus.ringWidth * 2,
                height: KNOB + focus.ringWidth * 2,
                borderRadius: KNOB,
                borderWidth: focus.ringWidth,
                borderColor: focused ? colors.accentStrong : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: KNOB,
                  height: KNOB,
                  borderRadius: KNOB / 2,
                  backgroundColor: knobColor,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {playing ? <PauseGlyph color={glyphColor} /> : <PlayGlyph color={glyphColor} />}
              </View>
            </View>
            {label || preview ? (
              <View
                style={{
                  position: 'absolute',
                  left: `${clamped * 100}%`,
                  bottom: KNOB + spacing.md,
                  alignItems: 'center',
                  gap: spacing.xs,
                  transform: [{ translateX: '-50%' }],
                }}
              >
                {preview ? (
                  <View style={{ borderRadius: radii.md, overflow: 'hidden', borderWidth: 2, borderColor: colors.textPrimary, backgroundColor: colors.surface }}>
                    {preview}
                  </View>
                ) : null}
                {label ? <Text
                  variant="label"
                  style={{
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xxs,
                    borderRadius: radii.sm,
                    overflow: 'hidden',
                    backgroundColor: colors.textPrimary,
                    color: colors.textInverse,
                  }}
                >
                  {label}
                </Text> : null}
              </View>
            ) : null}
          </View>
        );
      }}
    </Focusable>
  );
}
