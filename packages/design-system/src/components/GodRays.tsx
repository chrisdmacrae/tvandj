import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../tokens';

export type GodRaysProps = {
  /** Horizontal position of the light source, 0 (left) – 1 (right). */
  originX?: number;
  /** Overall strength, 0–1. Keep it low behind text. */
  intensity?: number;
  /** Colour the beams fade into; match the surface behind the rays. */
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
};

type Ray = { angle: number; width: number; tint: 'accent' | 'highlight' };

// Fixed, hand-tuned fan so the composition is the same on every launch.
// Angles are degrees clockwise from pointing straight right (90 = straight down).
const RAYS_BACK: Ray[] = [
  { angle: 40, width: 70, tint: 'accent' },
  { angle: 64, width: 120, tint: 'accent' },
  { angle: 90, width: 55, tint: 'highlight' },
  { angle: 110, width: 100, tint: 'accent' },
  { angle: 136, width: 80, tint: 'accent' },
];
const RAYS_FRONT: Ray[] = [
  { angle: 52, width: 45, tint: 'highlight' },
  { angle: 78, width: 80, tint: 'accent' },
  { angle: 122, width: 55, tint: 'highlight' },
];

/** Bell-shaped falloff across a beam so both sides feather out like a blur. */
const CROSS_FALLOFF: [offset: number, opacity: number][] = [
  [0, 0],
  [0.15, 0.03],
  [0.3, 0.1],
  [0.42, 0.19],
  [0.5, 0.22],
  [0.58, 0.19],
  [0.7, 0.1],
  [0.85, 0.03],
  [1, 0],
];


/** Slow ping-pong between two values, eased so it never visibly reverses. */
function sway(value: Animated.Value, duration: number) {
  const ease = Easing.inOut(Easing.sin);
  return Animated.loop(
    Animated.sequence([
      Animated.timing(value, { toValue: 1, duration, easing: ease, useNativeDriver: true }),
      Animated.timing(value, { toValue: 0, duration, easing: ease, useNativeDriver: true }),
    ]),
  );
}

function RayLayer({
  rays,
  width,
  height,
  originX,
  id,
}: {
  rays: Ray[];
  width: number;
  height: number;
  originX: number;
  id: string;
}) {
  const length = Math.hypot(width, height);
  return (
    <Svg width={width} height={height}>
      <Defs>
        {/* Gradient runs across the beam (local y); constant-width beams keep it aligned to the edges. */}
        {(['accent', 'highlight'] as const).map((tint) => (
          <LinearGradient key={tint} id={`${id}-${tint}`} x1="0" y1="0" x2="0" y2="1">
            {CROSS_FALLOFF.map(([offset, opacity]) => (
              <Stop key={offset} offset={offset} stopColor={colors[tint]} stopOpacity={opacity} />
            ))}
          </LinearGradient>
        ))}
      </Defs>
      {rays.map((ray) => (
        <Rect
          key={ray.angle}
          x={0}
          y={-ray.width / 2}
          width={length}
          height={ray.width}
          transform={`translate(${originX} 0) rotate(${ray.angle})`}
          fill={`url(#${id}-${ray.tint})`}
        />
      ))}
    </Svg>
  );
}

/**
 * Ambient light shafts falling from the top of the screen. Draw it once
 * behind content; the sway is a native-driven rotate/opacity on
 * pre-rendered layers, so it costs nothing on the JS thread.
 */
export function GodRays({ originX = 0.32, intensity = 0.9, backgroundColor = colors.canvas, style }: GodRaysProps) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(false);
  const back = useRef(new Animated.Value(0)).current;
  const front = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    // Co-prime durations so the layers never line up into a visible loop.
    const animations = [sway(back, 13000), sway(front, 17000), sway(pulse, 7000)];
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [reduceMotion, back, front, pulse]);

  // Layers are wider than the screen so rotating them never reveals an edge.
  const layer = useMemo(() => {
    const width = screenW * 1.8;
    const height = screenH * 1.4;
    return { width, height, left: screenW * originX - width / 2, originX: width / 2 };
  }, [screenW, screenH, originX]);

  const layerStyle = {
    position: 'absolute' as const,
    top: 0,
    left: layer.left,
    width: layer.width,
    height: layer.height,
    transformOrigin: '50% 0%',
  };

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden', opacity: intensity }, style]}>
      <Animated.View
        style={[
          layerStyle,
          {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }),
            transform: [{ rotate: back.interpolate({ inputRange: [0, 1], outputRange: ['-4deg', '3deg'] }) }],
          },
        ]}
      >
        <RayLayer id="back" rays={RAYS_BACK} {...layer} />
      </Animated.View>
      <Animated.View
        style={[
          layerStyle,
          {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }),
            transform: [{ rotate: front.interpolate({ inputRange: [0, 1], outputRange: ['5deg', '-3deg'] }) }],
          },
        ]}
      >
        <RayLayer id="front" rays={RAYS_FRONT} {...layer} />
      </Animated.View>
      {/*
        Static overlay: fades the beams out with distance by fogging them into
        the background colour, and adds bloom where the light enters.
      */}
      <Svg style={StyleSheet.absoluteFill} width={screenW} height={screenH}>
        <Defs>
          <RadialGradient id="fog" cx={screenW * originX} cy={0} r={screenH * 1.2} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={backgroundColor} stopOpacity={0} />
            <Stop offset="0.3" stopColor={backgroundColor} stopOpacity={0.15} />
            <Stop offset="0.65" stopColor={backgroundColor} stopOpacity={0.75} />
            <Stop offset="1" stopColor={backgroundColor} stopOpacity={1} />
          </RadialGradient>
          <RadialGradient id="bloom" cx={screenW * originX} cy={0} r={screenH * 0.8} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={colors.accentStrong} stopOpacity={0.3} />
            <Stop offset="0.4" stopColor={colors.accentStrong} stopOpacity={0.08} />
            <Stop offset="1" stopColor={colors.accentStrong} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={screenW} height={screenH} fill="url(#fog)" />
        <Rect x={0} y={0} width={screenW} height={screenH} fill="url(#bloom)" />
      </Svg>
    </View>
  );
}
