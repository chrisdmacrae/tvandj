import { router } from 'expo-router';
import { memo } from 'react';
import { PosterCard } from '@tv-and-j/design-system';
import type { DiscoverItem, MediaKind } from '@tv-and-j/core/downloadarr/client';
import { downloadDisplay } from '@tv-and-j/core/downloadarr/display';
import { useActiveDownload, useMediaStatus } from '@tv-and-j/core/downloadarr/hooks';
import { imageGlow } from '../lib/glowColor';
import { useSetGlow } from '@tv-and-j/core/state/GlowContext';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';

// Shared with the web app; re-exported so existing imports keep working.
export { downloadDisplay };

type DiscoverCardProps = {
  item: DiscoverItem;
  kind: MediaKind;
  hasTVPreferredFocus?: boolean;
  onFocus?: () => void;
};

/** TMDB serves several sizes; cards are ~240px wide, so w342 is plenty (w500/original cost far more to decode). */
const cardSized = (url?: string) => url?.replace(/\/t\/p\/(w\d+|original)\//, '/t/p/w342/');

/** A downloadarr (TMDB) title. Opens in Jellyfin if it's already there, otherwise the request page. */
export const DiscoverCard = memo(function DiscoverCard({ item, kind, hasTVPreferredFocus, onFocus }: DiscoverCardProps) {
  const { api } = useAuthedSession();
  const setGlow = useSetGlow();
  const status = useMediaStatus(kind, item.id);
  // In the library but more still coming (e.g. a show's next season): show that, not "In your library".
  const active = useActiveDownload(kind, status.state === 'available' ? item.id : undefined);
  const shown = status.state === 'available' && active.state !== 'none' ? active : status;
  // Once it's in the library, Jellyfin's local artwork beats a remote URL stored with the request.
  const poster =
    status.state === 'available' ? `${api.basePath}/Items/${status.jellyfinId}/Images/Primary?maxWidth=300` : cardSized(item.poster);

  return (
    <PosterCard
      title={item.title}
      subtitle={status.state === 'available' ? 'In your library' : item.year ? String(item.year) : undefined}
      imageUri={poster}
      hasTVPreferredFocus={hasTVPreferredFocus}
      {...downloadDisplay(shown)}
      onFocus={() => {
        if (poster) setGlow(imageGlow(poster));
        onFocus?.();
      }}
      onPress={() =>
        status.state === 'available'
          ? router.push({ pathname: '/item/[id]', params: { id: status.jellyfinId } })
          : router.push({ pathname: '/discover/[kind]/[tmdbId]', params: { kind, tmdbId: item.id } })
      }
    />
  );
});
