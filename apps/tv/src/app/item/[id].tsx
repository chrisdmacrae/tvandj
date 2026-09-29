import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { router, useLocalSearchParams } from 'expo-router';
import { VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, BackHandler, Image, Platform, Pressable, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ArrowLeftIcon, Button, Chip, IconButton, Text, colors, safeArea, spacing } from '@tv-and-j/design-system';
import { backdropUrl, logoUrl, posterUrl } from '../../jellyfin/images';
import { useItem, usePlayQueue } from '../../jellyfin/library';
import { useRatings } from '../../jellyfin/ratings';
import { PlayerControls, formatTime } from '../../player/PlayerControls';
import { usePlayback } from '../../player/usePlayback';
import { useScrubber } from '../../player/useScrubber';
import { useRemoteKeys } from '../../player/useRemoteKeys';
import { useAuthedSession } from '../../state/SessionContext';

/** summary → (5s on the artwork) preview → (15s of playback) player */
type Phase = 'summary' | 'preview' | 'player';

const ART_HOLD_MS = 5_000;
const PREVIEW_MS = 15_000;
const CONTROLS_HIDE_MS = 5_000;
const FADE_MS = 800;
const EXIT_FADE_MS = 500;
const REMOTE_KEYS = new Set(['up', 'down', 'left', 'right', 'select', 'playPause', 'play', 'pause', 'rewind', 'fastForward', 'info']);

