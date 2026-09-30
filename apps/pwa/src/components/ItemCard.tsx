import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { router } from 'expo-router';
import { memo } from 'react';
import { PosterCard, type ArtworkShape } from '@tv-and-j/design-system';
import { landscapeUrl, posterUrl } from '@tv-and-j/core/jellyfin/images';
import { useSetGlow } from '@tv-and-j/core/state/GlowContext';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';
import { itemGlow } from '../lib/glowColor';

function subtitleFor(item: BaseItemDto, shape: ArtworkShape) {
  if (item.Type === 'Episode') {
    const code = item.ParentIndexNumber != null && item.IndexNumber != null ? `S${item.ParentIndexNumber}:E${item.IndexNumber}` : undefined;
    return [code, item.Name].filter(Boolean).join(' · ');
  }
  if (item.Type === 'MusicAlbum') return item.AlbumArtist ?? item.Artists?.[0] ?? undefined;
  if (item.Type === 'Audio') return item.Artists?.[0] ?? item.AlbumArtist ?? undefined;
  if (shape === 'landscape' && item.RunTimeTicks && item.UserData?.PlaybackPositionTicks) {
    return `${Math.round((item.RunTimeTicks - item.UserData.PlaybackPositionTicks) / 600_000_000)}m left`;
  }
  return item.ProductionYear ? String(item.ProductionYear) : undefined;
}

/** Where a card goes: albums to their track list, songs straight to playing, everything else to its page. */
export function openItem(item: BaseItemDto) {
  if (!item.Id) return;
  if (item.Type === 'MusicAlbum') router.push({ pathname: '/album/[id]', params: { id: item.Id } });
  else if (item.Type === 'BoxSet') router.push({ pathname: '/collection/[id]', params: { id: item.Id } });
  else if (item.Type === 'Audio') router.push({ pathname: '/watch/[id]', params: { id: item.Id } });
  else router.push({ pathname: '/item/[id]', params: { id: item.Id } });
}

/** A Jellyfin title as a card: artwork, progress, watched tick. */
export const ItemCard = memo(function ItemCard({ item, shape }: { item: BaseItemDto; shape: ArtworkShape }) {
  const { api } = useAuthedSession();
  const title = item.Type === 'Episode' ? (item.SeriesName ?? item.Name ?? '') : (item.Name ?? '');
  const played = item.UserData?.PlayedPercentage;
  const unplayed = item.Type === 'Series' ? item.UserData?.UnplayedItemCount : undefined;
  const setGlow = useSetGlow();
  // Keyboard focus or the mouse over it: either one lights the glow.
  const glow = () => setGlow(itemGlow(item, shape === 'landscape' ? ['Thumb', 'Primary', 'Backdrop'] : ['Primary']));
  return (
    <PosterCard
      shape={shape}
      title={title}
      subtitle={subtitleFor(item, shape)}
      imageUri={shape === 'landscape' ? landscapeUrl(api, item) : posterUrl(api, item)}
      progress={played ? played / 100 : undefined}
      badge={unplayed ? String(unplayed) : undefined}
      watched={item.UserData?.Played && !played && item.Type !== 'Series'}
      onFocus={glow}
      onHoverIn={glow}
      onPress={() => openItem(item)}
    />
  );
});
