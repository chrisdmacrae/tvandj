import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, colors, radii, spacing, useLayout } from '@tv-and-j/design-system';

/** Sign-in and setup screens: the brand mark and a centred card, full width on phones. */
export function AuthCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { isPhone, gutter } = useLayout();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: gutter,
        paddingTop: insets.top + spacing.xl,
        paddingBottom: insets.bottom + spacing.xl,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View
        style={{
          width: '100%',
          maxWidth: 440,
          gap: spacing.lg,
          padding: isPhone ? 0 : spacing.xl,
          borderRadius: radii.lg,
          backgroundColor: isPhone ? 'transparent' : colors.surface,
        }}
      >
        <Image source="/icons/icon-192.png" style={{ width: 56, height: 56, borderRadius: radii.md }} accessibilityLabel="TV and J" />
        <View style={{ gap: spacing.xs }}>
          <Text variant="headline">{title}</Text>
          {description ? <Text tone="secondary">{description}</Text> : null}
        </View>
        {children}
      </View>
    </ScrollView>
  );
}
