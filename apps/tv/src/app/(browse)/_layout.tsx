import { Slot, router, usePathname } from 'expo-router';
import { View } from 'react-native';
import { AmbientGlow, IconButton, SearchIcon, SettingsIcon, TabBar, colors, spacing } from '@tv-and-j/design-system';
import { UserSwitcher } from '../../components/UserSwitcher';
import { GlowProvider, useGlowColor } from '../../state/GlowContext';

const TABS = [
  { key: '/', label: 'Home' },
  { key: '/movies', label: 'Movies' },
  { key: '/tv', label: 'TV' },
];

/** Glow from the top edge in the focused card's colour; stays on the last one when focus moves to the tab bar. */
function FocusGlow() {
  const color = useGlowColor();
  return <AmbientGlow color={color} />;
}

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
  const selected = TABS.find((t) => t.key !== '/' && pathname.startsWith(t.key))?.key ?? '/';

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <FocusGlow />
      <TabBar
        tabs={TABS}
        selected={selected}
        // Replace, not push: switching tabs shouldn't pile up Back history.
        onSelect={(key) => key !== selected && router.replace(key as '/' | '/movies' | '/tv')}
        trailing={
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
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
