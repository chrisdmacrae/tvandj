import { Stack } from 'expo-router';
import { colors } from '@tv-and-j/design-system';

export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas }, animation: 'fade' }} />;
}
