import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Button, DownloadBar, ListItem, Text, colors, radii, safeArea, spacing } from '@tv-and-j/design-system';
import type { AlbumRef } from '@tv-and-j/core/downloadarr/client';
import {
  useAlbumPreview,
  useAlbumRequest,
  useAlbumStatus,
  useDismissMusic,
  useRecommendation,
  useRequestAlbum,
  useRetryRequest,
  useSearchedAlbum,
  type MediaStatus,
} from '@tv-and-j/core/downloadarr/hooks';
import { formatSeconds, recommendationReason } from '@tv-and-j/core/downloadarr/music';
import { albumKey } from '@tv-and-j/core/jellyfin/music';
import { useAlbumPreviews } from '@tv-and-j/core/state/PreviewPlayer';
import { GlowScreen } from '../../components/GlowScreen';
import { PageHeader } from '../../components/PageHeader';
import { RemoveRequestButton } from '../../components/RemoveRequestButton';
import { SimilarAlbums } from '../../components/SimilarAlbums';
import { tuneIn } from '../../lib/radio';

const ART = 220;
const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

/**
 * An album from downloadarr's music discovery that isn't in Jellyfin (yet):
 * why it's recommended, its tracklist with 30-second previews (from Deezer),
 * and Request, the artist's radio, or Not interested. Once it's in the library, Open takes you to it.
 */
export default function DiscoverAlbum() {
  const params = useLocalSearchParams<{ artist: string; album: string }>();
  const recommendation = useRecommendation(params.artist, params.album);
  const request = useAlbumRequest({ artistName: params.artist, albumTitle: params.album });
  // Found through search: its cover and release date come from the results.
  const searched = useSearchedAlbum(params.artist, params.album);
  const album: AlbumRef = recommendation ?? {
    artistName: params.artist,
    albumTitle: params.album,
    releaseGroupMbid: request?.musicbrainzId,
    releaseDate: request?.year ? String(request.year) : (searched?.releaseDate ?? null),
    coverUrl: request?.posterUrl ?? searched?.coverUrl,
  };
  const status = useAlbumStatus(album);
  const preview = useAlbumPreview(album);
  const tracks = preview.data?.tracks ?? [];
  const clips = useAlbumPreviews({ id: albumKey(album.artistName, album.albumTitle), title: album.albumTitle, tracks }, useIsFocused());
  const cover = album.coverUrl ?? preview.data?.coverUrl;
  const reason = recommendation ? recommendationReason(recommendation) : undefined;
  const year = album.releaseDate?.slice(0, 4);
  const meta = [year, tracks.length ? `${tracks.length} song${tracks.length === 1 ? '' : 's'}` : undefined].filter(Boolean).join(' · ');

  return (
    <GlowScreen>
      <ScrollView contentContainerStyle={{ paddingHorizontal: safeArea.horizontal, paddingBottom: safeArea.vertical }}>
        <PageHeader title="" />
        <View style={{ flexDirection: 'row', gap: spacing.xl, alignItems: 'flex-end', marginBottom: spacing.xl }}>
          <View style={{ width: ART, height: ART, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.surface }}>
            {cover ? <Image source={cover} cachePolicy="memory-disk" style={{ flex: 1 }} /> : null}
          </View>
          <View style={{ flex: 1, gap: spacing.sm }}>
            <Text variant="headline" numberOfLines={2}>
              {album.albumTitle}
            </Text>
            <Text tone="secondary">{album.artistName}</Text>
            {meta ? (
              <Text variant="caption" tone="tertiary">
                {meta}
              </Text>
            ) : null}
            {reason ? (
              <Text variant="caption" tone="tertiary" numberOfLines={2}>
                {reason}
              </Text>
            ) : null}
            <View style={{ marginTop: spacing.sm }}>
              <Action
                album={album}
                status={status}
                recommended={!!recommendation}
                listen={
                  <>
                    {clips.available ? (
                      <Button
                        label={clips.playing != null ? 'Stop preview' : 'Preview'}
                        size="md"
                        variant="secondary"
                        onPress={() => (clips.playing != null ? clips.stop() : clips.toggle(0))}
                      />
                    ) : null}
                    <Button label="Artist radio" size="md" variant="secondary" onPress={() => tuneIn(album.artistName)} />
                  </>
                }
              />
            </View>
          </View>
        </View>

        {preview.isPending ? (
          <ActivityIndicator color={colors.accent} />
        ) : tracks.length ? (
          <View style={{ gap: spacing.xs }}>
            {tracks.map((track, i) => {
              const current = clips.playing === i;
              return (
                <ListItem
                  key={track.id}
                  title={`${current ? (clips.loading ? '… ' : '♪ ') : `${track.position ?? i + 1}. `}${track.title}`}
                  subtitle={track.artistName.toLowerCase() !== album.artistName.toLowerCase() ? track.artistName : undefined}
                  trailing={current ? 'Preview' : formatSeconds(track.durationSeconds)}
                  disabled={!track.previewUrl}
                  onPress={() => clips.toggle(i)}
                />
              );
            })}
          </View>
        ) : null}
        <SimilarAlbums album={album} />
      </ScrollView>
    </GlowScreen>
  );
}

