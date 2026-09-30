import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Button, DownloadBar, ListItem, Text, colors, radii, spacing, useLayout } from '@tv-and-j/design-system';
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
import { Page } from '../../components/Page';
import { RemoveRequestButton } from '../../components/RemoveRequestButton';
import { SimilarAlbums } from '../../components/SimilarAlbums';
import { goBack } from '../../lib/nav';
import { tuneIn } from '../../lib/radio';

/**
 * An album from downloadarr's music discovery that isn't in Jellyfin (yet):
 * why it's recommended, its tracklist with 30-second previews (from Deezer),
 * and Request, the artist's radio, or Not interested. Once it's in the library, Open takes you to it.
 */
export default function DiscoverAlbum() {
  const params = useLocalSearchParams<{ artist: string; album: string }>();
  const { isPhone, gutter } = useLayout();
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
  const size = isPhone ? 180 : 240;
  const meta = [album.artistName, album.releaseDate?.slice(0, 4)].filter(Boolean).join(' · ');

  return (
    <Page back>
      <View style={{ paddingHorizontal: gutter, gap: spacing.xl }}>
        <View style={{ flexDirection: isPhone ? 'column' : 'row', alignItems: isPhone ? 'center' : 'flex-end', gap: spacing.lg }}>
          <View style={{ width: size, height: size, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.surface }}>
            {cover ? <Image source={cover} style={{ flex: 1 }} cachePolicy="memory-disk" /> : null}
          </View>
          <View style={{ flex: isPhone ? undefined : 1, gap: spacing.xs, alignItems: isPhone ? 'stretch' : 'flex-start', alignSelf: isPhone ? 'stretch' : undefined }}>
            <Text variant="headline" style={{ textAlign: isPhone ? 'center' : 'left' }}>
              {album.albumTitle}
            </Text>
            <Text tone="secondary" style={{ textAlign: isPhone ? 'center' : 'left' }}>
              {meta}
            </Text>
            {reason ? (
              <Text variant="caption" tone="tertiary" style={{ textAlign: isPhone ? 'center' : 'left' }}>
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
                        size="lg"
                        variant="secondary"
                        onPress={() => (clips.playing != null ? clips.stop() : clips.toggle(0))}
                      />
                    ) : null}
                    <Button label="Artist radio" size="lg" variant="secondary" onPress={() => tuneIn(album.artistName)} />
                  </>
                }
              />
            </View>
          </View>
        </View>
        {preview.isPending ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
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
        )}
      </View>
      <SimilarAlbums album={album} />
    </Page>
  );
}

/** Request it, follow the download, or open it once it's in the library; and Not interested, for recommendations. */
function Action({ album, status, recommended, listen }: { album: AlbumRef; status: MediaStatus; recommended: boolean; listen: ReactNode }) {
  const { isPhone } = useLayout();
  const request = useRequestAlbum();
  const retry = useRetryRequest();
  const dismiss = useDismissMusic();
  const existing = useAlbumRequest(album);
  const notInterested = (artist: boolean) => dismiss.mutate({ album, artist }, { onSuccess: goBack });
  const row = { flexDirection: isPhone ? 'column' : 'row', flexWrap: isPhone ? 'nowrap' : 'wrap', gap: spacing.sm, alignItems: isPhone ? 'stretch' : 'flex-start' } as const;

  if (status.state === 'available') {
    return <Button label="Open" size="lg" onPress={() => router.replace({ pathname: '/album/[id]', params: { id: status.jellyfinId } })} />;
  }
  if (status.state === 'none') {
    return (
      <View style={{ gap: spacing.xs }}>
        <View style={row}>
          <Button label={request.isPending ? 'Requesting…' : 'Request'} size="lg" disabled={request.isPending} onPress={() => request.mutate(album)} />
          {listen}
          {recommended ? (
            <>
              <Button label="Not interested" size="lg" variant="secondary" disabled={dismiss.isPending} onPress={() => notInterested(false)} />
              <Button label={`Hide ${album.artistName}`} size="lg" variant="ghost" disabled={dismiss.isPending} onPress={() => notInterested(true)} />
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
  }
  if (status.state === 'failed') {
    return (
      <View style={{ gap: spacing.xs }}>
        <Text variant="label" style={{ color: colors.danger }}>
          Couldn’t find a download for this album.
        </Text>
        <View style={row}>
          <Button
            label={retry.isPending ? 'Searching…' : 'Try again'}
            size="lg"
            disabled={!existing || retry.isPending}
            onPress={() => existing && retry.mutate(existing.id)}
          />
          <RemoveRequestButton kind="album" album={album} title={album.albumTitle} />
        </View>
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
    <View style={{ gap: spacing.xs, width: isPhone ? undefined : 420 }}>
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
          <RemoveRequestButton kind="album" album={album} title={album.albumTitle} />
        </View>
      ) : null}
    </View>
  );
}
