import { useLocalSearchParams } from 'expo-router';
import { Text } from '@tv-and-j/design-system';
import { ItemGrid } from '../../components/ItemGrid';
import { GlowScreen } from '../../components/GlowScreen';
import { PageHeader } from '../../components/PageHeader';
import { useItemGrid } from '../../jellyfin/browse';
import { useItem } from '../../jellyfin/library';

/** A collection (box set, e.g. a film series): its titles in release order. */
export default function Collection() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const collection = useItem(id).data;
  const grid = useItemGrid({ types: ['Movie', 'Series'], parentId: id, sort: 'release' });
  const items = grid.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <GlowScreen>
      <ItemGrid
        items={items}
        loading={grid.isPending}
        loadingMore={grid.isFetchingNextPage}
        onEndReached={() => grid.hasNextPage && !grid.isFetchingNextPage && grid.fetchNextPage()}
        empty="This collection is empty."
        autoFocus
        header={
          <PageHeader title={collection?.Name ?? ''}>
            {collection?.Overview ? (
              <Text tone="secondary" numberOfLines={3} style={{ maxWidth: 640 }}>
                {collection.Overview}
              </Text>
            ) : null}
          </PageHeader>
        }
      />
    </GlowScreen>
  );
}
