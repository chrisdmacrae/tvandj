import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ArrowLeftIcon, Avatar, Button, Chip, DownloadBar, IconButton, Shelf, Text, colors, spacing, useLayout } from '@tv-and-j/design-system';
import type { DiscoverDetails, MediaKind } from '@tv-and-j/core/downloadarr/client';
import {
  requestKey,
  useDiscoverDetails,
  useMediaStatus,
  useRequestIndex,
  useRequestMedia,
  useRetryRequest,
  type MediaStatus,
} from '@tv-and-j/core/downloadarr/hooks';
import { useJellyfinSeries } from '@tv-and-j/core/jellyfin/library';
import { useSettings, type Settings } from '@tv-and-j/core/state/SettingsContext';
import { DiscoverCard } from '../../../components/DiscoverCard';
import { Episodes } from '../../../components/Episodes';
import { RemoveRequestButton } from '../../../components/RemoveRequestButton';
import { goBack } from '../../../lib/nav';

const QUALITY_LABEL = { '1080p': '1080p', '4k': '4K' } as const;
const CODEC_LABEL = { h264: 'H.264', hevc: 'HEVC' } as const;

function preferenceSummary(prefs: Settings['request']) {
  const languages = prefs.languages.map((l) => l[0].toUpperCase() + l.slice(1));
  return [prefs.qualities.map((q) => QUALITY_LABEL[q]).join(' or '), prefs.codecs.map((c) => CODEC_LABEL[c]).join(' or '), languages.join(', ')].join(' · ');
}

/** YouTube's own player, in place of the backdrop. Started by a tap, so it plays with sound. */
function Trailer({ videoKey }: { videoKey: string }) {
  const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoKey)}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
  return (
    <iframe
      src={src}
      title="Trailer"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, background: '#000' }}
    />
  );
}

