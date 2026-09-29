import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { motion } from '../tokens';

export type AmbientGlowProps = {
  /** Any CSS colour; null fades the glow out. */
  color: string | null;
  /** Share of the screen height the glow reaches down. */
  reach?: number;
  intensity?: number;
};

const FADE_MS = motion.slow * 2;

function GlowLayer({ color, width, height, id }: { color: string; width: number; height: number; id: string }) {
  return (
    <Svg width={width} height={height}>
      <Defs>
        <RadialGradient id={id} cx={width / 2} cy={0} rx={width * 0.7} ry={height} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={color} stopOpacity={0.55} />
          <Stop offset="0.45" stopColor={color} stopOpacity={0.18} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * A soft wash of colour from the top edge, e.g. taken from the focused
 * card's artwork. Two layers cross-fade on the native driver, so moving
 * focus quickly across a row stays smooth. Sits behind content.
 */
export function AmbientGlow({ color, reach = 0.6, intensity = 1 }: AmbientGlowProps) {
  const { width, height: screenHeight } = useWindowDimensions();
  const height = screenHeight * reach;
  // Each layer keeps its colour; `front` says which one is showing.
  const [layers, setLayers] = useState<[string | null, string | null]>([color, null]);
  const [front, setFront] = useState<0 | 1>(0);
  const mix = useRef(new Animated.Value(color ? 0 : 1)).current; // 0 = layer A, 1 = layer B

  const current = layers[front];
  useEffect(() => {
    if (color === current) return;
    const next: 0 | 1 = front === 0 ? 1 : 0;
    setLayers((prev) => {
      const copy: [string | null, string | null] = [...prev];
      copy[next] = color;
      return copy;
    });
    setFront(next);
    Animated.timing(mix, {
      toValue: next,
      duration: FADE_MS,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [color, current, front, mix]);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: intensity }]}>
      {layers.map((c, i) =>
        c ? (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              opacity: mix.interpolate({ inputRange: [0, 1], outputRange: i === 0 ? [1, 0] : [0, 1] }),
            }}
          >
            <GlowLayer color={c} width={width} height={height} id={`ambient-glow-${i}`} />
          </Animated.View>
        ) : null,
      )}
    </View>
  );
}
