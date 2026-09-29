import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { ActivityIndicator, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import {
  ArrowLeftIcon,
  Button,
  Chip,
  DownloadBar,
  IconButton,
  Text,
  colors,
  safeArea,
  spacing,
} from '@tv-and-j/design-system';
import type { DiscoverDetails, MediaKind } from '../../../downloadarr/client';
import {
  requestKey,
  useDiscoverDetails,
  useMediaStatus,
  useRequestIndex,
  useRequestMedia,
  useRequestSeasons,
  useRetryRequest,
  type MediaStatus,
} from '../../../downloadarr/hooks';
import { SEASONS_HEIGHT, SeasonsSection } from '../../../components/SeasonBrowser';
import { useJellyfinSeries } from '../../../jellyfin/library';
import { useSettings, type Settings } from '../../../state/SettingsContext';

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

/**
 * A title from downloadarr's discovery that isn't in Jellyfin (yet). Request
 * it, watch it download, and once Jellyfin has indexed it, play it.
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
  const people = kind === 'movie' ? item.actors : item.creator ? `Created by ${item.creator}` : item.actors;

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

      <View
        style={{
          width: panelWidth,
          height: showSeasons ? screenHeight - SEASONS_HEIGHT : '100%',
          justifyContent: showSeasons ? 'flex-end' : 'center',
          paddingLeft: safeArea.horizontal,
          paddingRight: spacing.lg,
          // With seasons below, content starts under the Back button so it can't run into it.
          paddingTop: showSeasons ? safeArea.vertical + 48 : safeArea.vertical,
          paddingBottom: showSeasons ? spacing.sm : safeArea.vertical,
          gap: showSeasons ? spacing.sm : spacing.md,
        }}
      >
        <View style={{ position: 'absolute', top: safeArea.vertical, left: safeArea.horizontal }}>
          <IconButton accessibilityLabel="Back" icon={(color) => <ArrowLeftIcon color={color} />} onPress={goBack} />
        </View>

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

        {genres.length && !showSeasons ? (
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {genres.slice(0, 3).join(' · ')}
          </Text>
        ) : null}

        {item.overview || item.plot ? (
          <Text variant="body" tone="secondary" numberOfLines={showSeasons ? 2 : 6}>
            {item.overview ?? item.plot}
          </Text>
        ) : null}

        {people && !showSeasons ? (
          <Text variant="caption" tone="tertiary" numberOfLines={2}>
            {people.startsWith('Created') ? people : `Starring ${people}`}
          </Text>
        ) : null}

        <View style={{ marginTop: spacing.sm }}>
          <Action kind={kind} details={item} status={status} />
        </View>
      </View>

      {showSeasons ? <SeasonsSection series={series} tmdbId={tmdbId} onPlayEpisode={playEpisode} /> : null}
    </View>
  );
}

function Action({ kind, details, status }: { kind: MediaKind; details: DiscoverDetails; status: MediaStatus }) {
  const { settings } = useSettings();
  const request = useRequestMedia(kind);
  const retry = useRetryRequest();
  const requests = useRequestIndex();

  switch (status.state) {
    case 'available':
      return (
        <Button
          label="Play"
          size="lg"
          hasTVPreferredFocus
          onPress={() => router.replace({ pathname: '/item/[id]', params: { id: status.jellyfinId, autoplay: '1' } })}
        />
      );

    case 'none':
      return (
        <View style={{ gap: spacing.sm }}>
          <Button
            label={request.isPending ? 'Requesting…' : 'Request'}
            size="lg"
            hasTVPreferredFocus
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
            size="lg"
            hasTVPreferredFocus
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
