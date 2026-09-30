import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ArrowLeftIcon, Avatar, Button, Chip, IconButton, Shelf, Text, colors, spacing, useLayout } from '@tv-and-j/design-system';
import { useSimilar, useToggleFavorite, useTogglePlayed } from '@tv-and-j/core/jellyfin/browse';
import { backdropUrl, logoUrl, personImageUrl } from '@tv-and-j/core/jellyfin/images';
import { useItem, usePlayQueue } from '@tv-and-j/core/jellyfin/library';
import { useRatings } from '@tv-and-j/core/jellyfin/ratings';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';
import { useState } from 'react';
import { playOn, useRemoteDevices, type RemoteDevice } from '@tv-and-j/core/jellyfin/remote';
import { DevicePicker } from '../../components/DevicePicker';
import { Episodes } from '../../components/Episodes';
import { useRemoteTarget } from '../../lib/remoteTarget';
import { ItemCard } from '../../components/ItemCard';
import { ScrobbleButton } from '../../components/ScrobbleButton';
import { goBack } from '../../lib/nav';

const TICKS_PER_SECOND = 10_000_000;

function runtime(ticks?: number | null) {
  if (!ticks) return undefined;
  const m = Math.round(ticks / 600_000_000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

function clock(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * A movie, show or episode. Phones: the backdrop as a header with everything
 * stacked below it. Tablets and desktops: a tall backdrop with the details
 * over its lower left, like the TV app.
 */
export default function ItemPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useAuthedSession();
  const { isPhone, width, height, gutter } = useLayout();
  const insets = useSafeAreaInsets();
  const item = useItem(id).data;
  const queue = usePlayQueue(item).data;
  const similar = useSimilar(item).data ?? [];
  const ratings = useRatings(item);
  const toggleFavorite = useToggleFavorite();
  const togglePlayed = useTogglePlayed();
  // Play on another screen (the TV) through Jellyfin.
  const remoteDevices = useRemoteDevices().data ?? [];
  const { sessionId: castId, setSessionId } = useRemoteTarget();
  const castTarget = remoteDevices.find((d) => d.Id === castId);
  const [picking, setPicking] = useState(false);

  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  const isSeries = item.Type === 'Series';
  // What Play starts: a show's next-up episode, which is where the resume point lives.
  const target = isSeries ? queue?.[0] : item;
  const resumeAt = (target?.UserData?.PlaybackPositionTicks ?? 0) / TICKS_PER_SECOND;
  const play = (fromStart = false) =>
    target?.Id && router.push({ pathname: '/watch/[id]', params: { id: target.Id, ...(fromStart ? { start: '0' } : {}) } });
  // Start it on the TV (at its resume point, as there), then open that screen's remote.
  const playOnDevice = async (device: RemoteDevice) => {
    if (!target?.Id) return;
    setSessionId(device.Id);
    await playOn(api, device.Id, [target.Id]).catch(() => {});
    router.push({ pathname: '/remote/[id]', params: { id: device.Id } });
  };
  const title = item.Type === 'Episode' ? (item.SeriesName ?? item.Name ?? '') : (item.Name ?? '');
  const logo = logoUrl(api, item);
  const art = backdropUrl(api, item, isPhone ? 1080 : 1920);
  const heroHeight = isPhone ? (width * 9) / 16 : Math.min(height * 0.7, 640);
  const cast = (item.People ?? []).filter((p) => p.Type === 'Actor').slice(0, 20);
  const inList = !!item.UserData?.IsFavorite;
  const watched = !!item.UserData?.Played;
  const episodeCode = target && target.Type === 'Episode' && target.ParentIndexNumber != null ? `S${target.ParentIndexNumber}:E${target.IndexNumber}` : undefined;

  const details = (
    <View style={{ gap: spacing.md, maxWidth: 600 }}>
      {logo ? (
        <Image source={logo} contentFit="contain" contentPosition="left" style={{ width: isPhone ? 220 : 320, height: isPhone ? 64 : 96 }} accessibilityLabel={title} />
      ) : (
        <Text variant="display" numberOfLines={3}>
          {title}
        </Text>
      )}
      {item.Type === 'Episode' ? <Text variant="label" tone="secondary">{`S${item.ParentIndexNumber}:E${item.IndexNumber} · ${item.Name}`}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {ratings.imdb ? <Chip leading="IMDb" tone="warning" label={ratings.imdb} /> : null}
        {ratings.audience ? <Chip leading="★" tone="accent" label={ratings.audience} /> : null}
        {item.ProductionYear ? <Chip label={String(item.ProductionYear)} /> : null}
        {item.OfficialRating ? <Chip label={item.OfficialRating} /> : null}
        {runtime(item.RunTimeTicks) ? <Chip label={runtime(item.RunTimeTicks)!} /> : null}
      </View>
      <View style={{ gap: spacing.xs }}>
        {isSeries && target ? (
          <Text variant="caption" tone="secondary">{`${resumeAt > 0 ? 'Continue' : 'Up next'} · ${episodeCode ?? ''} ${target.Name ?? ''}`}</Text>
        ) : null}
        <View style={{ flexDirection: isPhone ? 'column' : 'row', gap: spacing.sm }}>
          <Button label={resumeAt > 0 ? `Resume ${clock(resumeAt)}` : 'Play'} size="lg" disabled={!target} onPress={() => play()} />
          {resumeAt > 0 ? <Button label="Start over" size="lg" variant="secondary" onPress={() => play(true)} /> : null}
        </View>
        {remoteDevices.length ? (
          <View style={{ alignItems: 'flex-start' }}>
            <Button
              label={castTarget ? `Play on ${castTarget.DeviceName}` : 'Play on another screen'}
              size="sm"
              variant="secondary"
              disabled={!target}
              onPress={() => (castTarget ? playOnDevice(castTarget) : setPicking(true))}
            />
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {item.Type === 'Movie' || isSeries ? (
            <Button label={inList ? '✓ My List' : '+ My List'} size="sm" variant="ghost" onPress={() => item.Id && toggleFavorite.mutate({ itemId: item.Id, on: !inList })} />
          ) : null}
          <Button
            label={watched ? 'Mark unwatched' : isSeries ? 'Mark all watched' : 'Mark watched'}
            size="sm"
            variant="ghost"
            onPress={() => item.Id && togglePlayed.mutate({ itemId: item.Id, on: !watched })}
          />
          <ScrobbleButton itemId={item.Id} itemType={item.Type} />
        </View>
      </View>
      {item.Overview ? (
        <Text tone="secondary" numberOfLines={isPhone ? undefined : 5}>
          {item.Overview}
        </Text>
      ) : null}
      {item.Genres?.length ? (
        <Text variant="caption" tone="tertiary">
          {item.Genres.slice(0, 4).join(' · ')}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
        {/* The backdrop, fading into the page at the bottom (and the left, where the details sit on big screens). */}
        <View style={{ height: heroHeight }}>
          {art ? <Image source={art} contentFit="cover" cachePolicy="memory-disk" transition={200} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} /> : null}
          <Svg style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%">
            <Defs>
              <LinearGradient id="hero-bottom" x1="0" y1="0" x2="0" y2="1">
                <Stop offset={isPhone ? '0.55' : '0.35'} stopColor={colors.canvas} stopOpacity={0} />
                <Stop offset="1" stopColor={colors.canvas} stopOpacity={1} />
              </LinearGradient>
              <LinearGradient id="hero-left" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={colors.canvas} stopOpacity={isPhone ? 0 : 0.9} />
                <Stop offset="0.6" stopColor={colors.canvas} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#hero-left)" />
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#hero-bottom)" />
          </Svg>
          {!isPhone ? <View style={{ position: 'absolute', left: gutter, right: gutter, bottom: spacing.xl }}>{details}</View> : null}
        </View>

        {isPhone ? <View style={{ paddingHorizontal: gutter, marginTop: -spacing.xl }}>{details}</View> : null}

        <View style={{ gap: spacing.xl, marginTop: spacing.xl }}>
          {isSeries ? <Episodes series={item} initialSeason={queue?.[0]?.ParentIndexNumber ?? undefined} /> : null}
          {cast.length ? (
            <Shelf
              title="Cast"
              data={cast}
              keyExtractor={(p, i) => `${p.Id}-${i}`}
              renderItem={({ item: person }) => (
                <View style={{ width: 88, alignItems: 'center', gap: spacing.xs }}>
                  <Avatar name={person.Name ?? ''} imageUri={personImageUrl(api, person)} size={72} />
                  <Text variant="caption" numberOfLines={1}>
                    {person.Name}
                  </Text>
                  {person.Role ? (
                    <Text variant="caption" tone="tertiary" numberOfLines={1}>
                      {person.Role}
                    </Text>
                  ) : null}
                </View>
              )}
            />
          ) : null}
          {similar.length ? (
            <Shelf title="More like this" data={similar} keyExtractor={(i) => i.Id ?? ''} renderItem={({ item: other }) => <ItemCard item={other} shape="portrait" />} />
          ) : null}
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', top: insets.top + spacing.md, left: gutter }}>
        <IconButton accessibilityLabel="Back" icon={(color) => <ArrowLeftIcon color={color} />} onPress={goBack} />
      </View>

      <DevicePicker
        visible={picking}
        title="Play on…"
        onClose={() => setPicking(false)}
        onPick={(device) => {
          setPicking(false);
          playOnDevice(device);
        }}
      />
    </View>
  );
}
