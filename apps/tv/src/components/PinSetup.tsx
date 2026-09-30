import { useState } from 'react';
import { Modal, View } from 'react-native';
import { Button, PinPad, Text, colors, radii, spacing } from '@tv-and-j/design-system';
import { PIN_LENGTH, checkPin, setPin } from '@tv-and-j/core/state/profilePins';

type Step = 'current' | 'new' | 'confirm';

type PinSetupProps = {
  userId: string;
  /** The profile has a PIN already (changing or removing it asks for it first). */
  hasPin: boolean;
  /** Remove the PIN instead of setting a new one. */
  remove?: boolean;
  onDone: (changed: boolean) => void;
};

const PROMPT: Record<Step, string> = {
  current: 'Enter your current PIN',
  new: 'Choose a 4-digit PIN',
  confirm: 'Enter it again to confirm',
};

/** Set, change or remove a profile's PIN: current PIN first if there is one, then the new one twice. */
export function PinSetup({ userId, hasPin, remove, onDone }: PinSetupProps) {
  const [step, setStep] = useState<Step>(hasPin ? 'current' : 'new');
  const [value, setValue] = useState('');
  const [chosen, setChosen] = useState('');
  const [error, setError] = useState<string>();

  const onChange = async (next: string) => {
    setValue(next);
    setError(undefined);
    if (next.length < PIN_LENGTH) return;
    setValue('');
    if (step === 'current') {
      if (!(await checkPin(userId, next))) return setError('Wrong PIN. Try again.');
      if (remove) {
        await setPin(userId, null);
        return onDone(true);
      }
      return setStep('new');
    }
    if (step === 'new') {
      setChosen(next);
      return setStep('confirm');
    }
    if (next !== chosen) {
      setStep('new');
      return setError('Those didn’t match. Choose a PIN again.');
    }
    await setPin(userId, next);
    onDone(true);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => onDone(false)}>
      <View style={{ flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ padding: spacing.xl, gap: spacing.lg, borderRadius: radii.lg, backgroundColor: colors.surface, alignItems: 'center' }}>
          <Text variant="title">{remove && step === 'current' ? 'Enter your PIN to remove it' : PROMPT[step]}</Text>
          {/* Remount per step so focus returns to the first key. */}
          <PinPad key={step} value={value} onChange={onChange} length={PIN_LENGTH} error={error} hasTVPreferredFocus />
          <Button label="Cancel" size="sm" variant="ghost" onPress={() => onDone(false)} />
        </View>
      </View>
    </Modal>
  );
}
