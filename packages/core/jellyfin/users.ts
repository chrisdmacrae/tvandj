import type { Api } from '@jellyfin/sdk';
import type { ParentalRating, UserConfiguration, UserDto, UserPolicy } from '@jellyfin/sdk/lib/generated-client/models';
import { getLocalizationApi, getUserApi } from '@jellyfin/sdk/lib/utils/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthedSession } from '../state/SessionContext';

export function userAvatarUrl(api: Api, user: Pick<UserDto, 'Id' | 'PrimaryImageTag'>, size = 96) {
  if (!user.Id || !user.PrimaryImageTag) return undefined;
  return `${api.basePath}/Users/${user.Id}/Images/Primary?tag=${user.PrimaryImageTag}&maxWidth=${size}`;
}

/**
 * Everyone who could be watching, current user first. Jellyfin hides new
 * users from its public list by default, so that list is often empty; an
 * administrator (usually the server owner) can list every enabled user
 * instead. Everyone else gets the public list.
 */
export function useServerUsers() {
  const { api, auth } = useAuthedSession();
  return useQuery({
    queryKey: ['users', api.basePath, auth.userId],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const users = getUserApi(api);
      const { data: me } = await users.getCurrentUser();
      const others = me.Policy?.IsAdministrator
        ? (await users.getUsers({ isDisabled: false })).data
        : (await users.getPublicUsers()).data;
      const list = [me, ...others.filter((u) => u.Id !== me.Id)];
      return list.filter((u): u is UserDto & { Id: string; Name: string } => !!u.Id && !!u.Name);
    },
  });
}

/** The server's public users, for the sign-in screen (no session yet). Often empty; see above. */
export async function fetchPublicUsers(api: Api) {
  const { data } = await getUserApi(api).getPublicUsers();
  return data.filter((u): u is UserDto & { Id: string; Name: string } => !!u.Id && !!u.Name);
}

/** The signed-in user as Jellyfin sees them: policy (limits) and configuration (language preferences). */
export function useCurrentUser() {
  const { api, auth } = useAuthedSession();
  return useQuery({
    queryKey: ['currentUser', api.basePath, auth.userId],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => (await getUserApi(api).getCurrentUser()).data,
  });
}

/**
 * A profile with content limits: a maximum rating, or unrated content blocked.
 * Jellyfin filters its own library for them, but can't vouch for anything
 * outside it (downloadarr's discovery), so restricted profiles don't get that.
 */
export function isRestricted(policy: UserPolicy | null | undefined) {
  if (!policy) return false;
  return policy.MaxParentalRating != null || (policy.BlockUnratedItems?.length ?? 0) > 0;
}

/** The server's rating scale (e.g. G, PG, PG-13 with their scores), for labelling limits. */
export function useParentalRatings() {
  const { api } = useAuthedSession();
  return useQuery({
    queryKey: ['parentalRatings', api.basePath],
    staleTime: Infinity,
    queryFn: async () => (await getLocalizationApi(api).getParentalRatings()).data,
  });
}

const score = (r: ParentalRating) => r.RatingScore?.score ?? r.Value ?? null;

/**
 * "Up to PG-13" for a profile's limit: the best-known ratings at the highest
 * score it allows. Servers list ratings for several countries, so the first
 * couple of names at that score are enough.
 */
export function ratingLimitLabel(policy: UserPolicy | null | undefined, ratings: ParentalRating[] | undefined) {
  if (!policy) return undefined;
  const max = policy.MaxParentalRating;
  if (max == null) return (policy.BlockUnratedItems?.length ?? 0) > 0 ? 'Rated content only' : undefined;
  const allowed = (ratings ?? []).filter((r) => r.Name && score(r) != null && score(r)! <= max);
  const top = Math.max(...allowed.map((r) => score(r)!));
  const names = [...new Set(allowed.filter((r) => score(r) === top).map((r) => r.Name!))].slice(0, 2);
  return names.length ? `Up to ${names.join(' / ')}` : 'Content limits on';
}

/** Save language and subtitle preferences to the user's Jellyfin account (shared with their other Jellyfin apps). */
export function useUpdateUserConfiguration() {
  const { api, auth } = useAuthedSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<UserConfiguration>) => {
      const current = (await getUserApi(api).getCurrentUser()).data.Configuration ?? {};
      await getUserApi(api).updateUserConfiguration({ userId: auth.userId, userConfiguration: { ...current, ...patch } });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['currentUser'] }),
  });
}
