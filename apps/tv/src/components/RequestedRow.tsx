import { Shelf } from '@tv-and-j/design-system';
import type { DiscoverItem, MediaKind } from '@tv-and-j/core/downloadarr/client';
import { requestKey } from '@tv-and-j/core/downloadarr/hooks';
import { DiscoverCard } from './DiscoverCard';

type RequestedRowProps = {
  /** From useRequestedItems; the screen fetches it so it knows whether this row is on top. */
  items: { item: DiscoverItem; kind: MediaKind }[];
  /** This is the screen's top section, so its first card takes initial focus. */
  autoFocus?: boolean;
};

/** Everything you've requested that's still on its way, newest activity first. Nothing when empty. */
export function RequestedRow({ items, autoFocus }: RequestedRowProps) {
  if (!items.length) return null;
  return (
    <Shelf
      title="Requested"
      data={items}
      keyExtractor={({ item, kind }) => requestKey(kind, item.id)}
      renderItem={({ item: { item, kind }, index }) => (
        <DiscoverCard item={item} kind={kind} hasTVPreferredFocus={autoFocus && index === 0} />
      )}
    />
  );
}
