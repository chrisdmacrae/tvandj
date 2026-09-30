import type { ReactNode } from 'react';
import { View } from 'react-native';
import { AmbientGlow, colors } from '@tv-and-j/design-system';
import { GlowProvider, useGlowColor } from '@tv-and-j/core/state/GlowContext';

/** Glow from the top edge in the focused card's colour; stays on the last one when focus moves off the cards. */
export function FocusGlow() {
  const color = useGlowColor();
  return <AmbientGlow color={color} />;
}

/** A full screen of cards with the focus glow behind it (grids, collections, people). */
export function GlowScreen({ children }: { children: ReactNode }) {
  return (
    <GlowProvider>
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        <FocusGlow />
        {children}
      </View>
    </GlowProvider>
  );
}
