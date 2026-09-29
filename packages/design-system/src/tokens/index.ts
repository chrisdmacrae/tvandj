/**
 * Design tokens — the single source of truth for the TV and J design system.
 *
 * Units are density-independent pixels (dp). Fire TV / Android TV render a
 * 1920×1080 panel at xhdpi, so the layout canvas is 960×540dp. The HTML
 * previews in `design/` use the same numbers as CSS px on a 960×540 frame.
 *
 * Keep this file dependency-free: `scripts/build-css.ts` imports it directly
 * with Node to generate `design/tokens.css`.
 */

export const canvas = {
  width: 960,
  height: 540,
} as const;

export const colors = {
  // Surfaces, darkest to lightest
  canvas: '#0B0D12',
  surface: '#151923',
  surfaceRaised: '#1E2330',
  surfaceFocused: '#2A3142',
  border: '#2A3040',
  scrim: 'rgba(11, 13, 18, 0.72)',

  // Text
  textPrimary: '#F4F5F8',
  textSecondary: '#A8AEBD',
  textTertiary: '#6B7283',
  textInverse: '#0B0D12',

  // Brand
  accent: '#8B7CFF',
  accentStrong: '#A99DFF',
  accentMuted: 'rgba(139, 124, 255, 0.20)',
  highlight: '#3CC8E8',

  // Focus
  focusRing: '#FFFFFF',

  // Status
  success: '#4ADE80',
  warning: '#FBBF24',
  danger: '#F87171',
} as const;

export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** Title-safe insets: 5% of the 960×540 canvas, per Fire TV overscan guidance. */
export const safeArea = {
  horizontal: 48,
  vertical: 27,
} as const;

export const radii = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  pill: 999,
} as const;

export const fontFamily = {
  sans: 'System',
} as const;

export const typography = {
  display: { fontSize: 40, lineHeight: 48, fontWeight: '700', letterSpacing: -0.5 },
  headline: { fontSize: 28, lineHeight: 34, fontWeight: '600', letterSpacing: -0.25 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '600', letterSpacing: 0 },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400', letterSpacing: 0 },
  label: { fontSize: 14, lineHeight: 18, fontWeight: '500', letterSpacing: 0.25 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400', letterSpacing: 0.25 },
} as const;

export type TypographyVariant = keyof typeof typography;

export const focus = {
  scale: 1.08,
  ringWidth: 3,
  ringOffset: 3,
} as const;

export const motion = {
  fast: 120,
  normal: 180,
  slow: 280,
} as const;

/** Artwork widths in dp; heights derive from the aspect ratio. */
export const artwork = {
  portrait: { width: 120, aspectRatio: 2 / 3 },
  landscape: { width: 213, aspectRatio: 16 / 9 },
  square: { width: 120, aspectRatio: 1 },
} as const;

export type ArtworkShape = keyof typeof artwork;

export const tokens = {
  canvas,
  colors,
  spacing,
  safeArea,
  radii,
  fontFamily,
  typography,
  focus,
  motion,
  artwork,
} as const;

export type Tokens = typeof tokens;
