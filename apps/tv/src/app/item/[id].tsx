import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { ActivityIndicator, Animated, BackHandler, Platform, Pressable, ScrollView, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ArrowLeftIcon, Button, Chip, DownloadBar, IconButton, Shelf, Text, colors, safeArea, spacing } from '@tv-and-j/design-system';
import { backdropUrl, logoUrl, posterUrl } from '../../jellyfin/images';
import { downloadDisplay } from '../../components/DiscoverCard';
import { FittedText } from '../../components/FittedText';
import { MediaCard } from '../../components/MediaCard';
import { JellyfinPersonCard } from '../../components/PersonCard';
import { SeasonBrowser } from '../../components/SeasonBrowser';
import { useActiveDownload } from '../../downloadarr/hooks';
import { useSimilar, useToggleFavorite, useTogglePlayed } from '../../jellyfin/browse';
import { useItem, usePlayQueue } from '../../jellyfin/library';
import { useNextEpisode, useSegments } from '../../jellyfin/segments';
import { useRatings } from '../../jellyfin/ratings';
import { PlayerControls, formatTime } from '../../player/PlayerControls';
import { usePlayback } from '../../player/usePlayback';
import { useScrubber } from '../../player/useScrubber';
import { useRemoteKeys } from '../../player/useRemoteKeys';
import { UpNextCard } from '../../player/UpNextCard';
import { useSegmentSkip } from '../../player/useSegmentSkip';
import { useAuthedSession } from '../../state/SessionContext';
import { useSettings } from '../../state/SettingsContext';

/** summary → (5s on the artwork) preview → (15s of playback) player */
type Phase = 'summary' | 'preview' | 'player';

