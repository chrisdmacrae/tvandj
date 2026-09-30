import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, ScrollView, TVFocusGuideView, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import {
  ArrowLeftIcon,
  Button,
  Chip,
  DownloadBar,
  IconButton,
  Shelf,
  Text,
  colors,
  safeArea,
  spacing,
} from '@tv-and-j/design-system';
import type { DiscoverDetails, MediaKind } from '@tv-and-j/core/downloadarr/client';
import {
  requestKey,
  useDiscoverDetails,
  useMediaStatus,
  useRequestIndex,
  useRequestMedia,
  useRequestSeasons,
  useRetryRequest,
  type MediaStatus,
} from '@tv-and-j/core/downloadarr/hooks';
import { DiscoverCard } from '../../../components/DiscoverCard';
import { FittedText } from '../../../components/FittedText';
import { TmdbPersonCard } from '../../../components/PersonCard';
import { SeasonBrowser } from '../../../components/SeasonBrowser';
import { YouTubeTrailer } from '../../../components/YouTubeTrailer';
import { useJellyfinSeries } from '@tv-and-j/core/jellyfin/library';
import { TRAILER_IN_FLIGHT_KEY, useSettings, type Settings } from '@tv-and-j/core/state/SettingsContext';

const QUALITY_LABEL = { '1080p': '1080p', '4k': '4K' } as const;
const CODEC_LABEL = { h264: 'H.264', hevc: 'HEVC' } as const;

function preferenceSummary(prefs: Settings['request']) {
  const languages = prefs.languages.map((l) => l[0].toUpperCase() + l.slice(1));
  return [
    prefs.qualities.map((q) => QUALITY_LABEL[q]).join(' or '),
    prefs.codecs.map((c) => CODEC_LABEL[c]).join(' or '),
    languages.join(', '),
  ].join(' · ');
}

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** How much of what's below the summary peeks in before scrolling, so it's clear there's more. */
const MORE_PEEK = 96;
/** Artwork first, then the trailer, like a library title's preview. */
const ART_HOLD_MS = 5_000;
const TRAILER_FADE_MS = 800;

// react-native-web has no focus guides; a plain View is fine there.
const FocusGuide = TVFocusGuideView ?? View;

type TrailerState = 'waiting' | 'loading' | 'playing' | 'done';

/**
 * A title from downloadarr's discovery that isn't in Jellyfin (yet). Request
 * it, watch it download, and once Jellyfin has indexed it, play it. Below the
 * summary: seasons that have arrived, cast & crew, and more like this.
 */
