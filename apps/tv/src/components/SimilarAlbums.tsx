import { View } from 'react-native';
import { Shelf, safeArea, spacing } from '@tv-and-j/design-system';
import { useSimilarAlbums } from '@tv-and-j/core/downloadarr/hooks';
import { albumKey } from '@tv-and-j/core/jellyfin/music';
import { AlbumDiscoverCard } from './AlbumDiscoverCard';

/**
 * "Albums like this", under an album's songs. Nothing without downloadarr.
 * Album pages pad their content by the safe area; the row runs edge to edge
 * and pads itself.
 */
export function SimilarAlbums({ album }: { album: { artistName: string; albumTitle: string } | undefined }) {
  const albums = useSimilarAlbums(album);
  if (!albums.length) return null;
  return (
    <View style={{ marginHorizontal: -safeArea.horizontal, marginTop: spacing.xl }}>
      <Shelf
        title="Albums like this"
        data={albums}
        keyExtractor={(album) => albumKey(album.artistName, album.albumTitle)}
        renderItem={({ item }) => <AlbumDiscoverCard album={item} />}
      />
    </View>
  );
}
