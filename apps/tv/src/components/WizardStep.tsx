import type { ReactNode } from 'react';
import { View } from 'react-native';
import { GodRays, Screen, Text, spacing } from '@tv-and-j/design-system';

type WizardStepProps = {
  step: number;
  totalSteps: number;
  title: string;
  description: string;
  children: ReactNode;
};

/**
 * Two-column onboarding layout (the Android TV "guided step" pattern):
 * explanation on the left, focusable choices on the right, god rays behind.
 * The rays are deterministic, so the fade between steps hides the handoff.
 */
export function WizardStep({ step, totalSteps, title, description, children }: WizardStepProps) {
  return (
    <Screen style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xxxl }}>
      <GodRays />
      <View style={{ flex: 2, gap: spacing.md }}>
        <Text variant="label" tone="accent">
          Step {step} of {totalSteps}
        </Text>
        <Text variant="headline">{title}</Text>
        <Text tone="secondary">{description}</Text>
      </View>
      <View style={{ flex: 3, gap: spacing.lg }}>{children}</View>
    </Screen>
  );
}
