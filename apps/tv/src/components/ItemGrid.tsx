import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import type { ReactElement } from 'react';
import { ActivityIndicator, FlatList, View, useWindowDimensions } from 'react-native';
import { Text, artwork, colors, safeArea, spacing } from '@tv-and-j/design-system';
import { MediaCard } from './MediaCard';

type CardGridProps<T> = {
  items: T[];
  keyExtractor: (item: T) => string;
  renderCard: (item: T, index: number) => ReactElement;
  loading?: boolean;
  /** More pages to fetch as the grid nears its end. */
  onEndReached?: () => void;
  loadingMore?: boolean;
  /** Scrolls with the grid, above it (a title, filters, a biography…). */
  header?: ReactElement | null;
  empty?: string;
};

const CARD = artwork.portrait.width;
const GAP = spacing.lg;

/** Poster grid for whole libraries, collections and people; as many columns as fit. */
export function CardGrid<T>({ items, keyExtractor, renderCard, loading, onEndReached, loadingMore, header, empty = 'Nothing here.' }: CardGridProps<T>) {
  const { width } = useWindowDimensions();
  const columns = Math.max(1, Math.floor((width - safeArea.horizontal * 2 + GAP) / (CARD + GAP)));
  return (
    <FlatList
      // Columns can't change on a live FlatList; remount when they do.
      key={columns}
      data={items}
      numColumns={columns}
      keyExtractor={keyExtractor}
      initialNumToRender={columns * 3}
      windowSize={5}
      columnWrapperStyle={columns > 1 ? { gap: GAP } : undefined}
      contentContainerStyle={{ paddingHorizontal: safeArea.horizontal, paddingBottom: safeArea.vertical, gap: GAP }}
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
      ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.lg }} /> : <View />}
      onEndReached={onEndReached}
      onEndReachedThreshold={1.5}
      renderItem={({ item, index }) => renderCard(item, index)}
    />
  );
}

type ItemGridProps = Omit<CardGridProps<BaseItemDto>, 'keyExtractor' | 'renderCard'> & {
  /** Put initial focus on the first card. */
  autoFocus?: boolean;
  /** Square for music. */
  shape?: 'portrait' | 'square';
};

/** Jellyfin titles as a poster grid. */
export function ItemGrid({ autoFocus, shape = 'portrait', ...rest }: ItemGridProps) {
  return (
    <CardGrid
      {...rest}
      keyExtractor={(item) => item.Id ?? ''}
      renderCard={(item, index) => <MediaCard item={item} shape={shape} hasTVPreferredFocus={autoFocus && index === 0} />}
    />
  );
}
