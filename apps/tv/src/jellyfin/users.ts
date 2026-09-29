import type { Api } from '@jellyfin/sdk';
import type { UserDto } from '@jellyfin/sdk/lib/generated-client/models';
import { getUserApi } from '@jellyfin/sdk/lib/utils/api';
import { useQuery } from '@tanstack/react-query';
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
