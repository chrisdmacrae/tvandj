import { Image } from 'expo-image';
import { View } from 'react-native';
import type { Trickplay } from '@tv-and-j/core/jellyfin/playback';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';

/** Shown width of the scrub thumbnail. */
const DISPLAY_WIDTH = 240;

/**
 * The frame at `seconds`, cut from Jellyfin's trickplay tiles: each tile is a
 * JPEG grid of TileWidth × TileHeight thumbnails taken every Interval ms.
 * One tile covers minutes of video, so scrubbing mostly re-crops a cached image.
 */
export function TrickplayPreview({ trickplay, seconds }: { trickplay: Trickplay; seconds: number }) {
  const { api } = useAuthedSession();
  const { info, width, itemId, mediaSourceId } = trickplay;
  const cols = info.TileWidth ?? 1;
  const rows = info.TileHeight ?? 1;
  const frameWidth = info.Width ?? width;
  const frameHeight = info.Height ?? Math.round((frameWidth * 9) / 16);
  const count = info.ThumbnailCount ?? 1;
  const perTile = cols * rows;

  const n = Math.max(0, Math.min(Math.floor((seconds * 1000) / (info.Interval || 10_000)), count - 1));
  const tile = Math.floor(n / perTile);
  const within = n % perTile;
  const col = within % cols;
  const row = Math.floor(within / cols);
  // The last tile is only as tall as the thumbnails left over.
  const tileRows = Math.min(rows, Math.ceil((count - tile * perTile) / cols));

  const scale = DISPLAY_WIDTH / frameWidth;
  const uri = `${api.basePath}/Videos/${itemId}/Trickplay/${width}/${tile}.jpg?mediaSourceId=${mediaSourceId}&api_key=${api.accessToken}`;

  return (
    <View style={{ width: DISPLAY_WIDTH, height: frameHeight * scale, overflow: 'hidden' }}>
      <Image
        source={uri}
        cachePolicy="memory-disk"
        style={{
          position: 'absolute',
          width: frameWidth * cols * scale,
          height: frameHeight * tileRows * scale,
          left: -col * frameWidth * scale,
          top: -row * frameHeight * scale,
        }}
      />
    </View>
  );
}
