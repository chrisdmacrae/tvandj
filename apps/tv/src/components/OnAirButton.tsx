import { Button } from '@tv-and-j/design-system';
import { useOnAirRadio } from '@tv-and-j/core/state/PreviewPlayer';
import { tuneIn } from '../lib/radio';

/** In the top bar while an artist radio station plays: what's on, and the way back to it. */
export function OnAirButton() {
  const artist = useOnAirRadio();
  if (!artist) return null;
  return <Button label={`♪ ${artist} radio`} size="sm" variant="ghost" onPress={() => tuneIn(artist)} />;
}
