import { useLocalSearchParams } from 'expo-router';
import { Text, spacing } from '@tv-and-j/design-system';
import { useItemGrid } from '@tv-and-j/core/jellyfin/browse';
import { useItem } from '@tv-and-j/core/jellyfin/library';
import { ItemGrid } from '../../components/ItemGrid';
import { Page } from '../../components/Page';

/** A collection (box set, e.g. a film series): its titles in release order. */
export default function Collection() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const collection = useItem(id).data;
  const grid = useItemGrid({ types: ['Movie', 'Series'], parentId: id, sort: 'release' });
  return (
    <Page back title={collection?.Name ?? ''} scroll={false} glow>
      <ItemGrid
        items={grid.data?.pages.flatMap((p) => p.items) ?? []}
        loading={grid.isPending}
        onEndReached={() => grid.hasNextPage && !grid.isFetchingNextPage && grid.fetchNextPage()}
        empty="This collection is empty."
        header={
          collection?.Overview ? (
            <Text tone="secondary" numberOfLines={3} style={{ maxWidth: 640, paddingBottom: spacing.lg }}>
              {collection.Overview}
            </Text>
          ) : null
        }
      />
    </Page>
  );
}
