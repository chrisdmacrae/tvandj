import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, View } from 'react-native';
import { Avatar, AvatarButton, ListItem, Text, colors, radii, safeArea, spacing } from '@tv-and-j/design-system';
import { SignInError, signInWithPassword } from '../jellyfin/auth';
import { userAvatarUrl, useServerUsers } from '../jellyfin/users';
import { useAuthedSession } from '../state/SessionContext';

/**
 * Top-right avatar that opens a list of the server's users. Someone who has
 * signed in on this device before switches instantly; a user without a
 * password signs straight in; anyone else gets a password prompt.
 */
export function UserSwitcher() {
  const { api, auth, accounts, jellyfin, server, switchUser, signIn } = useAuthedSession();
  const users = useServerUsers();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  const me = users.data?.find((u) => u.Id === auth.userId);
  // Jellyfin's public list leaves out hidden users, but anyone already signed in on this TV belongs here.
  const people = [
    ...(users.data ?? []),
    ...accounts
      .filter((a) => !users.data?.some((u) => u.Id === a.userId))
      .map((a) => ({ Id: a.userId, Name: a.userName, PrimaryImageTag: undefined, HasPassword: undefined })),
  ];

  const choose = async (user: { Id: string; Name: string; HasPassword?: boolean | null }) => {
    setError(undefined);
    if (user.Id === auth.userId) return setOpen(false);
    if (accounts.some((a) => a.userId === user.Id)) {
      await switchUser(user.Id);
      return setOpen(false);
    }
    if (user.HasPassword === false && jellyfin) {
      setBusy(user.Id);
      try {
        await signIn(await signInWithPassword(jellyfin, server.address, user.Name, ''));
        setOpen(false);
      } catch (e) {
        setError(e instanceof SignInError ? e.message : 'Couldn’t switch user.');
      } finally {
        setBusy(null);
      }
      return;
    }
    setOpen(false);
    router.push({ pathname: '/switch-user', params: { userId: user.Id, name: user.Name } });
  };

  return (
    <>
      <AvatarButton
        name={auth.userName}
        imageUri={me ? userAvatarUrl(api, me) : undefined}
        accessibilityLabel={`${auth.userName}. Switch user.`}
        onPress={() => setOpen(true)}
      />

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.scrim, alignItems: 'flex-end', paddingHorizontal: safeArea.horizontal, paddingTop: safeArea.vertical + 48 }}>
          <View style={{ width: 340, maxHeight: '80%', padding: spacing.lg, gap: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surface }}>
            <Text variant="label" tone="secondary">
              Who’s watching?
            </Text>
            {users.isPending ? <ActivityIndicator color={colors.accent} /> : null}
            <ScrollView contentContainerStyle={{ gap: spacing.sm, padding: spacing.xs }}>
              {people.map((user) => {
                const current = user.Id === auth.userId;
                const saved = accounts.some((a) => a.userId === user.Id);
                return (
                  <ListItem
                    key={user.Id}
                    title={user.Name}
                    subtitle={current ? 'Watching now' : saved || user.HasPassword === false ? undefined : 'Sign in needed'}
                    leading={<Avatar name={user.Name} imageUri={userAvatarUrl(api, user)} size={36} />}
                    trailing={busy === user.Id ? 'Signing in…' : undefined}
                    hasTVPreferredFocus={current}
                    onPress={() => choose(user)}
                  />
                );
              })}
            </ScrollView>
            {error ? (
              <Text variant="caption" style={{ color: colors.danger }}>
                {error}
              </Text>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}
