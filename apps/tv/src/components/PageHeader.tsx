import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ArrowLeftIcon, IconButton, Text, safeArea, spacing } from '@tv-and-j/design-system';

/** Back button and page title for screens outside the tab bar. */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <View style={{ paddingTop: safeArea.vertical, paddingBottom: spacing.lg, gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
        <IconButton
          accessibilityLabel="Back"
          icon={(color) => <ArrowLeftIcon color={color} />}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
        <Text variant="headline" numberOfLines={1} style={{ flex: 1 }}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}
