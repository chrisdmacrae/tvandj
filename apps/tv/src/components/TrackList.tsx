import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { View } from 'react-native';
import { ListItem, spacing } from '@tv-and-j/design-system';
import { trackLength } from '../jellyfin/music';
import { useMusic } from '../music/MusicPlayer';

type TrackListProps = {
  tracks: BaseItemDto[];
  onPlay: (index: number) => void;
  /** Show each track's artist (playlists, mixes); albums leave it out unless it differs from the album's. */
  showArtist?: boolean;
  /** Number tracks by their position in the list rather than their track number (playlists). */
  numberByPosition?: boolean;
};

/** Songs as focusable rows: number, title, artist, length; the one playing now is marked. */
export function TrackList({ tracks, onPlay, showArtist, numberByPosition }: TrackListProps) {
  const { current, isPlaying } = useMusic();
  return (
    <View style={{ gap: spacing.xs }}>
      {tracks.map((track, i) => {
        const artist = track.Artists?.join(', ') || track.AlbumArtist || undefined;
        const differs = !!artist && artist !== track.AlbumArtist;
        const number = numberByPosition ? i + 1 : (track.IndexNumber ?? i + 1);
        const playing = current?.Id === track.Id;
        return (
          <ListItem
            key={`${track.Id}-${i}`}
            title={`${playing ? (isPlaying ? '♪ ' : '❙❙ ') : `${number}. `}${track.Name ?? ''}`}
            subtitle={showArtist || differs ? artist : undefined}
            trailing={trackLength(track.RunTimeTicks)}
            onPress={() => onPlay(i)}
          />
        );
      })}
    </View>
  );
}
