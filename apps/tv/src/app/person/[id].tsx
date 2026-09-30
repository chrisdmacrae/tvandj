import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Avatar, Text, spacing } from '@tv-and-j/design-system';
import { ItemGrid } from '../../components/ItemGrid';
import { GlowScreen } from '../../components/GlowScreen';
import { PageHeader } from '../../components/PageHeader';
import { useItemGrid, usePerson } from '@tv-and-j/core/jellyfin/browse';
import { personImageUrl } from '@tv-and-j/core/jellyfin/images';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';

const PHOTO = 112;

function lifespan(birth?: string | null, death?: string | null) {
  const year = (d?: string | null) => (d ? new Date(d).getFullYear() : undefined);
  const born = year(birth);
  const died = year(death);
  if (born && died) return `${born}–${died}`;
  return born ? `Born ${born}` : undefined;
}

/** An actor or director: photo, biography, and everything of theirs in the library. */
export default function Person() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useAuthedSession();
  const person = usePerson(id).data;
  const grid = useItemGrid({ types: ['Movie', 'Series'], personId: id, sort: 'year' });
  const items = grid.data?.pages.flatMap((p) => p.items) ?? [];
  const name = person?.Name ?? '';
  const details = [lifespan(person?.PremiereDate, person?.EndDate), person?.ProductionLocations?.[0]].filter(Boolean).join(' · ');

  return (
    <GlowScreen>
      <ItemGrid
        items={items}
        loading={grid.isPending}
        loadingMore={grid.isFetchingNextPage}
        onEndReached={() => grid.hasNextPage && !grid.isFetchingNextPage && grid.fetchNextPage()}
        empty={`Nothing with ${name || 'them'} in your library.`}
        autoFocus
        header={
          <PageHeader title={name}>
            <View style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' }}>
              {person ? (
                <Avatar name={name} imageUri={person.ImageTags?.Primary ? personImageUrl(api, { Id: person.Id, PrimaryImageTag: person.ImageTags.Primary }, PHOTO * 2) : undefined} size={PHOTO} />
              ) : null}
              <View style={{ flex: 1, gap: spacing.xs, maxWidth: 640 }}>
                {details ? (
                  <Text variant="caption" tone="secondary">
                    {details}
                  </Text>
                ) : null}
                {person?.Overview ? (
                  <Text tone="secondary" numberOfLines={5}>
                    {person.Overview}
                  </Text>
                ) : null}
              </View>
            </View>
          </PageHeader>
        }
      />
    </GlowScreen>
  );
}