export default function DiscoverScreen() {
  const { kind, tmdbId } = useLocalSearchParams<{ kind: MediaKind; tmdbId: string }>();
  const { width, height: screenHeight } = useWindowDimensions();
  const details = useDiscoverDetails(kind, tmdbId);
  const status = useMediaStatus(kind, tmdbId);
  const item = details.data;
  const isTv = kind === 'tv';
  const requestSeasons = useRequestSeasons(isTv ? tmdbId : undefined).data;
  const series = useJellyfinSeries(isTv ? tmdbId : undefined, isTv ? item?.title : undefined, item?.year).data ?? undefined;
  // Any delivered episode, or the show turning up in Jellyfin, means there's something to browse.
  const showSeasons =
    isTv &&
    (!!series || !!requestSeasons?.some((s) => s.status === 'COMPLETED' || s.episodes?.some((e) => e.status === 'COMPLETED')));
  const playEpisode = (episodeId: string) =>
    router.push({ pathname: '/item/[id]', params: { id: episodeId, autoplay: '1' } });

  // The page scrolls; focusing a row below the summary scrolls it up into view.
  const scrollRef = useRef<ScrollView>(null);
  const scrollToTop = useCallback(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), []);
  const blockTops = useRef<Record<string, number>>({});
  const measureBlock = useCallback((key: string) => (e: LayoutChangeEvent) => {
    blockTops.current[key] = e.nativeEvent.layout.y;
  }, []);
  const browseTo = useCallback((key: string) => {
    const top = blockTops.current[key];
    // Rows are measured inside the below-the-summary container, which starts after its fade-in edge.
    const container = (blockTops.current.more ?? 0) + spacing.xxxl;
    if (top != null) scrollRef.current?.scrollTo({ y: Math.max(0, container + top - spacing.xl), animated: true });
  }, []);
  const browseSeasons = useCallback(() => browseTo('seasons'), [browseTo]);
  const browseCast = useCallback(() => browseTo('cast'), [browseTo]);
  const browseSimilar = useCallback(() => browseTo('similar'), [browseTo]);

  // Trailer: after a few seconds on the artwork, load YouTube's player unseen and fade it in
  // once it's actually playing. Leaving the page stops it; coming back starts over.
  const { settings } = useSettings();
  const focused = useIsFocused();
  // Not on the web, and not in emulators: their WebView often can't render (and crashes the app).
  const trailerKey = settings.playback.trailers && Platform.OS !== 'web' && Device.isDevice ? item?.trailer : undefined;
  const [trailer, setTrailer] = useState<TrailerState>('waiting');
  const trailerOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!focused) {
      setTrailer('waiting');
      trailerOpacity.setValue(0);
      return;
    }
    if (!trailerKey || trailer !== 'waiting') return;
    const timer = setTimeout(() => {
      // Recorded before the web view exists, so a crash while it starts is remembered (see TRAILER_IN_FLIGHT_KEY).
      AsyncStorage.setItem(TRAILER_IN_FLIGHT_KEY, '1')
        .catch(() => {})
        .then(() => setTrailer('loading'));
    }, ART_HOLD_MS);
    return () => clearTimeout(timer);
  }, [focused, trailerKey, trailer, trailerOpacity]);
  const trailerPlaying = useCallback(() => {
    setTrailer('playing');
    Animated.timing(trailerOpacity, { toValue: 1, duration: TRAILER_FADE_MS, useNativeDriver: true }).start();
  }, [trailerOpacity]);
  const trailerDone = useCallback(() => {
    Animated.timing(trailerOpacity, { toValue: 0, duration: TRAILER_FADE_MS, useNativeDriver: true }).start(() => setTrailer('done'));
  }, [trailerOpacity]);
  // The page's main buttons: where focus goes instead of into the trailer.
  const [actions, setActions] = useState<View | null>(null);

  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' }}>
        {details.isError ? (
          <Text tone="secondary">Couldn’t load this title from downloadarr.</Text>
        ) : (
          <ActivityIndicator color={colors.accent} size="large" />
        )}
      </View>
    );
  }

  const panelWidth = width / 3;
  const genres = item.genre ?? item.genres ?? [];
  const cast = item.cast ?? [];
  // Older downloadarr has no structured cast; fall back to its one-line summary.
  const people = cast.length ? undefined : kind === 'movie' ? item.actors : item.creator ? `Created by ${item.creator}` : item.actors;
  const similar = (item.recommendations ?? []).filter((r) => r.type === kind);
  const hasMore = showSeasons || cast.length > 0 || similar.length > 0;

  const summary = (
    <View
      style={{
        width: panelWidth,
        height: hasMore ? screenHeight - MORE_PEEK : screenHeight,
        paddingLeft: safeArea.horizontal,
        paddingRight: spacing.lg,
        paddingTop: safeArea.vertical,
        paddingBottom: safeArea.vertical,
        gap: spacing.md,
      }}
    >
      {/* Back gets its own row, so the summary can never run over it. */}
      <View style={{ alignItems: 'flex-start' }}>
        <IconButton accessibilityLabel="Back" icon={(color) => <ArrowLeftIcon color={color} />} onPress={goBack} />
      </View>

      {/*
        The rest of the panel: details, then the request/play action. The action always
        keeps its space; when the details run long, the overview drops lines to make room.
      */}
      <View style={{ flex: 1, minHeight: 0, justifyContent: 'center', gap: spacing.md }}>
        <View style={{ flexShrink: 1, minHeight: 0, overflow: 'hidden', gap: spacing.md }}>
          <Text variant="headline" numberOfLines={2}>
            {item.title}
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {item.rating ? <Chip leading="★" tone="accent" label={item.rating.toFixed(1)} /> : null}
            {item.year ? <Chip label={String(item.year)} /> : null}
            {kind === 'movie' && item.runtime ? <Chip label={`${Math.floor(item.runtime / 60)}h ${item.runtime % 60}m`} /> : null}
            {kind === 'tv' && item.seasons ? <Chip label={`${item.seasons} season${item.seasons === 1 ? '' : 's'}`} /> : null}
            {item.network ? <Chip label={item.network} /> : null}
          </View>

          {genres.length ? (
            <Text variant="caption" tone="secondary" numberOfLines={1}>
              {genres.slice(0, 3).join(' · ')}
            </Text>
          ) : null}

          {item.overview || item.plot ? (
            <FittedText tone="secondary" maxLines={7}>
              {(item.overview ?? item.plot)!}
            </FittedText>
          ) : null}

          {people ? (
            <Text variant="caption" tone="tertiary" numberOfLines={2}>
              {people.startsWith('Created') ? people : `Starring ${people}`}
            </Text>
          ) : null}

        </View>

        <View ref={setActions} collapsable={false}>
          <Action kind={kind} details={item} status={status} onFocus={scrollToTop} />
        </View>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={{ position: 'absolute', top: 0, bottom: 0, right: 0, left: panelWidth }}>
        {item.backdrop || item.poster ? (
          <Image
            source={item.backdrop ?? item.poster}
            contentFit={item.backdrop ? 'cover' : 'contain'}
            cachePolicy="memory-disk"
            transition={200}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
        ) : null}
        {trailerKey && (trailer === 'loading' || trailer === 'playing') ? (
          // A web view can take D-pad focus; anything heading into it is sent back to the page's buttons.
          <FocusGuide destinations={actions ? [actions] : []} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <Animated.View style={{ flex: 1, opacity: trailerOpacity }}>
              <YouTubeTrailer videoKey={trailerKey} onPlaying={trailerPlaying} onDone={trailerDone} />
            </Animated.View>
          </FocusGuide>
        ) : null}
        <Svg style={{ position: 'absolute', top: 0, bottom: 0, left: 0 }} width={160} height="100%">
          <Defs>
            <LinearGradient id="discover-edge" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={colors.canvas} stopOpacity={1} />
              <Stop offset="1" stopColor={colors.canvas} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#discover-edge)" />
        </Svg>
      </View>

      {hasMore ? (
        <ScrollView
          ref={scrollRef}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          showsVerticalScrollIndicator={false}
        >
          {summary}
          <View onLayout={measureBlock('more')}>
            {/* Fades in over the artwork, then solid so it covers the art as it scrolls up. */}
            <Svg width="100%" height={spacing.xxxl}>
              <Defs>
                <LinearGradient id="discover-more-scrim" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={colors.canvas} stopOpacity={0} />
                  <Stop offset="1" stopColor={colors.canvas} stopOpacity={1} />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#discover-more-scrim)" />
            </Svg>
            <View style={{ backgroundColor: colors.canvas, paddingBottom: safeArea.vertical, gap: spacing.lg }}>
              {showSeasons ? (
                <View onLayout={measureBlock('seasons')}>
                  <SeasonBrowser series={series} tmdbId={tmdbId} onPlayEpisode={playEpisode} onFocus={browseSeasons} />
                </View>
              ) : null}
              {cast.length ? (
                <View onLayout={measureBlock('cast')}>
                  <Shelf
                    title="Cast & crew"
                    data={cast}
                    keyExtractor={(p, i) => `${p.id}-${p.department}-${i}`}
                    renderItem={({ item: person }) => <TmdbPersonCard person={person} onFocus={browseCast} />}
                  />
                </View>
              ) : null}
              {similar.length ? (
                <View onLayout={measureBlock('similar')}>
                  <Shelf
                    title="More like this"
                    data={similar}
                    keyExtractor={(r) => requestKey(kind, r.id)}
                    renderItem={({ item: other }) => <DiscoverCard item={other} kind={kind} onFocus={browseSimilar} />}
                  />
                </View>
              ) : null}
            </View>
          </View>
        </ScrollView>
      ) : (
        summary
      )}
    </View>
  );
}

