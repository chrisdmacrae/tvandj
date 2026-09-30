import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Avatar, Text, spacing } from '@tv-and-j/design-system';
import { DiscoverCard } from '../../components/DiscoverCard';
import { GlowScreen } from '../../components/GlowScreen';
import { CardGrid } from '../../components/ItemGrid';
import { PageHeader } from '../../components/PageHeader';
import type { MediaKind } from '@tv-and-j/core/downloadarr/client';
import { requestKey, usePersonDetails } from '@tv-and-j/core/downloadarr/hooks';

const PHOTO = 112;

function lifespan(birth?: string, death?: string) {
  const year = (d?: string) => (d ? new Date(d).getFullYear() : undefined);
  const born = year(birth);
  const died = year(death);
  if (born && died) return `${born}–${died}`;
  return born ? `Born ${born}` : undefined;
}

/**
 * An actor or director from a downloadarr title: who they are and what else
 * they've made, most popular first. Each title shows whether it's in the
 * library, downloading, or can be requested, like anywhere else in discovery.
 */
export default function TmdbPerson() {
  const { tmdbId } = useLocalSearchParams<{ tmdbId: string }>();
  const person = usePersonDetails(tmdbId);
  const data = person.data;
  const name = data?.name ?? '';
  const details = [lifespan(data?.birthday, data?.deathday), data?.placeOfBirth].filter(Boolean).join(' · ');
  const credits = (data?.credits ?? []).filter((c): c is typeof c & { type: MediaKind } => c.type === 'movie' || c.type === 'tv');

  return (
    <GlowScreen>
      <CardGrid
        items={credits}
        keyExtractor={(c) => requestKey(c.type, c.id)}
        renderCard={(c, index) => <DiscoverCard item={c} kind={c.type} hasTVPreferredFocus={index === 0} />}
        loading={person.isPending}
        empty={person.isError ? 'Couldn’t load this person from downloadarr.' : `No movies or shows found for ${name || 'them'}.`}
        header={
          <PageHeader title={name}>
            <View style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' }}>
              {data ? <Avatar name={name} imageUri={data.photo} size={PHOTO} /> : null}
              <View style={{ flex: 1, gap: spacing.xs, maxWidth: 640 }}>
                {details ? (
                  <Text variant="caption" tone="secondary">
                    {details}
                  </Text>
                ) : null}
                {data?.biography ? (
                  <Text tone="secondary" numberOfLines={5}>
                    {data.biography}
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