/** Request it, follow the download, or open it once it's in the library; and Not interested, for recommendations. */
function Action({ album, status, recommended, listen }: { album: AlbumRef; status: MediaStatus; recommended: boolean; listen: ReactNode }) {
  const request = useRequestAlbum();
  const retry = useRetryRequest();
  const dismiss = useDismissMusic();
  const existing = useAlbumRequest(album);
  const notInterested = (artist: boolean) => dismiss.mutate({ album, artist }, { onSuccess: goBack });

  switch (status.state) {
    case 'available':
      return (
        <Button
          label="Open"
          size="md"
          hasTVPreferredFocus
          onPress={() => router.replace({ pathname: '/album/[id]', params: { id: status.jellyfinId } })}
        />
      );

    case 'none':
      return (
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <Button
              label={request.isPending ? 'Requesting…' : 'Request'}
              size="md"
              hasTVPreferredFocus
              disabled={request.isPending}
              onPress={() => request.mutate(album)}
            />
            {listen}
            {recommended ? (
              <>
                <Button label="Not interested" size="md" variant="secondary" disabled={dismiss.isPending} onPress={() => notInterested(false)} />
                <Button label={`Hide ${album.artistName}`} size="md" variant="ghost" disabled={dismiss.isPending} onPress={() => notInterested(true)} />
              </>
            ) : null}
          </View>
          {request.isError || dismiss.isError ? (
            <Text variant="caption" style={{ color: colors.danger }}>
              {(request.error ?? dismiss.error)?.message}
            </Text>
          ) : null}
        </View>
      );

    case 'failed':
      return (
        <View style={{ gap: spacing.sm, alignItems: 'flex-start' }}>
          <Text variant="label" style={{ color: colors.danger }}>
            Couldn’t find a download for this album.
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              label={retry.isPending ? 'Searching…' : 'Try again'}
              size="md"
              hasTVPreferredFocus
              disabled={!existing || retry.isPending}
              onPress={() => existing && retry.mutate(existing.id)}
            />
            <RemoveRequestButton kind="album" album={album} title={album.albumTitle} />
          </View>
        </View>
      );

    default: {
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
        <View style={{ gap: spacing.sm, maxWidth: 520, alignItems: 'flex-start' }}>
          <Text variant="label" style={{ color: colors.highlight }}>
            {label}
          </Text>
          <View style={{ alignSelf: 'stretch' }}>
            <DownloadBar progress={status.state === 'downloading' ? (status.progress ?? undefined) : undefined} height={6} />
          </View>
          {/* Focus needs somewhere to land; once it's downloaded there's nothing left to call off, so Back. */}
          {status.state !== 'indexing' ? (
            <RemoveRequestButton kind="album" album={album} title={album.albumTitle} hasTVPreferredFocus />
          ) : (
            <Button label="Back" size="sm" variant="secondary" hasTVPreferredFocus onPress={goBack} />
          )}
        </View>
      );
    }
  }
}
