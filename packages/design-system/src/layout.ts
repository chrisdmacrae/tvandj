import { Platform, useWindowDimensions } from 'react-native';
import { breakpoints, gutters } from './tokens';

export type Breakpoint = 'tv' | 'phone' | 'tablet' | 'desktop';

export function breakpointFor(width: number): Breakpoint {
  if (Platform.isTV) return 'tv';
  if (width >= breakpoints.desktop) return 'desktop';
  if (width >= breakpoints.tablet) return 'tablet';
  return 'phone';
}

/**
 * Which layout this screen gets, and its side margin. A TV is always 'tv'
 * (its 960dp-wide canvas would otherwise read as a tablet); everything else
 * goes by width, and follows rotation and window resizes.
 */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const breakpoint = breakpointFor(width);
  return {
    breakpoint,
    width,
    height,
    gutter: gutters[breakpoint],
    isPhone: breakpoint === 'phone',
    /** Pointer and keyboard: desktop browsers (and big tablets with a trackpad, which read as desktop). */
    isDesktop: breakpoint === 'desktop',
  };
}
