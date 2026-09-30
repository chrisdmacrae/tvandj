import { router } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AvatarButton, IconButton, SettingsIcon, Text, spacing, useLayout } from '@tv-and-j/design-system';
import { userAvatarUrl, useServerUsers } from '@tv-and-j/core/jellyfin/users';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';

/**
 * The top of a main section on a phone (there's no top bar there): its name,
 * settings and the profile avatar. Larger screens have these in the top bar,
 * so this renders only the notch space there.
 */
export function SectionHeader({ title }: { title: string }) {
  const { api, auth } = useAuthedSession();
  const { isPhone, gutter } = useLayout();
  const insets = useSafeAreaInsets();
  const me = useServerUsers().data?.find((u) => u.Id === auth.userId);
  if (!isPhone) return <View style={{ height: spacing.md }} />;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: gutter, paddingTop: insets.top + spacing.md, paddingBottom: spacing.md }}>
      <Text variant="headline" style={{ flex: 1 }}>
        {title}
      </Text>
      <IconButton accessibilityLabel="Settings" icon={(c) => <SettingsIcon color={c} />} onPress={() => router.push('/settings')} />
      <AvatarButton
        name={auth.userName}
        imageUri={me ? userAvatarUrl(api, me) : undefined}
        accessibilityLabel={`${auth.userName}. Switch profile.`}
        onPress={() => router.push('/profiles')}
      />
    </View>
  );
}
