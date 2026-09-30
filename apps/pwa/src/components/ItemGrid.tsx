import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import type { ReactElement } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, artwork, colors, spacing, useLayout, type ArtworkShape } from '@tv-and-j/design-system';
import { ItemCard } from './ItemCard';

type ItemGridProps = {
  items: BaseItemDto[];
  shape?: ArtworkShape;
  loading?: boolean;
  onEndReached?: () => void;
  header?: ReactElement | null;
  empty?: string;
  bottomSpace?: number;
};

/** Posters in as many columns as fit the screen, from three on a phone upwards. */
export function ItemGrid({ items, shape = 'portrait', loading, onEndReached, header, empty = 'Nothing here.', bottomSpace = 0 }: ItemGridProps) {
  const { width, gutter } = useLayout();
  const insets = useSafeAreaInsets();
  const gap = spacing.md;
  const card = artwork[shape].width;
  const columns = Math.max(3, Math.floor((width - gutter * 2 + gap) / (card + gap)));
  return (
    <FlatList
      key={columns}
      data={items}
      numColumns={columns}
      keyExtractor={(item) => item.Id ?? ''}
      columnWrapperStyle={{ gap }}
      contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + bottomSpace + spacing.xl, gap }}
      ListHeaderComponent={header}
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xxxl }} />
        ) : (
          <Text tone="secondary" style={{ paddingTop: spacing.xl }}>
            {empty}
          </Text>
        )
      }
      onEndReached={onEndReached}
      onEndReachedThreshold={1.5}
      renderItem={({ item }) => (
        // Cards share the row evenly, so a phone's three columns fill the width.
        <View style={{ flex: 1 / columns, maxWidth: card }}>
          <ItemCard item={item} shape={shape} />
        </View>
      )}
    />
  );
}
