import { View } from 'react-native';
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
export function ScrubBar({ value, playing, label, ...rest }: ScrubBarProps) {
  const clamped = Math.min(1, Math.max(0, value));
  return (
    <Focusable accessibilityRole="adjustable" focusScale={1} style={{ paddingVertical: spacing.sm }} {...rest}>
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
            {label ? (
              <View
                style={{
                  position: 'absolute',
                  left: `${clamped * 100}%`,
                  bottom: KNOB + spacing.md,
                  transform: [{ translateX: '-50%' }],
                }}
              >
                <Text
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
                </Text>
              </View>
            ) : null}
          </View>
        );
      }}
    </Focusable>
  );
}
