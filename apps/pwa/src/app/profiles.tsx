import type { UserDto } from '@jellyfin/sdk/lib/generated-client/models';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Avatar, AvatarButton, Button, PinPad, Text, colors, spacing } from '@tv-and-j/design-system';
import { SignInError, signInWithPassword } from '@tv-and-j/core/jellyfin/auth';
import { ratingLimitLabel, useParentalRatings, userAvatarUrl, useServerUsers } from '@tv-and-j/core/jellyfin/users';
import { PIN_LENGTH, checkPin, lockedProfiles } from '@tv-and-j/core/state/profilePins';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';
import { AuthCard } from '../components/AuthCard';
import { Page } from '../components/Page';
import { goHome } from '../lib/goHome';

type Person = Pick<UserDto, 'Id' | 'Name' | 'PrimaryImageTag' | 'HasPassword' | 'Policy'> & { Id: string; Name: string };

const AVATAR = 96;

/** "Who's watching?": at launch when there's a choice (or a PIN), and from the avatar in the top bar. */
export default function Profiles() {
  const { api, auth, accounts, jellyfin, server, switchUser, signIn, chooseProfile, profileChosen } = useAuthedSession();
  const [fromSwitcher] = useState(profileChosen);
  const users = useServerUsers();
  const ratings = useParentalRatings().data;
  const [locked, setLocked] = useState<Set<string> | null>(null);
  const [picked, setPicked] = useState(false);
  const [pinFor, setPinFor] = useState<Person | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    lockedProfiles().then(setLocked);
  }, []);

  const people: Person[] = [
    ...(users.data ?? []),
    ...accounts.filter((a) => !users.data?.some((u) => u.Id === a.userId)).map((a) => ({ Id: a.userId, Name: a.userName })),
  ];
  const loading = users.isPending || locked === null;

  useEffect(() => {
    if (picked && profileChosen) goHome();
  }, [picked, profileChosen]);

  // One profile and no PIN: nothing to choose.
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
    if (person.HasPassword === false && jellyfin) {
      try {
        await signIn(await signInWithPassword(jellyfin, server.address, person.Name, ''));
        return setPicked(true);
      } catch (e) {
        return setError(e instanceof SignInError ? e.message : 'Couldn’t switch profile.');
      }
    }
    router.push({ pathname: '/switch-user', params: { userId: person.Id, name: person.Name } });
  };

  const choose = (person: Person) => {
    // Straight from sign-in there's no screen to go back to.
    if (fromSwitcher && person.Id === auth.userId) return router.canGoBack() ? router.back() : goHome();
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
    if (await checkPin(pinFor.Id, value)) enter(pinFor);
    else {
      setPin('');
      setPinError('Wrong PIN. Try again.');
    }
  };

  if (pinFor) {
    return (
      <AuthCard title={`Enter ${pinFor.Name}’s PIN`} description="This profile is locked on this device.">
        <View style={{ alignItems: 'center', gap: spacing.lg }}>
          <Avatar name={pinFor.Name} imageUri={userAvatarUrl(api, pinFor)} size={72} />
          <PinPad value={pin} onChange={onPin} length={PIN_LENGTH} error={pinError} />
        </View>
        <Button label="Back" size="sm" variant="ghost" onPress={() => setPinFor(null)} />
      </AuthCard>
    );
  }

  return (
    <Page back={fromSwitcher}>
      <View style={{ alignItems: 'center', gap: spacing.xxl, paddingHorizontal: spacing.lg, paddingVertical: spacing.xxl }}>
        <Text variant="display" style={{ textAlign: 'center' }}>
          Who’s watching?
        </Text>
        {loading ? (
          <ActivityIndicator color={colors.accent} size="large" />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xl, maxWidth: 720 }}>
            {people.map((person) => {
              const limit = ratingLimitLabel(person.Policy, ratings);
              const saved = accounts.some((a) => a.userId === person.Id);
              const note = [locked?.has(person.Id) ? 'PIN' : undefined, limit, !saved && person.HasPassword !== false ? 'Sign in needed' : undefined]
                .filter(Boolean)
                .join(' · ');
              return (
                <View key={person.Id} style={{ width: AVATAR + spacing.xl, alignItems: 'center', gap: spacing.sm }}>
                  <AvatarButton name={person.Name} imageUri={userAvatarUrl(api, person, AVATAR * 2)} size={AVATAR} accessibilityLabel={person.Name} onPress={() => choose(person)} />
                  <Text variant="title" numberOfLines={1}>
                    {person.Name}
                  </Text>
                  {note ? (
                    <Text variant="caption" tone="secondary" style={{ textAlign: 'center' }}>
                      {note}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      </View>
    </Page>
  );
}
