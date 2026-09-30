import { Button, Text, colors } from '@tv-and-j/design-system';
import { canScrobble, scrobbleSummary, useScrobbleItem, useScrobbling } from '@tv-and-j/core/jellyfin/scrobbling';

type ScrobbleButtonProps = {
  itemId: string | null | undefined;
  itemType: string | null | undefined;
  onFocus?: () => void;
};

/**
 * Scrobble this now, whether or not it was played: music to Last.fm and ListenBrainz, movies
 * and shows to Trakt's history. Only there when one of those is connected for this person.
 */
export function ScrobbleButton({ itemId, itemType, onFocus }: ScrobbleButtonProps) {
  const status = useScrobbling().data;
  const scrobble = useScrobbleItem();
  if (!itemId || !canScrobble(status, itemType)) return null;
  const result = scrobble.data ? scrobbleSummary(scrobble.data) : null;
  const failed = !!scrobble.error || (result !== null && !result.ok);
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
