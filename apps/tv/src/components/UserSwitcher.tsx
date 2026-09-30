import { router } from 'expo-router';
import { AvatarButton } from '@tv-and-j/design-system';
import { userAvatarUrl, useServerUsers } from '../jellyfin/users';
import { useAuthedSession } from '../state/SessionContext';

/** The current profile's avatar in the top bar; opens "Who's watching?". */
export function UserSwitcher() {
  const { api, auth } = useAuthedSession();
  const me = useServerUsers().data?.find((u) => u.Id === auth.userId);
  return (
    <AvatarButton
      name={auth.userName}
      imageUri={me ? userAvatarUrl(api, me) : undefined}
      accessibilityLabel={`${auth.userName}. Switch profile.`}
      onPress={() => router.push('/profiles')}
    />
  );
}
