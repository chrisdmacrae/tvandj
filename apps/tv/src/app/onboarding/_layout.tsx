import { Stack } from 'expo-router';
import { colors } from '@tv-and-j/design-system';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: colors.canvas },
      }}
    />
  );
}
