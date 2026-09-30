import { Button } from '@tv-and-j/design-system';
import { useOnAirRadio } from '@tv-and-j/core/state/PreviewPlayer';
import { tuneIn } from '../lib/radio';

/** While an artist radio station plays: what's on, and the way back to it. In the top bar, or floating over the page on phones. */
export function OnAirButton({ variant = 'ghost' }: { variant?: 'ghost' | 'secondary' }) {
  const artist = useOnAirRadio();
  if (!artist) return null;
  return <Button label={`♪ ${artist} radio`} size="sm" variant={variant} onPress={() => tuneIn(artist)} />;
}
