import type { BaseItemPerson } from '@jellyfin/sdk/lib/generated-client/models';
import { router } from 'expo-router';
import { memo } from 'react';
import { View } from 'react-native';
import { AvatarButton, Text, artwork, spacing } from '@tv-and-j/design-system';
import type { CreditPerson } from '../downloadarr/client';
import { personImageUrl } from '../jellyfin/images';
import { useAuthedSession } from '../state/SessionContext';

const AVATAR = 88;

type PersonCardProps = {
  name: string;
  role?: string;
  photo?: string;
  onPress: () => void;
  onFocus?: () => void;
};

/** A round photo, name and role, for cast & crew rows. */
export const PersonCard = memo(function PersonCard({ name, role, photo, onPress, onFocus }: PersonCardProps) {
  return (
    <View style={{ width: artwork.portrait.width, alignItems: 'center', gap: spacing.xs }}>
      <AvatarButton
        name={name}
        imageUri={photo}
        size={AVATAR}
        accessibilityLabel={role ? `${name}, ${role}` : name}
        onFocus={onFocus}
        onPress={onPress}
      />
      <View style={{ alignItems: 'center' }}>
        <Text variant="caption" numberOfLines={1}>
          {name}
        </Text>
        {role ? (
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {role}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

/** Someone in a Jellyfin title's cast; opens their library page. */
export function JellyfinPersonCard({ person, onFocus }: { person: BaseItemPerson; onFocus?: () => void }) {
  const { api } = useAuthedSession();
  return (
    <PersonCard
      name={person.Name ?? ''}
      role={person.Role || (person.Type === 'Actor' ? undefined : (person.Type ?? undefined))}
      photo={personImageUrl(api, person)}
      onFocus={onFocus}
      onPress={() => person.Id && router.push({ pathname: '/person/[id]', params: { id: person.Id } })}
    />
  );
}

/** Someone in a downloadarr (TMDB) title's cast; opens their TMDB page. */
export function TmdbPersonCard({ person, onFocus }: { person: CreditPerson; onFocus?: () => void }) {
  return (
    <PersonCard
      name={person.name}
      role={person.role}
      photo={person.photo}
      onFocus={onFocus}
      onPress={() => router.push({ pathname: '/people/[tmdbId]', params: { tmdbId: person.id } })}
    />
  );
}
