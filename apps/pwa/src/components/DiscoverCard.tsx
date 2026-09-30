import { router } from 'expo-router';
import { memo } from 'react';
import { PosterCard } from '@tv-and-j/design-system';
import type { DiscoverItem, MediaKind } from '@tv-and-j/core/downloadarr/client';
import { downloadDisplay } from '@tv-and-j/core/downloadarr/display';
import { useActiveDownload, useMediaStatus } from '@tv-and-j/core/downloadarr/hooks';
import { useSetGlow } from '@tv-and-j/core/state/GlowContext';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';
import { imageGlow } from '../lib/glowColor';

/** TMDB serves several sizes; cards are small, so w342 is plenty. */
const cardSized = (url?: string) => url?.replace(/\/t\/p\/(w\d+|original)\//, '/t/p/w342/');

/** A downloadarr (TMDB) title with its request or download state. Opens in the library once it's there, otherwise its request page. */
export const DiscoverCard = memo(function DiscoverCard({ item, kind }: { item: DiscoverItem; kind: MediaKind }) {
  const { api } = useAuthedSession();
  const status = useMediaStatus(kind, item.id);
  const active = useActiveDownload(kind, status.state === 'available' ? item.id : undefined);
  const shown = status.state === 'available' && active.state !== 'none' ? active : status;
  const poster = status.state === 'available' ? `${api.basePath}/Items/${status.jellyfinId}/Images/Primary?maxWidth=300` : cardSized(item.poster);
  const setGlow = useSetGlow();
  const glow = () => poster && setGlow(imageGlow(poster));
  return (
    <PosterCard
      title={item.title}
      subtitle={status.state === 'available' ? 'In your library' : item.year ? String(item.year) : undefined}
      imageUri={poster}
      {...downloadDisplay(shown)}
      onFocus={glow}
      onHoverIn={glow}
      onPress={() =>
        status.state === 'available'
          ? router.push({ pathname: '/item/[id]', params: { id: status.jellyfinId } })
          : router.push({ pathname: '/discover/[kind]/[tmdbId]', params: { kind, tmdbId: item.id } })
      }
    />
  );
});
