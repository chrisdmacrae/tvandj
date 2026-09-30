import { AmbientGlow } from '@tv-and-j/design-system';
import { useGlowColor } from '@tv-and-j/core/state/GlowContext';

/** Glow from the top edge in the colour of the card last focused or hovered. */
export function FocusGlow() {
  return <AmbientGlow color={useGlowColor()} />;
}