function Action({ kind, details, status, onFocus }: { kind: MediaKind; details: DiscoverDetails; status: MediaStatus; onFocus?: () => void }) {
  const { settings } = useSettings();
  const request = useRequestMedia(kind);
  const retry = useRetryRequest();
  const requests = useRequestIndex();

  switch (status.state) {
    case 'available':
      return (
        <Button
          label="Play"
          size="md"
          hasTVPreferredFocus
          onFocus={onFocus}
          onPress={() => router.replace({ pathname: '/item/[id]', params: { id: status.jellyfinId, autoplay: '1' } })}
        />
      );

    case 'none':
      return (
        <View style={{ gap: spacing.sm }}>
          <Button
            label={request.isPending ? 'Requesting…' : 'Request'}
            size="md"
            hasTVPreferredFocus
            onFocus={onFocus}
            disabled={request.isPending}
            onPress={() => request.mutate(details)}
          />
          <Text variant="caption" tone={request.isError ? 'primary' : 'tertiary'} style={request.isError ? { color: colors.danger } : undefined}>
            {request.isError ? request.error.message : preferenceSummary(settings.request)}
          </Text>
        </View>
      );

    case 'failed': {
      const id = requests.data?.[requestKey(kind, details.tmdbId ?? details.id)]?.id;
      return (
        <View style={{ gap: spacing.sm }}>
          <Text variant="label" style={{ color: colors.danger }}>
            Couldn’t find a download matching your settings.
          </Text>
          <Button
            label={retry.isPending ? 'Searching…' : 'Try again'}
            size="md"
            hasTVPreferredFocus
            onFocus={onFocus}
            disabled={!id || retry.isPending}
            onPress={() => id && retry.mutate(id)}
          />
        </View>
      );
    }

    default:
      return <Progress status={status} />;
  }
}

function Progress({ status }: { status: MediaStatus }) {
  const label =
    status.state === 'downloading'
      ? status.progress == null
        ? 'Downloading…'
        : `Downloading · ${Math.round(status.progress * 100)}%${status.eta ? ` · ${status.eta} left` : ''}`
      : status.state === 'indexing'
        ? 'Downloaded · adding to your library…'
        : status.state === 'requested'
          ? status.label
          : '';

  return (
    // No button while in flight; Back stays focusable, and Play takes focus when it appears.
    <View accessible accessibilityLabel={label} style={{ gap: spacing.sm, width: '100%' }}>
      <Text variant="label" style={{ color: colors.highlight }}>
        {label}
      </Text>
      <DownloadBar progress={status.state === 'downloading' ? (status.progress ?? undefined) : undefined} height={6} />
      <Text variant="caption" tone="tertiary">
        {status.state === 'indexing'
          ? 'It’ll be ready to play as soon as Jellyfin finds it.'
          : 'You can leave this screen; it keeps going in the background.'}
      </Text>
    </View>
  );
}
