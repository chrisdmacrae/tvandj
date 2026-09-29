import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors, radii } from '../tokens';

export type DownloadBarProps = {
  /** 0–1. Omit for an indeterminate state (searching, queued, waiting to be indexed). */
  progress?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
};

const SWEEP_MS = 1400;

/**
 * Progress for something still arriving: filled in the "live" highlight
 * colour with a shimmer sweeping through it, so it reads differently from
 * the static accent ProgressBar used for playback position.
 */
export function DownloadBar({ progress, height = 4, style }: DownloadBarProps) {
  const indeterminate = progress === undefined;
  const clamped = indeterminate ? 1 : Math.min(1, Math.max(0, progress));
  const [width, setWidth] = useState(0);
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: SWEEP_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);

  const fillWidth = width * clamped;
  const bandWidth = Math.max(24, fillWidth * 0.4);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={indeterminate ? undefined : { min: 0, max: 100, now: Math.round(clamped * 100) }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[{ height, borderRadius: radii.pill, backgroundColor: colors.border, overflow: 'hidden' }, style]}
    >
      <View
        style={{
          width: fillWidth,
          height,
          overflow: 'hidden',
          backgroundColor: colors.highlight,
          opacity: indeterminate ? 0.35 : 1,
        }}
      >
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: bandWidth,
            transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-bandWidth, fillWidth] }) }],
          }}
        >
          <Svg width={bandWidth} height={height}>
            <Defs>
              <LinearGradient id="download-shimmer" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#fff" stopOpacity={0} />
                <Stop offset="0.5" stopColor="#fff" stopOpacity={indeterminate ? 1 : 0.7} />
                <Stop offset="1" stopColor="#fff" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={bandWidth} height={height} fill="url(#download-shimmer)" />
          </Svg>
        </Animated.View>
      </View>
    </View>
  );
}
