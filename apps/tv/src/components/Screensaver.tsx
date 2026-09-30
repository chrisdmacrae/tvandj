import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { usePathname } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Modal, Platform, Pressable, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Text, colors, safeArea, spacing } from '@tv-and-j/design-system';
import { backdropUrl, logoUrl } from '@tv-and-j/core/jellyfin/images';
import { useRemoteKeys } from '@tv-and-j/player/useRemoteKeys';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';
import { useSettings } from '@tv-and-j/core/state/SettingsContext';

const SLIDE_MS = 15_000;
const CROSSFADE_MS = 2_000;
/** Slow drift while each backdrop is up (Ken Burns). */
const ZOOM = 1.08;

/**
 * Screens where the TV can drift into the screensaver: browsing. Not a title
 * page (a preview or playback runs there), search (someone's typing) or
 * settings.
 */
const IDLE_SCREENS = [/^\/$/, /^\/movies$/, /^\/tv$/, /^\/library\//, /^\/collection\//, /^\/person\//, /^\/people\//];

/**
 * After a few idle minutes on the browse screens, library backdrops drift by
 * full screen with the title and the time, Apple TV style. Any key comes
 * back. Backdrops come from the profile's own library, so its content limits
 * apply.
 */
export function Screensaver() {
  const { settings } = useSettings();
  const pathname = usePathname();
  const minutes = settings.screensaverMinutes;
  const eligible = Platform.OS !== 'web' && minutes > 0 && IDLE_SCREENS.some((r) => r.test(pathname));
  const [showing, setShowing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const restart = useCallback(() => {
    clearTimeout(timer.current);
    if (eligible) timer.current = setTimeout(() => setShowing(true), minutes * 60_000);
  }, [eligible, minutes]);

  useEffect(() => {
    restart();
    return () => clearTimeout(timer.current);
  }, [restart, pathname]);

  // Any remote activity (keys, focus moving) counts as someone watching.
  useRemoteKeys(
    useCallback(() => {
      if (!showing) restart();
    }, [showing, restart]),
  );

  const dismiss = useCallback(() => {
    setShowing(false);
    restart();
  }, [restart]);

  return showing ? <Slideshow onDismiss={dismiss} /> : null;
}

function useBackdrops() {
  const { api, auth } = useAuthedSession();
  return useQuery({
    queryKey: ['screensaver', auth.userId],
    staleTime: 0,
    queryFn: async () => {
      const { data } = await getLibraryApi(api).getItems({
        userId: auth.userId,
        recursive: true,
        includeItemTypes: ['Movie', 'Series'],
        imageTypes: ['Backdrop'],
        sortBy: ['Random'],
        limit: 40,
        enableImageTypes: ['Backdrop', 'Logo'],
      });
      return (data.Items ?? []).filter((i) => i.BackdropImageTags?.length);
    },
  });
}

function Slideshow({ onDismiss }: { onDismiss: () => void }) {
  const { api } = useAuthedSession();
  const items = useBackdrops().data ?? [];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % items.length), SLIDE_MS);
    return () => clearInterval(t);
  }, [items.length]);

  // Any key wakes it (and never reaches the screen underneath: the modal has focus).
  useRemoteKeys(
    useCallback(
      (event) => {
        if (event.eventType === 'focus' || event.eventType === 'blur') return;
        onDismiss();
      },
      [onDismiss],
    ),
  );

  // The previous backdrop stays underneath while the next fades in over it (same keys,
  // so React keeps its instance and its zoom mid-drift).
  const slides = items.length ? (index > 0 || items.length > 1 ? [items[(index - 1 + items.length) % items.length], items[index]] : [items[0]]) : [];
  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={onDismiss}>
      <Pressable
        focusable
        hasTVPreferredFocus
        accessibilityLabel="Screensaver. Press any button to go back."
        onPress={onDismiss}
        style={{ flex: 1, backgroundColor: colors.canvas }}
      >
        {slides.map((slide) => (
          <Slide key={slide.Id} item={slide} uri={backdropUrl(api, slide)} logo={logoUrl(api, slide, 500)} />
        ))}
        <Clock />
      </Pressable>
    </Modal>
  );
}

function Slide({ item, uri, logo }: { item: BaseItemDto; uri?: string; logo?: string }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: CROSSFADE_MS, useNativeDriver: true }),
      Animated.timing(scale, { toValue: ZOOM, duration: SLIDE_MS + CROSSFADE_MS, useNativeDriver: true }),
    ]).start();
  }, [opacity, scale]);

  return (
    <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity }}>
      <Animated.View style={{ flex: 1, transform: [{ scale }] }}>
        {uri ? <Image source={uri} contentFit="cover" cachePolicy="memory-disk" style={{ flex: 1 }} /> : null}
      </Animated.View>
      <Svg style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} width="100%" height="45%">
        <Defs>
          <LinearGradient id="screensaver-scrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.canvas} stopOpacity={0} />
            <Stop offset="1" stopColor={colors.canvas} stopOpacity={0.85} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#screensaver-scrim)" />
      </Svg>
      <View style={{ position: 'absolute', left: safeArea.horizontal, bottom: safeArea.vertical, gap: spacing.xs, maxWidth: '50%' }}>
        {logo ? (
          <Image source={logo} contentFit="contain" contentPosition="left" style={{ width: 260, height: 80 }} accessibilityLabel={item.Name ?? undefined} />
        ) : (
          <Text variant="headline" numberOfLines={2}>
            {item.Name}
          </Text>
        )}
        {item.ProductionYear ? (
          <Text variant="caption" tone="secondary">
            {item.ProductionYear}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <Text variant="headline" style={{ position: 'absolute', top: safeArea.vertical, right: safeArea.horizontal }}>
      {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
    </Text>
  );
}
