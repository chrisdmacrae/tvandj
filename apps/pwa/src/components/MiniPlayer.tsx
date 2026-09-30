import { Image } from 'expo-image';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Button, Focusable, IconButton, PauseIcon, PlayIcon, ProgressBar, SkipNextIcon, Text, colors, radii, spacing, useLayout } from '@tv-and-j/design-system';
import { posterUrl } from '@tv-and-j/core/jellyfin/images';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';
import { useMusic, useMusicProgress } from '../music/MusicPlayer';

/** Height the phone's mini player takes, spacing included, so pages can scroll clear of it. */
export const MINI_PLAYER = 72;
const MAX_TITLE = 24;

const openNowPlaying = () => router.push('/now-playing');

/** Phones: the song that's on, anchored above the bottom navigation, with play/pause and next. Opens Now Playing. */
export function MiniPlayer({ bottom = 0 }: { bottom?: number }) {
  const { api } = useAuthedSession();
  const { gutter } = useLayout();
  const { current, isPlaying, togglePlay, next, queue, index, repeat } = useMusic();
  const { position, duration } = useMusicProgress();
  if (!current) return null;
  const art = posterUrl(api, current, 160);
  const artist = current.Artists?.join(', ') || current.AlbumArtist || undefined;
  const hasNext = index < queue.length - 1 || repeat === 'all';

  return (
    <View style={{ position: 'absolute', left: gutter, right: gutter, bottom: bottom + spacing.sm, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.surfaceRaised }}>
      {/* The song opens the player; the buttons sit beside it, not inside it (no buttons in buttons). */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Focusable
            accessibilityRole="button"
            accessibilityLabel={`Now playing: ${current.Name}. Open the player.`}
            focusScale={1}
            onPress={openNowPlaying}
            style={{ borderRadius: radii.sm }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ width: 44, height: 44, borderRadius: radii.sm, overflow: 'hidden', backgroundColor: colors.surface }}>
                {art ? <Image source={art} style={{ flex: 1 }} cachePolicy="memory-disk" /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="label" numberOfLines={1}>
                  {current.Name}
                </Text>
                {artist ? (
                  <Text variant="caption" tone="secondary" numberOfLines={1}>
                    {artist}
                  </Text>
                ) : null}
              </View>
            </View>
          </Focusable>
        </View>
        <IconButton
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          icon={(c) => (isPlaying ? <PauseIcon color={c} /> : <PlayIcon color={c} />)}
          onPress={togglePlay}
        />
        {/* Stays put on the last song (dimmed), so play/pause never moves under your thumb. */}
        <IconButton
          accessibilityLabel="Next"
          disabled={!hasNext}
          icon={(c) => <SkipNextIcon color={hasNext ? c : colors.textTertiary} />}
          onPress={next}
        />
      </View>
      {duration ? <ProgressBar value={position / duration} /> : null}
    </View>
  );
}

/** Tablets and desktops, in the top bar like the TV: play/pause and what's on, which opens Now Playing. */
export function NowPlayingButton() {
  const { current, isPlaying, togglePlay } = useMusic();
  if (!current) return null;
  const name = current.Name ?? '';
  const title = name.length > MAX_TITLE ? `${name.slice(0, MAX_TITLE - 1)}…` : name;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <IconButton
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        icon={(c) => (isPlaying ? <PauseIcon color={c} /> : <PlayIcon color={c} />)}
        onPress={togglePlay}
      />
      <Button label={`♪ ${title}`} size="sm" variant="ghost" accessibilityLabel={`Now playing: ${name}. Open the player.`} onPress={openNowPlaying} />
    </View>
  );
}
