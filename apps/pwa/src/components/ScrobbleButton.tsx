import { Button, Text, colors } from '@tv-and-j/design-system';
import { canScrobble, scrobbleSummary, useScrobbleItem, useScrobbling } from '@tv-and-j/core/jellyfin/scrobbling';

type ScrobbleButtonProps = {
  itemId: string | null | undefined;
  itemType: string | null | undefined;
  onFocus?: () => void;
  /** Beside a track: just the button, with what happened as its label (the full story in its tooltip). */
  compact?: boolean;
};

/**
 * Scrobble this now, whether or not it was played: music to Last.fm and ListenBrainz, movies
 * and shows to Trakt's history. Only there when one of those is connected for this person.
 */
export function ScrobbleButton({ itemId, itemType, onFocus, compact }: ScrobbleButtonProps) {
  const status = useScrobbling().data;
  const scrobble = useScrobbleItem();
  if (!itemId || !canScrobble(status, itemType)) return null;
  const result = scrobble.data ? scrobbleSummary(scrobble.data) : null;
  const failed = !!scrobble.error || (result !== null && !result.ok);
  const message = scrobble.error ? scrobble.error.message : result?.text;
  if (compact) {
    return (
      <Button
        label={scrobble.isPending ? 'Scrobbling…' : failed ? 'Couldn’t scrobble' : result ? '✓ Scrobbled' : 'Scrobble'}
        size="sm"
        variant="ghost"
        accessibilityHint={message}
        // react-native-web passes this through as the tooltip.
        {...({ title: message } as object)}
        onPress={() => !scrobble.isPending && scrobble.mutate(itemId)}
      />
    );
  }
  return (
    <>
      <Button
        label={scrobble.isPending ? 'Scrobbling…' : result?.ok ? '✓ Scrobbled' : 'Scrobble'}
        size="sm"
        variant="ghost"
        onFocus={onFocus}
        onPress={() => !scrobble.isPending && scrobble.mutate(itemId)}
      />
      {result || scrobble.error ? (
        <Text variant="caption" tone="secondary" style={{ alignSelf: 'center', ...(failed ? { color: colors.danger } : null) }}>
          {scrobble.error ? scrobble.error.message : result!.text}
        </Text>
      ) : null}
    </>
  );
}
