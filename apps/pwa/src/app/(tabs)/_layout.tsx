import { Redirect, Slot, router, usePathname } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AvatarButton,
  BottomNav,
  FilmIcon,
  HomeIcon,
  IconButton,
  MusicIcon,
  SearchIcon,
  SettingsIcon,
  TabBar,
  TvIcon,
  colors,
  spacing,
  useLayout,
} from '@tv-and-j/design-system';
import { useLibraryKinds } from '@tv-and-j/core/jellyfin/library';
import { userAvatarUrl, useServerUsers } from '@tv-and-j/core/jellyfin/users';
import { GlowProvider } from '@tv-and-j/core/state/GlowContext';
import { useOnAirRadio } from '@tv-and-j/core/state/PreviewPlayer';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';
import { useSettings } from '@tv-and-j/core/state/SettingsContext';
import { CastButton } from '../../components/CastButton';
import { FocusGlow } from '../../components/FocusGlow';
import { OnAirButton } from '../../components/OnAirButton';
import { RemoteBar } from '../../components/RemoteBar';
import { BottomSpaceContext } from '../../lib/chrome';
import { useRemoteTarget } from '../../lib/remoteTarget';

type Tab = { key: '/' | '/movies' | '/tv' | '/music' | '/search'; label: string; icon: (color: string) => React.ReactNode };

const HOME: Tab = { key: '/', label: 'Home', icon: (c) => <HomeIcon color={c} /> };
const MOVIES: Tab = { key: '/movies', label: 'Movies', icon: (c) => <FilmIcon color={c} /> };
const TV: Tab = { key: '/tv', label: 'TV', icon: (c) => <TvIcon color={c} /> };
const MUSIC: Tab = { key: '/music', label: 'Music', icon: (c) => <MusicIcon color={c} /> };
const SEARCH: Tab = { key: '/search', label: 'Search', icon: (c) => <SearchIcon color={c} /> };

/** Bottom navigation height before the home-indicator inset. */
const BOTTOM_NAV = 54;
/** Room for the "Playing on…" bar while controlling another screen. */
const REMOTE_BAR = 88;
/** Room for the floating radio button on phones. */
const ON_AIR = 48;

function ProfileButton() {
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

/**
 * The main sections. Phones get tabs along the bottom (in thumb reach, clear
 * of the home indicator); tablets and desktops get the TV's top bar.
 */
export default function TabsLayout() {
  // Fresh from sign-in: ask about downloadarr once before browsing.
  const { settings } = useSettings();
  if (!settings.downloadarrAsked && !settings.downloadarrUrl) return <Redirect href="/setup-downloadarr" />;
  return (
    <GlowProvider>
      <TabsChrome />
    </GlowProvider>
  );
}

function TabsChrome() {
  const pathname = usePathname();
  const { isPhone } = useLayout();
  const insets = useSafeAreaInsets();
  const hasMusic = useLibraryKinds().data?.has('music') ?? false;
  const sections = [HOME, MOVIES, TV, ...(hasMusic ? [MUSIC] : [])];
  const all = [...sections, SEARCH];
  const selected = all.find((t) => t.key !== '/' && pathname.startsWith(t.key))?.key ?? '/';
  const go = (key: string) => key !== selected && router.replace(key as Tab['key']);
  const remoteSpace = useRemoteTarget().sessionId ? REMOTE_BAR : 0;
  const onAir = !!useOnAirRadio();

  if (isPhone) {
    const bottomSpace = BOTTOM_NAV + insets.bottom + remoteSpace + (onAir ? ON_AIR : 0);
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        <FocusGlow />
        <BottomSpaceContext value={bottomSpace}>
          <View style={{ flex: 1 }}>
            <Slot />
          </View>
        </BottomSpaceContext>
        <RemoteBar bottom={BOTTOM_NAV + insets.bottom} />
        {onAir ? (
          <View style={{ position: 'absolute', right: spacing.md, bottom: BOTTOM_NAV + insets.bottom + remoteSpace + spacing.sm }}>
            <OnAirButton variant="secondary" />
          </View>
        ) : null}
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
          <BottomNav items={all} selected={selected} onSelect={go} bottomInset={insets.bottom} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }}>
      <FocusGlow />
      <TabBar
        tabs={sections}
        selected={selected}
        onSelect={go}
        trailing={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <OnAirButton />
            <CastButton />
            <IconButton accessibilityLabel="Search" selected={selected === '/search'} icon={(c) => <SearchIcon color={c} />} onPress={() => go('/search')} />
            <IconButton accessibilityLabel="Settings" icon={(c) => <SettingsIcon color={c} />} onPress={() => router.push('/settings')} />
            <ProfileButton />
          </View>
        }
      />
      <BottomSpaceContext value={remoteSpace}>
        <View style={{ flex: 1 }}>
          <Slot />
        </View>
      </BottomSpaceContext>
      <RemoteBar bottom={insets.bottom} />
    </View>
  );
}
