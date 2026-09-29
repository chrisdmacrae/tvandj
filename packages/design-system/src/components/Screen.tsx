import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, safeArea } from '../tokens';

export type ScreenProps = {
  children: ReactNode;
  /** Apply title-safe horizontal insets. Disable for edge-to-edge rows like Shelf. */
  inset?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Screen({ children, inset = true, style }: ScreenProps) {
  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: colors.canvas,
          paddingVertical: safeArea.vertical,
          paddingHorizontal: inset ? safeArea.horizontal : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
