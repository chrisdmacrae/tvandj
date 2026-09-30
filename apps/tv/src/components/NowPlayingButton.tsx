import { router } from 'expo-router';
import { Button } from '@tv-and-j/design-system';
import { useMusic } from '../music/MusicPlayer';

const MAX_TITLE = 24;

/** In the top bar while music is queued: what's on, and the way back to Now Playing. */
export function NowPlayingButton() {
  const { current, isPlaying } = useMusic();
  if (!current) return null;
  const name = current.Name ?? '';
  const title = name.length > MAX_TITLE ? `${name.slice(0, MAX_TITLE - 1)}…` : name;
  return <Button label={`${isPlaying ? '♪' : '❙❙'} ${title}`} size="sm" variant="ghost" onPress={() => router.push('/now-playing')} />;
}