/** What to do about this title now: request it, watch it download, or play it. */
function Action({ kind, details, status }: { kind: MediaKind; details: DiscoverDetails; status: MediaStatus }) {
  const { settings } = useSettings();
  const { isPhone } = useLayout();
  const request = useRequestMedia(kind);
  const retry = useRetryRequest();
  const requests = useRequestIndex();

  if (status.state === 'available') {
    return <Button label="Play" size="lg" onPress={() => router.push({ pathname: '/watch/[id]', params: { id: status.jellyfinId } })} />;
  }
  if (status.state === 'none') {
    return (
      <View style={{ gap: spacing.xs, alignItems: isPhone ? 'stretch' : 'flex-start' }}>
        <Button label={request.isPending ? 'Requesting…' : 'Request'} size="lg" disabled={request.isPending} onPress={() => request.mutate(details)} />
        <Text variant="caption" tone={request.isError ? 'primary' : 'tertiary'} style={request.isError ? { color: colors.danger } : undefined}>
          {request.isError ? request.error.message : preferenceSummary(settings.request)}
        </Text>
      </View>
    );
  }
  if (status.state === 'failed') {
    const id = requests.data?.[requestKey(kind, details.tmdbId ?? details.id)]?.id;
    return (
      <View style={{ gap: spacing.xs, alignItems: isPhone ? 'stretch' : 'flex-start' }}>
        <Text variant="label" style={{ color: colors.danger }}>
          Couldn’t find a download matching your settings.
        </Text>
        <Button label={retry.isPending ? 'Searching…' : 'Try again'} size="lg" disabled={!id || retry.isPending} onPress={() => id && retry.mutate(id)} />
        <RemoveRequestButton kind={kind} tmdbId={details.tmdbId ?? details.id} title={details.title} />
      </View>
    );
  }
  const label =
    status.state === 'downloading'
      ? status.progress == null
        ? 'Downloading…'
        : `Downloading · ${Math.round(status.progress * 100)}%${status.eta ? ` · ${status.eta} left` : ''}`
      : status.state === 'indexing'
        ? 'Downloaded · adding to your library…'
        : status.label;
  return (
    <View style={{ gap: spacing.xs, maxWidth: 420 }}>
      <Text variant="label" style={{ color: colors.highlight }}>
        {label}
      </Text>
      <DownloadBar progress={status.state === 'downloading' ? (status.progress ?? undefined) : undefined} height={6} />
      <Text variant="caption" tone="tertiary">
        {status.state === 'indexing' ? 'It’ll be ready to play as soon as Jellyfin finds it.' : 'You can leave this page; it keeps going in the background.'}
      </Text>
      {/* Once it's downloaded there's nothing left to call off. */}
      {status.state !== 'indexing' ? (
        <View style={{ alignItems: isPhone ? 'stretch' : 'flex-start', marginTop: spacing.xs }}>
          <RemoveRequestButton kind={kind} tmdbId={details.tmdbId ?? details.id} title={details.title} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * A title from downloadarr's discovery that isn't in Jellyfin (yet): request
 * it, follow the download, and play it once it's in. Same layout as a library
 * title, plus its trailer.
 */
export default function DiscoverPage() {
  const { kind, tmdbId } = useLocalSearchParams<{ kind: MediaKind; tmdbId: string }>();
  const { isPhone, width, height, gutter } = useLayout();
  const insets = useSafeAreaInsets();
  const details = useDiscoverDetails(kind, tmdbId);
  const status = useMediaStatus(kind, tmdbId);
  const item = details.data;
  const series = useJellyfinSeries(kind === 'tv' ? tmdbId : undefined, kind === 'tv' ? item?.title : undefined, item?.year).data ?? undefined;
  const [trailer, setTrailer] = useState(false);

  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', gap: spacing.lg }}>
        {details.isError ? <Text tone="secondary">Couldn’t load this title from downloadarr.</Text> : <ActivityIndicator color={colors.accent} size="large" />}
        {details.isError ? <Button label="Back" onPress={goBack} /> : null}
      </View>
    );
  }

  const heroHeight = isPhone ? (width * 9) / 16 : Math.min(height * 0.7, 640);
  const genres = item.genre ?? item.genres ?? [];
  const cast = item.cast ?? [];
  const similar = (item.recommendations ?? []).filter((r) => r.type === kind);

  const detailsBlock = (
    <View style={{ gap: spacing.md, maxWidth: 600 }}>
      <Text variant="display" numberOfLines={3}>
        {item.title}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {item.rating ? <Chip leading="★" tone="accent" label={item.rating.toFixed(1)} /> : null}
        {item.year ? <Chip label={String(item.year)} /> : null}
        {kind === 'movie' && item.runtime ? <Chip label={`${Math.floor(item.runtime / 60)}h ${item.runtime % 60}m`} /> : null}
        {kind === 'tv' && item.seasons ? <Chip label={`${item.seasons} season${item.seasons === 1 ? '' : 's'}`} /> : null}
        {item.network ? <Chip label={item.network} /> : null}
      </View>
      <View style={{ flexDirection: isPhone ? 'column' : 'row', gap: spacing.sm, alignItems: isPhone ? 'stretch' : 'flex-start' }}>
        <Action kind={kind} details={item} status={status} />
        {item.trailer && !trailer ? <Button label="Watch trailer" size="lg" variant="secondary" onPress={() => setTrailer(true)} /> : null}
      </View>
      {item.overview || item.plot ? <Text tone="secondary">{item.overview ?? item.plot}</Text> : null}
      {genres.length ? (
        <Text variant="caption" tone="tertiary">
          {genres.slice(0, 4).join(' · ')}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
        <View style={{ height: heroHeight, backgroundColor: '#000' }}>
          {trailer && item.trailer ? (
            <Trailer videoKey={item.trailer} />
          ) : (
            <>
              {item.backdrop || item.poster ? (
                <Image source={item.backdrop ?? item.poster} contentFit={item.backdrop ? 'cover' : 'contain'} cachePolicy="memory-disk" transition={200} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
              ) : null}
              <Svg style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%">
                <Defs>
                  <LinearGradient id="discover-bottom" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset={isPhone ? '0.55' : '0.35'} stopColor={colors.canvas} stopOpacity={0} />
                    <Stop offset="1" stopColor={colors.canvas} stopOpacity={1} />
                  </LinearGradient>
                  <LinearGradient id="discover-left" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor={colors.canvas} stopOpacity={isPhone ? 0 : 0.9} />
                    <Stop offset="0.6" stopColor={colors.canvas} stopOpacity={0} />
                  </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#discover-left)" />
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#discover-bottom)" />
              </Svg>
              {!isPhone ? <View style={{ position: 'absolute', left: gutter, right: gutter, bottom: spacing.xl }}>{detailsBlock}</View> : null}
            </>
          )}
        </View>

        {isPhone || trailer ? <View style={{ paddingHorizontal: gutter, marginTop: isPhone && !trailer ? -spacing.xl : spacing.lg }}>{detailsBlock}</View> : null}

        <View style={{ gap: spacing.xl, marginTop: spacing.xl }}>
          {series ? <Episodes series={series} /> : null}
          {cast.length ? (
            <Shelf
              title="Cast & crew"
              data={cast}
              keyExtractor={(p, i) => `${p.id}-${p.department}-${i}`}
              renderItem={({ item: person }) => (
                <View style={{ width: 88, alignItems: 'center', gap: spacing.xs }}>
                  <Avatar name={person.name} imageUri={person.photo} size={72} />
                  <Text variant="caption" numberOfLines={1}>
                    {person.name}
                  </Text>
                  {person.role ? (
                    <Text variant="caption" tone="tertiary" numberOfLines={1}>
                      {person.role}
                    </Text>
                  ) : null}
                </View>
              )}
            />
          ) : null}
          {similar.length ? (
            <Shelf title="More like this" data={similar} keyExtractor={(r) => requestKey(kind, r.id)} renderItem={({ item: other }) => <DiscoverCard item={other} kind={kind} />} />
          ) : null}
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', top: insets.top + spacing.md, left: gutter, flexDirection: 'row', gap: spacing.sm }}>
        <IconButton accessibilityLabel="Back" icon={(color) => <ArrowLeftIcon color={color} />} onPress={goBack} />
        {trailer ? <Button label="Close trailer" size="sm" variant="secondary" onPress={() => setTrailer(false)} /> : null}
      </View>
    </View>
  );
}