const ART_HOLD_MS = 5_000;
const PREVIEW_MS = 15_000;
const CONTROLS_HIDE_MS = 5_000;
const FADE_MS = 800;
const EXIT_FADE_MS = 500;
/** How much of what's below the summary (seasons, cast, more like this) peeks in before scrolling, so it's clear there's more. */
const MORE_PEEK = 96;
const CAST_LIMIT = 20;
/** Without a credits marker, offer the next episode this close to the end. */
const UP_NEXT_BEFORE_END_S = 30;
const UP_NEXT_COUNTDOWN_S = 10;
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
  // autoplay: arriving from Play on a just-downloaded title, so skip straight to the player.
  const { id, autoplay } = useLocalSearchParams<{ id: string; autoplay?: string }>();
  const { api } = useAuthedSession();
  const { width, height: screenHeight } = useWindowDimensions();
  const item = useItem(id).data;
  const similar = useSimilar(item).data ?? [];
  const toggleFavorite = useToggleFavorite();
  const togglePlayed = useTogglePlayed();
  const queue = usePlayQueue(item).data;
  const { settings } = useSettings();
  // Assigned below, once the next episode is known; the player calls it when the last item ends.
  const onEnd = useRef<() => void>(() => {});
  const playback = usePlayback(queue, { onEnd: () => onEnd.current(), active: useIsFocused() });
  const ratings = useRatings(item);
  // downloadarr activity for this title, e.g. more seasons of a show on the way.
  const download = downloadDisplay(
    useActiveDownload(
      item?.Type === 'Series' ? 'tv' : 'movie',
      item?.Type === 'Series' || item?.Type === 'Movie' ? (item.ProviderIds?.Tmdb ?? undefined) : undefined,
    ),
  );
  const downloadStatus =
    download.status && item?.Type === 'Series' ? `New episodes · ${download.status.toLowerCase()}` : download.status;
  // Stable callbacks; `playback` itself is a new object every time-update render.
  const { start, togglePlay } = playback;
  const scrubber = useScrubber(playback);
  const scrubbing = useRef(false);
  scrubbing.current = scrubber.scrubbing;
  const { step: scrubStep, commit: scrubCommit } = scrubber;

  const [phase, setPhase] = useState<Phase>('summary');
  const [controlsVisible, setControlsVisible] = useState(false);
  // Set once the viewer moves into the season/episode browser: hold the preview, don't go full screen.
  const [browsing, setBrowsing] = useState(false);
  const controlsShown = useRef(false);
  controlsShown.current = controlsVisible;
  const [tracksOpen, setTracksOpen] = useState(false);
  const tracksOpenRef = useRef(false);
  tracksOpenRef.current = tracksOpen;
  // "Start over" from the summary: begin at 0:00 instead of the resume point.
  const fromStart = useRef(false);
  // The page scrolls: the summary, then seasons, cast and more like this below it.
  // Focusing one of those rows scrolls it up into view and holds the preview.
  const scrollRef = useRef<ScrollView>(null);
  const scrollToTop = useCallback(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), []);
  const blockTops = useRef<Record<string, number>>({});
  const measureBlock = useCallback((key: string) => (e: LayoutChangeEvent) => {
    blockTops.current[key] = e.nativeEvent.layout.y;
  }, []);
  const browseTo = useCallback((key: string) => {
    setBrowsing(true);
    const top = blockTops.current[key];
    // Rows are measured inside the below-the-summary container, which starts after its fade-in edge.
    const container = (blockTops.current.more ?? 0) + spacing.xxxl;
    if (top != null) scrollRef.current?.scrollTo({ y: Math.max(0, container + top - spacing.xl), animated: true });
  }, []);
  const browseSeasons = useCallback(() => browseTo('seasons'), [browseTo]);
  const browseCast = useCallback(() => browseTo('cast'), [browseTo]);
  const browseSimilar = useCallback(() => browseTo('similar'), [browseTo]);

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
    if (autoplay) {
      setPhase('player');
      return;
    }
    const timer = setTimeout(() => setPhase('preview'), art ? ART_HOLD_MS : 0);
    return () => clearTimeout(timer);
  }, [ready, phase, art, autoplay]);

  useEffect(() => {
    if (phase !== 'preview') return;
    start({ fromStart: fromStart.current });
    Animated.timing(videoOpacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
  }, [phase, start, videoOpacity]);

  // Separate from the effect above so a changing `start` never resets the countdown.
  useEffect(() => {
    if (phase !== 'preview' || browsing) return;
    const timer = setTimeout(() => setPhase('player'), PREVIEW_MS);
    return () => clearTimeout(timer);
  }, [phase, browsing]);

  useEffect(() => {
    if (phase !== 'player') return;
    start({ fromStart: fromStart.current });
    videoOpacity.setValue(1);
    Animated.timing(expand, { toValue: 1, duration: FADE_MS, useNativeDriver: false }).start();
  }, [phase, start, expand, videoOpacity]);

  // Controls: any remote key wakes them; they sleep after a few idle seconds.
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wakeControls = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    const hide = () => {
      // Never pull the controls out from under an active scrub or the track picker.
      if (scrubbing.current || tracksOpenRef.current) hideTimer.current = setTimeout(hide, CONTROLS_HIDE_MS);
      else setControlsVisible(false);
    };
    hideTimer.current = setTimeout(hide, CONTROLS_HIDE_MS);
  }, []);
  useEffect(() => () => clearTimeout(hideTimer.current), []);
  useEffect(() => {
    if (phase === 'player') wakeControls();
  }, [phase, wakeControls]);

  // Intro/recap/credits skipping, and the next episode as the credits roll.
  const nowPlayingId = playback.stream?.itemId;
  const segments = useSegments(nowPlayingId).data ?? [];
  const skipper = useSegmentSkip(playback, segments, { enabled: phase === 'player', autoSkip: settings.playback.autoSkipIntro });
  const nextEpisode = useNextEpisode(playback.current).data ?? null;
  const [upNextDismissed, setUpNextDismissed] = useState(false);
  useEffect(() => setUpNextDismissed(false), [nowPlayingId]);
  const outro = segments.find((s) => s.type === 'Outro');
  const creditsAt = outro ? outro.start : playback.duration > UP_NEXT_BEFORE_END_S * 4 ? playback.duration - UP_NEXT_BEFORE_END_S : Infinity;
  const inCredits = phase === 'player' && !!nextEpisode && playback.currentTime >= creditsAt;
  const upNextShown = inCredits && !upNextDismissed && !controlsVisible && !tracksOpen;

  const playNext = useCallback(() => {
    if (!nextEpisode?.Id) return;
    leaving.current = true;
    playerRef.current?.pause();
    router.replace({ pathname: '/item/[id]', params: { id: nextEpisode.Id, autoplay: '1' } });
  }, [nextEpisode]);

  // Counts down while the card is up and the episode is playing; any interaction (controls) pauses it.
  const [countdown, setCountdown] = useState(UP_NEXT_COUNTDOWN_S);
  const counting = upNextShown && settings.playback.autoplayNext && playback.isPlaying;
  useEffect(() => {
    if (!inCredits) setCountdown(UP_NEXT_COUNTDOWN_S);
  }, [inCredits]);
  useEffect(() => {
    if (!counting) return;
    const tick = 250;
    const timer = setInterval(() => setCountdown((c) => Math.max(0, c - tick / 1000)), tick);
    return () => clearInterval(timer);
  }, [counting]);
  useEffect(() => {
    if (counting && countdown <= 0) playNext();
  }, [counting, countdown, playNext]);

  // The end of the last queue item: on to the next episode when allowed, otherwise back out.
  onEnd.current = () => {
    if (phase !== 'player') return;
    if (nextEpisode && settings.playback.autoplayNext && !upNextDismissed) playNext();
    else if (!playback.isAudio) leave();
  };

  // A skip or next-episode button takes focus from the hidden controls; OK on it shouldn't also wake them.
  const overlayAction = phase === 'player' && !controlsVisible && !tracksOpen && (upNextShown || !!skipper.segment);
  const overlayActionRef = useRef(false);
  overlayActionRef.current = overlayAction;
  const upNextShownRef = useRef(false);
  upNextShownRef.current = upNextShown;

  useRemoteKeys(
    useCallback(
      (event) => {
        // Android delivers key-up (1) for these; skip key-down (0) where it also arrives so a press counts once.
        // Also ignore the focus/blur pseudo-events the handler emits.
        if (phase !== 'player' || event.eventKeyAction === 0 || !REMOTE_KEYS.has(event.eventType)) return;
        if (overlayActionRef.current && (event.eventType === 'select' || (upNextShownRef.current && (event.eventType === 'left' || event.eventType === 'right')))) {
          return; // the focused Skip / Next episode buttons handle these
        }
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
            if (!controlsShown.current && !tracksOpenRef.current) scrubStep(-1);
            break;
          case 'right':
            if (!controlsShown.current && !tracksOpenRef.current) scrubStep(1);
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
      if (phase === 'player' && tracksOpen) {
        setTracksOpen(false);
        wakeControls();
      } else if (phase === 'player' && controlsVisible) {
        setControlsVisible(false);
      } else if (upNextShown) {
        setUpNextDismissed(true);
      } else {
        leave();
      }
      return true;
    });
    return () => sub.remove();
  }, [phase, controlsVisible, tracksOpen, upNextShown, leave, wakeControls]);

  const playNow = () => setPhase('player');
  const startOver = () => {
    fromStart.current = true;
    if (playback.started) playback.seekTo(0);
    setPhase('player');
  };

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
  // What Play starts: for a show that's its next-up episode, which is where the resume point lives.
  const upNext = item.Type === 'Series' ? queue?.[0] : item;
  const resumeAt = (upNext?.UserData?.PlaybackPositionTicks ?? 0) / 10_000_000;
  const nowPlaying = playback.current;
  const cast = [
    ...(item.People ?? []).filter((p) => p.Type === 'Actor').slice(0, CAST_LIMIT),
    ...(item.People ?? []).filter((p) => p.Type === 'Director' || p.Type === 'Creator'),
  ].filter((p) => p.Id);
  const artists = item.AlbumArtist ?? item.Artists?.join(', ');
  const isSeries = item.Type === 'Series';
  // Anything to scroll down to below the summary.
  const hasMore = isSeries || cast.length > 0 || similar.length > 0;
  const canList = item.Type === 'Movie' || isSeries;
  const inList = !!item.UserData?.IsFavorite;
  const watched = !!item.UserData?.Played;
  const canMarkWatched = item.Type === 'Movie' || isSeries || item.Type === 'Episode';
  const playEpisode = (episodeId: string) => {
    setBrowsing(true);
    playback.pause();
    router.push({ pathname: '/item/[id]', params: { id: episodeId, autoplay: '1' } });
  };

  const summaryPanel = (
    <Animated.View
      pointerEvents={phase === 'player' ? 'none' : 'auto'}
      style={{
        width: panelWidth,
        height: hasMore ? screenHeight - MORE_PEEK : '100%',
        paddingLeft: safeArea.horizontal,
        paddingRight: spacing.lg,
        paddingTop: safeArea.vertical,
        paddingBottom: safeArea.vertical,
        gap: spacing.md,
        opacity: panelOpacity,
      }}
    >
      {/* Back gets its own row in the top-left corner, so the summary can never run over it.
          The player has its own once it takes over. */}
      {phase !== 'player' ? (
        <View style={{ alignItems: 'flex-start' }}>
          <IconButton accessibilityLabel="Back" icon={(color) => <ArrowLeftIcon color={color} />} onPress={leave} />
        </View>
      ) : null}

      {/*
        The rest of the panel: details, then the buttons. The buttons always keep their
        space; when the details run long (a narrow panel, larger system text), the
        overview drops lines to make room rather than anything being cut off.
      */}
      <View style={{ flex: 1, minHeight: 0, justifyContent: 'center', gap: spacing.md }}>
        <View style={{ flexShrink: 1, minHeight: 0, overflow: 'hidden', gap: spacing.md }}>
          {logo ? (
            <Image source={logo} contentFit="contain" contentPosition="left" cachePolicy="memory-disk" style={{ width: '100%', height: 72 }} accessibilityLabel={title} />
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
            <FittedText tone="secondary" maxLines={7}>
              {item.Overview}
            </FittedText>
          ) : null}

          {playback.error ? (
            <Text variant="caption" style={{ color: colors.danger }}>
              {playback.error}
            </Text>
          ) : null}

          {downloadStatus ? (
            <View style={{ gap: spacing.xs }}>
              <Text variant="caption" numberOfLines={1} style={{ color: colors.highlight }}>
                {downloadStatus}
              </Text>
              <DownloadBar progress={download.download ?? undefined} />
            </View>
          ) : null}

        </View>

        {phase !== 'player' ? (
          <View style={{ gap: spacing.xs }}>
            {/* A show's Play picks an episode; say which. */}
            {isSeries && upNext ? (
              <Text variant="caption" tone="secondary" numberOfLines={1}>
                {`${resumeAt > 0 ? 'Continue' : 'Up next'} · ${episodeLine(upNext)}`}
              </Text>
            ) : null}
            {/* Side by side at the medium size to suit the narrow panel; they only wrap if they can't fit. */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              <Button
                label={resumeAt > 0 ? `Resume ${formatTime(resumeAt)}` : 'Play'}
                size="md"
                // Never disabled: a disabled button can't take focus, which would leave it on Back.
                // Pressed before the stream is ready, the player starts as soon as it is.
                hasTVPreferredFocus
                onFocus={scrollToTop}
                onPress={playNow}
              />
              {resumeAt > 0 ? <Button label="Start over" size="md" variant="secondary" onFocus={scrollToTop} onPress={startOver} /> : null}
            </View>
            {canList || canMarkWatched ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {canList ? (
                  <Button
                    label={inList ? '✓ My List' : '+ My List'}
                    size="sm"
                    variant="ghost"
                    onFocus={scrollToTop}
                    onPress={() => item.Id && !toggleFavorite.isPending && toggleFavorite.mutate({ itemId: item.Id, on: !inList })}
                  />
                ) : null}
                {canMarkWatched ? (
                  <Button
                    label={watched ? 'Mark unwatched' : isSeries ? 'Mark all watched' : 'Mark watched'}
                    size="sm"
                    variant="ghost"
                    onFocus={scrollToTop}
                    onPress={() => item.Id && !togglePlayed.isPending && togglePlayed.mutate({ itemId: item.Id, on: !watched })}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Animated.View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      {/* Media region: right two-thirds, growing to full screen for the player. */}
      <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, right: 0, left: mediaLeft, overflow: 'hidden' }}>
        {art ? (
          <Image
            source={art}
            contentFit={isAlbum ? 'contain' : 'cover'}
            cachePolicy="memory-disk"
            transition={200}
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

      {/* Summary panel: left third, with seasons, cast and more like this to scroll down to. */}
      {hasMore ? (
        <ScrollView
          ref={scrollRef}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          scrollEnabled={phase !== 'player'}
          pointerEvents={phase === 'player' ? 'none' : 'auto'}
          showsVerticalScrollIndicator={false}
        >
          {summaryPanel}
          {phase !== 'player' ? (
            <Animated.View style={{ opacity: panelOpacity }} onLayout={measureBlock('more')}>
              {/* Fades in over the artwork, then solid so it covers the art as it scrolls up. */}
              <Svg width="100%" height={spacing.xxxl}>
                <Defs>
                  <LinearGradient id="more-scrim" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={colors.canvas} stopOpacity={0} />
                    <Stop offset="1" stopColor={colors.canvas} stopOpacity={1} />
                  </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#more-scrim)" />
              </Svg>
              <View style={{ backgroundColor: colors.canvas, paddingBottom: safeArea.vertical, gap: spacing.lg }}>
                {isSeries ? (
                  <View onLayout={measureBlock('seasons')}>
                    <SeasonBrowser
                      series={item}
                      initialSeason={queue?.[0]?.ParentIndexNumber ?? undefined}
                      onPlayEpisode={playEpisode}
                      onFocus={browseSeasons}
                    />
                  </View>
                ) : null}
                {cast.length ? (
                  <View onLayout={measureBlock('cast')}>
                    <Shelf
                      title="Cast & crew"
                      data={cast}
                      keyExtractor={(p, i) => `${p.Id}-${p.Type}-${i}`}
                      renderItem={({ item: person }) => <JellyfinPersonCard person={person} onFocus={browseCast} />}
                    />
                  </View>
                ) : null}
                {similar.length ? (
                  <View onLayout={measureBlock('similar')}>
                    <Shelf
                      title="More like this"
                      data={similar}
                      keyExtractor={(i) => i.Id ?? ''}
                      renderItem={({ item: other }) => <MediaCard item={other} shape="portrait" onFocus={browseSimilar} />}
                    />
                  </View>
                ) : null}
              </View>
            </Animated.View>
          ) : null}
        </ScrollView>
      ) : (
        summaryPanel
      )}

      {phase === 'player' && playback.isAudio ? (
        <View style={{ position: 'absolute', left: safeArea.horizontal, top: safeArea.vertical }}>
          <Text variant="title">{nowPlaying?.Name}</Text>
          <Text variant="caption" tone="secondary">
            {artists}
          </Text>
        </View>
      ) : null}

      {upNextShown && nextEpisode ? (
        <UpNextCard
          episode={nextEpisode}
          countdown={settings.playback.autoplayNext ? countdown : undefined}
          total={UP_NEXT_COUNTDOWN_S}
          onPlay={playNext}
          onCancel={() => setUpNextDismissed(true)}
        />
      ) : overlayAction && skipper.label ? (
        <View style={{ position: 'absolute', right: safeArea.horizontal, bottom: safeArea.vertical + spacing.lg }}>
          <Button label={skipper.label} variant="secondary" hasTVPreferredFocus onPress={skipper.skip} />
        </View>
      ) : null}

      {phase === 'player' && !controlsVisible && !overlayAction ? (
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
          tracksOpen={tracksOpen}
          onOpenTracks={() => setTracksOpen(true)}
          action={
            inCredits && nextEpisode ? (
              <Button label="Next episode" size="sm" variant="secondary" onPress={playNext} />
            ) : skipper.label ? (
              <Button
                label={skipper.label}
                size="sm"
                variant="secondary"
                onPress={() => {
                  skipper.skip();
                  wakeControls();
                }}
              />
            ) : undefined
          }
        />
      ) : null}

      <Animated.View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.canvas, opacity: exitFade }}
      />
    </View>
  );
}
