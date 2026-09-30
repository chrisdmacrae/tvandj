import type { UserDto } from '@jellyfin/sdk/lib/generated-client/models';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { ArrowLeftIcon, Avatar, AvatarButton, Button, IconButton, PinPad, Text, colors, safeArea, spacing } from '@tv-and-j/design-system';
import { WizardStep } from '../components/WizardStep';
import { SignInError, signInWithPassword } from '../jellyfin/auth';
import { ratingLimitLabel, useParentalRatings, userAvatarUrl, useServerUsers } from '../jellyfin/users';
import { goHome } from '../lib/navigation';
import { PIN_LENGTH, checkPin, lockedProfiles } from '../state/profilePins';
import { useAuthedSession } from '../state/SessionContext';

type Person = Pick<UserDto, 'Id' | 'Name' | 'PrimaryImageTag' | 'HasPassword' | 'Policy'> & { Id: string; Name: string };

const AVATAR = 112;

/**
 * "Who's watching?": at launch (when there's more than one profile, or the
 * profile has a PIN) and from the avatar in the top bar. Profiles saved on
 * this TV switch instantly, locked ones ask for their PIN first, and anyone
 * who hasn't signed in here yet signs in once.
 */
export default function Profiles() {
  const session = useAuthedSession();
  const { api, auth, accounts, jellyfin, server, switchUser, signIn, chooseProfile, profileChosen } = session;
  // Opened from the top bar (a profile is already chosen) rather than at launch.
  const [fromSwitcher] = useState(profileChosen);
  const users = useServerUsers();
  const ratings = useParentalRatings().data;
  const [locked, setLocked] = useState<Set<string> | null>(null);
  const [picked, setPicked] = useState(false);
  const [pinFor, setPinFor] = useState<Person | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string>();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    lockedProfiles().then(setLocked);
  }, []);

  // Everyone on the server this user can see, plus anyone already signed in on this TV
  // (Jellyfin's public list leaves out hidden users).
  const people: Person[] = [
    ...(users.data ?? []),
    ...accounts
      .filter((a) => !users.data?.some((u) => u.Id === a.userId))
      .map((a) => ({ Id: a.userId, Name: a.userName })),
  ];
  const loading = users.isPending || locked === null;

  // Once the switch has landed (the guard lets the rest of the app through), go home as the new profile.
  useEffect(() => {
    if (picked && session.profileChosen) goHome();
  }, [picked, session.profileChosen]);

  // One profile and no PIN: nothing to choose at launch.
  useEffect(() => {
    if (fromSwitcher || loading || picked) return;
    if (people.length <= 1 && !locked?.has(auth.userId)) {
      chooseProfile();
      setPicked(true);
    }
  }, [fromSwitcher, loading, picked, people.length, locked, auth.userId, chooseProfile]);

  const enter = async (person: Person) => {
    setError(undefined);
    if (person.Id === auth.userId) {
      chooseProfile();
      return setPicked(true);
    }
    if (accounts.some((a) => a.userId === person.Id)) {
      await switchUser(person.Id);
      return setPicked(true);
    }
    // Not signed in on this TV yet: no password needed, or ask for it once.
    if (person.HasPassword === false && jellyfin) {
      setBusy(person.Id);
      try {
        await signIn(await signInWithPassword(jellyfin, server.address, person.Name, ''));
        setPicked(true);
      } catch (e) {
        setError(e instanceof SignInError ? e.message : 'Couldn’t switch profile.');
      } finally {
        setBusy(null);
      }
      return;
    }
    router.push({ pathname: '/switch-user', params: { userId: person.Id, name: person.Name } });
  };

  const choose = (person: Person) => {
    // Picking the profile you're already in from the top bar: just close.
    if (fromSwitcher && person.Id === auth.userId) return router.back();
    if (locked?.has(person.Id)) {
      setPin('');
      setPinError(undefined);
      return setPinFor(person);
    }
    enter(person);
  };

  const onPin = async (value: string) => {
    setPin(value);
    setPinError(undefined);
    if (!pinFor || value.length < PIN_LENGTH) return;
    if (await checkPin(pinFor.Id, value)) {
      enter(pinFor);
    } else {
      setPin('');
      setPinError('Wrong PIN. Try again.');
    }
  };

  if (pinFor) {
    return (
      <WizardStep title={`Enter ${pinFor.Name}’s PIN`} description="This profile is locked on this TV.">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xxxl }}>
          <Avatar name={pinFor.Name} imageUri={userAvatarUrl(api, pinFor)} size={AVATAR} />
          <PinPad value={pin} onChange={onPin} length={PIN_LENGTH} error={pinError} hasTVPreferredFocus />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button label="Back" size="sm" variant="ghost" onPress={() => setPinFor(null)} />
          <Button
            label="Forgot PIN?"
            size="sm"
            variant="ghost"
            // Their Jellyfin password proves who they are, and clears the PIN.
            onPress={() => router.push({ pathname: '/switch-user', params: { userId: pinFor.Id, name: pinFor.Name, resetPin: '1' } })}
          />
        </View>
      </WizardStep>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingHorizontal: safeArea.horizontal, paddingVertical: safeArea.vertical }}>
      {fromSwitcher ? (
        <View style={{ position: 'absolute', top: safeArea.vertical, left: safeArea.horizontal, zIndex: 1 }}>
          <IconButton accessibilityLabel="Back" icon={(color) => <ArrowLeftIcon color={color} />} onPress={() => router.back()} />
        </View>
      ) : null}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xxl }}>
        <Text variant="display">Who’s watching?</Text>
        {loading ? (
          <ActivityIndicator color={colors.accent} size="large" />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, maxWidth: '100%' }}
            contentContainerStyle={{ gap: spacing.xxl, padding: spacing.md }}
          >
            {people.map((person) => {
              const isLocked = locked?.has(person.Id);
              const limit = ratingLimitLabel(person.Policy, ratings);
              const saved = accounts.some((a) => a.userId === person.Id);
              const note =
                busy === person.Id
                  ? 'Signing in…'
                  : [isLocked ? 'PIN' : undefined, limit, !saved && person.HasPassword !== false ? 'Sign in needed' : undefined]
                      .filter(Boolean)
                      .join(' · ');
              return (
                <View key={person.Id} style={{ width: AVATAR + spacing.xl, alignItems: 'center', gap: spacing.sm }}>
                  <AvatarButton
                    name={person.Name}
                    imageUri={userAvatarUrl(api, person, AVATAR * 2)}
                    size={AVATAR}
                    accessibilityLabel={[person.Name, isLocked ? 'locked with a PIN' : undefined, limit].filter(Boolean).join(', ')}
                    hasTVPreferredFocus={person.Id === auth.userId}
                    onPress={() => choose(person)}
                  />
                  <Text variant="title" numberOfLines={1}>
                    {person.Name}
                  </Text>
                  {note ? (
                    <Text variant="caption" tone="secondary" numberOfLines={2} style={{ textAlign: 'center' }}>
                      {note}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        )}
        {error ? (
          <Text variant="caption" style={{ color: colors.danger }}>
            {error}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
