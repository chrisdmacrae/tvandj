import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { router } from 'expo-router';
import { memo } from 'react';
import { PosterCard, type ArtworkShape } from '@tv-and-j/design-system';
import { useActiveDownload } from '../downloadarr/hooks';
import { landscapeUrl, posterUrl } from '../jellyfin/images';
import { itemGlow } from '../lib/glowColor';
import { useSetGlow } from '../state/GlowContext';
import { useMusic } from '../music/MusicPlayer';
import { useAuthedSession } from '../state/SessionContext';
import { downloadDisplay } from './DiscoverCard';

function episodeLabel(item: BaseItemDto) {
  const s = item.ParentIndexNumber;
  const e = item.IndexNumber;
  return s != null && e != null ? `S${s}:E${e}` : undefined;
}

function subtitleFor(item: BaseItemDto, shape: ArtworkShape) {
  if (item.Type === 'Episode') return [episodeLabel(item), item.Name].filter(Boolean).join(' · ');
  if (item.Type === 'MusicAlbum') return item.AlbumArtist ?? item.Artists?.[0] ?? undefined;
  if (item.Type === 'Audio') return item.Artists?.[0] ?? item.AlbumArtist ?? undefined;
  if (item.Type === 'Playlist') return item.ChildCount ? `${item.ChildCount} songs` : undefined;
  if (item.Type === 'MusicArtist') return undefined;
  if (shape === 'landscape' && item.RunTimeTicks && item.UserData?.PlaybackPositionTicks) {
    const left = Math.round((item.RunTimeTicks - item.UserData.PlaybackPositionTicks) / 600_000_000);
    return `${left}m left`;
  }
  return item.ProductionYear ? String(item.ProductionYear) : undefined;
}

type MediaCardProps = {
  item: BaseItemDto;
  shape: ArtworkShape;
  hasTVPreferredFocus?: boolean;
  onFocus?: () => void;
};

export const MediaCard = memo(function MediaCard({ item, shape, hasTVPreferredFocus, onFocus }: MediaCardProps) {
  const { api } = useAuthedSession();
  const title = item.Type === 'Episode' ? (item.SeriesName ?? item.Name ?? '') : (item.Name ?? '');
  const played = item.UserData?.PlayedPercentage;
  const unplayed = item.Type === 'Series' ? item.UserData?.UnplayedItemCount : undefined;
  // A show in the library can still have seasons downloading via downloadarr.
  const kind = item.Type === 'Series' ? 'tv' : 'movie';
  const tmdbId = item.Type === 'Series' || item.Type === 'Movie' ? (item.ProviderIds?.Tmdb ?? undefined) : undefined;
  const download = downloadDisplay(useActiveDownload(kind, tmdbId));
  const setGlow = useSetGlow();
  const music = useMusic();

  return (
    <PosterCard
      shape={shape}
      title={title}
      subtitle={subtitleFor(item, shape)}
      imageUri={shape === 'landscape' ? landscapeUrl(api, item) : posterUrl(api, item)}
      progress={played ? played / 100 : undefined}
      badge={unplayed ? String(unplayed) : undefined}
      // A rewatch in progress shows its progress bar, not the watched tick.
      watched={item.UserData?.Played && !played && item.Type !== 'Series'}
      hasTVPreferredFocus={hasTVPreferredFocus}
      {...download}
      onFocus={() => {
        setGlow(itemGlow(item, shape === 'landscape' ? ['Thumb', 'Primary', 'Backdrop'] : ['Primary']));
        onFocus?.();
      }}
      onPress={() => {
        if (!item.Id) return;
        // Each kind of thing has its own page; a song just plays.
        if (item.Type === 'BoxSet') router.push({ pathname: '/collection/[id]', params: { id: item.Id } });
        else if (item.Type === 'MusicAlbum') router.push({ pathname: '/album/[id]', params: { id: item.Id } });
        else if (item.Type === 'MusicArtist') router.push({ pathname: '/artist/[id]', params: { id: item.Id } });
        else if (item.Type === 'Playlist') router.push({ pathname: '/playlist/[id]', params: { id: item.Id } });
        else if (item.Type === 'Audio') {
          music.playQueue([item]);
          router.push('/now-playing');
        } else router.push({ pathname: '/item/[id]', params: { id: item.Id } });
      }}
    />
  );
});
