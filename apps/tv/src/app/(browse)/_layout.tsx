import { Slot, router, usePathname } from 'expo-router';
import { View } from 'react-native';
import { IconButton, SearchIcon, SettingsIcon, TabBar, colors, spacing } from '@tv-and-j/design-system';
import { FocusGlow } from '../../components/GlowScreen';
import { NowPlayingButton } from '../../components/NowPlayingButton';
import { UserSwitcher } from '../../components/UserSwitcher';
import { useLibraryKinds } from '@tv-and-j/core/jellyfin/library';
import { GlowProvider } from '../../state/GlowContext';

const TABS = [
  { key: '/', label: 'Home' },
  { key: '/movies', label: 'Movies' },
  { key: '/tv', label: 'TV' },
];
const MUSIC_TAB = { key: '/music', label: 'Music' };

export default function BrowseLayout() {
  return (
    <GlowProvider>
      <BrowseChrome />
    </GlowProvider>
  );
}

/** Top-level sections share the tab bar; Up from the first row reaches it. */
function BrowseChrome() {
  const pathname = usePathname();
  const hasMusic = useLibraryKinds().data?.has('music') ?? false;
  const tabs = hasMusic ? [...TABS, MUSIC_TAB] : TABS;
  const selected = tabs.find((t) => t.key !== '/' && pathname.startsWith(t.key))?.key ?? '/';

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <FocusGlow />
      <TabBar
        tabs={tabs}
        selected={selected}
        // Replace, not push: switching tabs shouldn't pile up Back history.
        onSelect={(key) => key !== selected && router.replace(key as '/' | '/movies' | '/tv' | '/music')}
        trailing={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <NowPlayingButton />
            <IconButton accessibilityLabel="Search" icon={(color) => <SearchIcon color={color} />} onPress={() => router.push('/search')} />
            <IconButton
              accessibilityLabel="Settings"
              icon={(color) => <SettingsIcon color={color} />}
              onPress={() => router.push('/settings')}
            />
            <UserSwitcher />
          </View>
        }
      />
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
    </View>
  );
}