function runtime(ticks?: number | null) {
  if (!ticks) return undefined;
  const minutes = Math.round(ticks / 600_000_000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

function episodeLine(item: BaseItemDto) {
  if (item.Type !== 'Episode') return undefined;
  const code = item.ParentIndexNumber != null && item.IndexNumber != null ? `S${item.ParentIndexNumber}:E${item.IndexNumber}` : '';
  return [code, item.Name].filter(Boolean).join(' · ');
}

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useAuthedSession();
  const { width } = useWindowDimensions();
  const item = useItem(id).data;
  const queue = usePlayQueue(item).data;
  const playback = usePlayback(queue);
  const ratings = useRatings(item);
  // Stable callbacks; `playback` itself is a new object every time-update render.
  const { start, togglePlay } = playback;
  const scrubber = useScrubber(playback);
  const scrubbing = useRef(false);
  scrubbing.current = scrubber.scrubbing;
  const { step: scrubStep, commit: scrubCommit } = scrubber;

  const [phase, setPhase] = useState<Phase>('summary');
  const [controlsVisible, setControlsVisible] = useState(false);
  const controlsShown = useRef(false);
  controlsShown.current = controlsVisible;

  const isAlbum = item?.Type === 'MusicAlbum';
  const art = item ? (isAlbum ? posterUrl(api, item, 1200) : backdropUrl(api, item)) : undefined;
  const logo = item && !isAlbum ? logoUrl(api, item) : undefined;

  // Animated values: the video fades in over the art, then the panel fades out
  // while the media region grows from the right two-thirds to full screen.
  const videoOpacity = useRef(new Animated.Value(0)).current;
  const expand = useRef(new Animated.Value(0)).current;

  // Leaving fades everything, video included, to the background while the audio ramps
  // down, then navigates back so the stack's fade reveals the previous screen. The video
  // renders on its own surface, which ignores ancestor opacity, so this is an overlay on
  // top rather than a fade of the screen itself.
  const exitFade = useRef(new Animated.Value(0)).current;
  const leaving = useRef(false);
  const playerRef = useRef(playback.player);
  playerRef.current = playback.player;
  const leave = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    const p = playerRef.current;
    const startVolume = p?.volume ?? 1;
    const listener = exitFade.addListener(({ value }) => {
      if (p && playerRef.current === p) p.volume = startVolume * (1 - value);
    });
    Animated.timing(exitFade, { toValue: 1, duration: EXIT_FADE_MS, useNativeDriver: false }).start(() => {
      exitFade.removeListener(listener);
      if (p && playerRef.current === p) p.pause();
      // Opened directly (deep link, web reload) there's no history, so fall back to Home.
      if (router.canGoBack()) router.back();
      else router.replace('/');
    });
  }, [exitFade]);

  // Timeline. Starts once there's something to play; no art means no wait.
  const ready = !!item && !!playback.stream;
  useEffect(() => {
    if (!ready || phase !== 'summary') return;
    const timer = setTimeout(() => setPhase('preview'), art ? ART_HOLD_MS : 0);
    return () => clearTimeout(timer);
  }, [ready, phase, art]);

  useEffect(() => {
    if (phase !== 'preview') return;
    start();
    Animated.timing(videoOpacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
  }, [phase, start, videoOpacity]);

  // Separate from the effect above so a changing `start` never resets the countdown.
  useEffect(() => {
    if (phase !== 'preview') return;
    const timer = setTimeout(() => setPhase('player'), PREVIEW_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'player') return;
    start();
    videoOpacity.setValue(1);
    Animated.timing(expand, { toValue: 1, duration: FADE_MS, useNativeDriver: false }).start();
  }, [phase, start, expand, videoOpacity]);

  // Controls: any remote key wakes them; they sleep after a few idle seconds.
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wakeControls = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    const hide = () => {
      // Never pull the controls out from under an active scrub.
      if (scrubbing.current) hideTimer.current = setTimeout(hide, CONTROLS_HIDE_MS);
      else setControlsVisible(false);
    };
    hideTimer.current = setTimeout(hide, CONTROLS_HIDE_MS);
  }, []);
  useEffect(() => () => clearTimeout(hideTimer.current), []);
  useEffect(() => {
    if (phase === 'player') wakeControls();
  }, [phase, wakeControls]);

  useRemoteKeys(
    useCallback(
      (event) => {
        // Android delivers key-up (1) for these; skip key-down (0) where it also arrives so a press counts once.
        // Also ignore the focus/blur pseudo-events the handler emits.
        if (phase !== 'player' || event.eventKeyAction === 0 || !REMOTE_KEYS.has(event.eventType)) return;
        switch (event.eventType) {
          case 'playPause':
          case 'play':
          case 'pause':
            if (scrubbing.current) scrubCommit();
            else togglePlay();
            break;
          // The remote's ⏪/⏩ keys drive the same continuous scrub as the timeline.
          case 'rewind':
            scrubStep(-1);
            break;
          case 'fastForward':
            scrubStep(1);
            break;
          // With the controls hidden, Left/Right start scrubbing straight away (OK only wakes the
          // controls). Once visible, the focused timeline handles these itself.
          case 'left':
            if (!controlsShown.current) scrubStep(-1);
            break;
          case 'right':
            if (!controlsShown.current) scrubStep(1);
            break;
        }
        wakeControls();
      },
      [phase, togglePlay, scrubStep, scrubCommit, wakeControls],
    ),
  );

  // Back: first hides the controls, then leaves.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (phase === 'player' && controlsVisible) {
        setControlsVisible(false);
      } else {
        leave();
      }
      return true;
    });
    return () => sub.remove();
  }, [phase, controlsVisible, leave]);

  const playNow = () => setPhase('player');

  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  const panelWidth = width / 3;
  const mediaLeft = expand.interpolate({ inputRange: [0, 1], outputRange: [panelWidth, 0] });
  const panelOpacity = expand.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const title = item.Type === 'Episode' ? (item.SeriesName ?? item.Name ?? '') : (item.Name ?? '');
  const resumeAt = item.UserData?.PlaybackPositionTicks ? item.UserData.PlaybackPositionTicks / 10_000_000 : 0;
  const nowPlaying = playback.current;
  const actors = (item.People ?? []).filter((p) => p.Type === 'Actor').slice(0, 4).map((p) => p.Name);
  const artists = item.AlbumArtist ?? item.Artists?.join(', ');

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      {/* Media region: right two-thirds, growing to full screen for the player. */}
      <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, right: 0, left: mediaLeft, overflow: 'hidden' }}>
        {art ? (
          <Image
            source={{ uri: art }}
            resizeMode={isAlbum ? 'contain' : 'cover'}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
        ) : null}
        {!playback.isAudio && playback.player ? (
          <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: videoOpacity, backgroundColor: colors.canvas }}>
            {/* Preview fills its region edge to edge; the full player shows the whole frame. */}
            <VideoView
              player={playback.player}
              nativeControls={false}
              contentFit={phase === 'player' ? 'contain' : 'cover'}
              style={{ flex: 1 }}
            />
          </Animated.View>
        ) : null}
        {/* Soft left edge so the media melts into the panel. */}
        <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 160, opacity: panelOpacity }}>
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="edge" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={colors.canvas} stopOpacity={1} />
                <Stop offset="1" stopColor={colors.canvas} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#edge)" />
          </Svg>
        </Animated.View>
      </Animated.View>

      {/* Summary panel: left third. */}
      <Animated.View
        pointerEvents={phase === 'player' ? 'none' : 'auto'}
        style={{
          width: panelWidth,
          height: '100%',
          justifyContent: 'center',
          paddingLeft: safeArea.horizontal,
          paddingRight: spacing.lg,
          paddingVertical: safeArea.vertical,
          gap: spacing.md,
          opacity: panelOpacity,
        }}
      >
        {/* Back sits in the panel's top-left corner; the player has its own once it takes over. */}
        {phase !== 'player' ? (
          <View style={{ position: 'absolute', top: safeArea.vertical, left: safeArea.horizontal }}>
            <IconButton accessibilityLabel="Back" icon={(color) => <ArrowLeftIcon color={color} />} onPress={leave} />
          </View>
        ) : null}
        {logo ? (
          <Image source={{ uri: logo }} resizeMode="contain" style={{ width: '100%', height: 72, alignSelf: 'flex-start' }} accessibilityLabel={title} />
        ) : (
          <Text variant="headline" numberOfLines={2}>
            {title}
          </Text>
        )}
        {episodeLine(item) ? <Text variant="label" tone="secondary">{episodeLine(item)}</Text> : null}
        {isAlbum && artists ? <Text variant="label" tone="secondary">{artists}</Text> : null}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {ratings.imdb ? <Chip leading="IMDb" tone="warning" label={ratings.imdb} /> : null}
          {ratings.rottenTomatoes != null ? (
            <Chip leading="🍅" tone={ratings.rottenTomatoes >= 60 ? 'danger' : 'success'} label={`${ratings.rottenTomatoes}%`} />
          ) : null}
          {ratings.audience ? <Chip leading="★" tone="accent" label={ratings.audience} /> : null}
          {item.ProductionYear ? <Chip label={String(item.ProductionYear)} /> : null}
          {item.OfficialRating ? <Chip label={item.OfficialRating} /> : null}
          {runtime(item.RunTimeTicks) ? <Chip label={runtime(item.RunTimeTicks)!} /> : null}
          {isAlbum && item.ChildCount ? <Chip label={`${item.ChildCount} tracks`} /> : null}
        </View>

        {item.Genres?.length ? (
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {item.Genres.slice(0, 3).join(' · ')}
          </Text>
        ) : null}

        {item.Overview ? (
          <Text variant="body" tone="secondary" numberOfLines={7}>
            {item.Overview}
          </Text>
        ) : null}

        {actors.length ? (
          <Text variant="caption" tone="tertiary" numberOfLines={2}>
            Starring {actors.join(', ')}
          </Text>
        ) : null}

        {playback.error ? (
          <Text variant="caption" style={{ color: colors.danger }}>
            {playback.error}
          </Text>
        ) : null}

        {phase !== 'player' ? (
          <View style={{ marginTop: spacing.sm }}>
            <Button
              label={resumeAt > 0 ? `Resume ${formatTime(resumeAt)}` : 'Play'}
              size="lg"
              hasTVPreferredFocus
              disabled={!playback.stream}
              onPress={playNow}
            />
          </View>
        ) : null}
      </Animated.View>

      {phase === 'player' && playback.isAudio ? (
        <View style={{ position: 'absolute', left: safeArea.horizontal, top: safeArea.vertical }}>
          <Text variant="title">{nowPlaying?.Name}</Text>
          <Text variant="caption" tone="secondary">
            {artists}
          </Text>
        </View>
      ) : null}

      {phase === 'player' && !controlsVisible ? (
        // While the controls sleep, this invisible full-screen target holds D-pad focus so
        // key presses keep reaching the app; any of them wakes the controls.
        <Pressable
          focusable
          hasTVPreferredFocus
          accessibilityLabel="Show player controls"
          onPress={wakeControls}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : null}

      {phase === 'player' && controlsVisible ? (
        <PlayerControls
          playback={playback}
          scrubber={scrubber}
          title={playback.isAudio ? (nowPlaying?.Name ?? title) : title}
          subtitle={playback.isAudio ? artists : episodeLine(nowPlaying ?? item)}
          onInteract={wakeControls}
          onBack={leave}
        />
      ) : null}

      <Animated.View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.canvas, opacity: exitFade }}
      />
    </View>
  );
}
