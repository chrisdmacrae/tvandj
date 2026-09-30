import { safeArea, spacing, useLayout } from '@tv-and-j/design-system';

/** Space the device reserves at the top and bottom (the phone's notch and home bar); the app passes it in. */
export type Insets = { top: number; bottom: number };

/** How far the player's chrome sits from the screen edges: TV overscan on a TV; elsewhere the layout's gutter, clear of the notch and home bar. */
export function usePlayerEdges(insets: Insets = { top: 0, bottom: 0 }) {
  const { breakpoint, gutter } = useLayout();
  const tv = breakpoint === 'tv';
  return {
    horizontal: tv ? safeArea.horizontal : gutter,
    top: tv ? safeArea.vertical : insets.top + spacing.md,
    bottom: tv ? safeArea.vertical : insets.bottom + spacing.md,
    isPhone: breakpoint === 'phone',
    isTv: tv,
  };
}
