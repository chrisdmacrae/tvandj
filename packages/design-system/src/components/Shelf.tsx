import type { ReactElement } from 'react';
import { FlatList, View, type ListRenderItem } from 'react-native';
import { safeArea, spacing } from '../tokens';
import { Text } from './Text';

export type ShelfProps<T> = {
  title: string;
  data: readonly T[];
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T, index: number) => string;
};

/** A titled, horizontally scrolling row — the core browse pattern on TV. */
export function Shelf<T>({ title, data, renderItem, keyExtractor }: ShelfProps<T>): ReactElement {
  return (
    <View style={{ marginBottom: spacing.xl }}>
      <Text variant="title" style={{ marginHorizontal: safeArea.horizontal, marginBottom: spacing.md }}>
        {title}
      </Text>
      <FlatList
        horizontal
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        showsHorizontalScrollIndicator={false}
        // Vertical padding leaves room for the focus zoom so cards aren't clipped.
        contentContainerStyle={{
          paddingHorizontal: safeArea.horizontal,
          paddingVertical: spacing.md,
          gap: spacing.lg,
        }}
      />
    </View>
  );
}
