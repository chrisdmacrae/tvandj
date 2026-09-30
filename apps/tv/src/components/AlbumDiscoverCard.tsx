import { router } from 'expo-router';
import { memo } from 'react';
import { PosterCard } from '@tv-and-j/design-system';
import type { AlbumRef } from '@tv-and-j/core/downloadarr/client';
import { downloadDisplay } from '@tv-and-j/core/downloadarr/display';
import { useAlbumStatus } from '@tv-and-j/core/downloadarr/hooks';
import { albumParams } from '@tv-and-j/core/downloadarr/music';
import { useSetGlow } from '@tv-and-j/core/state/GlowContext';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';
import { imageGlow } from '../lib/glowColor';

type AlbumDiscoverCardProps = {
  album: AlbumRef;
  hasTVPreferredFocus?: boolean;
  onFocus?: () => void;
};

/** An album downloadarr recommends. Opens in Jellyfin if it's already there, otherwise its request page. */
export const AlbumDiscoverCard = memo(function AlbumDiscoverCard({ album, hasTVPreferredFocus, onFocus }: AlbumDiscoverCardProps) {
  const { api } = useAuthedSession();
  const setGlow = useSetGlow();
  const status = useAlbumStatus(album);
  const cover =
    status.state === 'available' ? `${api.basePath}/Items/${status.jellyfinId}/Images/Primary?maxWidth=300` : (album.coverUrl ?? undefined);

  return (
    <PosterCard
      shape="square"
      title={album.albumTitle}
      subtitle={status.state === 'available' ? 'In your library' : album.artistName}
      imageUri={cover}
      hasTVPreferredFocus={hasTVPreferredFocus}
      {...downloadDisplay(status)}
      onFocus={() => {
        if (cover) setGlow(imageGlow(cover));
        onFocus?.();
      }}
      onPress={() =>
        status.state === 'available'
          ? router.push({ pathname: '/album/[id]', params: { id: status.jellyfinId } })
          : router.push({ pathname: '/discover/album', params: albumParams(album) })
      }
    />
  );
});
