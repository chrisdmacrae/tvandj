import type { Api } from '@jellyfin/sdk';
import { getUserApi } from '@jellyfin/sdk/lib/utils/api';

/**
 * Household settings: the ones that belong to everyone, not one person (the
 * downloadarr address). They live on the Jellyfin server through the TV and J
 * plugin (server/jellyfin-plugin-tvandj), so every app on every device, for
 * every user, shares them. Anyone signed in can read them; administrators
 * change them. Without the plugin, they stay per device, as before.
 */
export type HouseholdSettings = { downloadarrUrl?: string | null };

export type HouseholdAccess =
  /** No plugin on the server (or it's unreachable): household settings stay on each device. */
  | 'none'
  /** The plugin's there; this user can read but not change them. */
  | 'read'
  /** The plugin's there and this user is an administrator. */
  | 'write';

export type HouseholdState = { access: HouseholdAccess; value: HouseholdSettings; updatedAt: number };

const PATH = '/TvAndJ/Household';

function request(api: Api, method: 'GET' | 'POST', data?: unknown) {
  return api.axiosInstance.request<{ Value: HouseholdSettings; UpdatedAt: number }>({
    method,
    url: `${api.basePath}${PATH}`,
    data,
    headers: { Authorization: api.authorizationHeader, 'Content-Type': 'application/json' },
  });
}

/** The household settings and what this user may do with them. */
export async function pullHousehold(api: Api): Promise<HouseholdState> {
  try {
    const [{ data }, { data: me }] = await Promise.all([request(api, 'GET'), getUserApi(api).getCurrentUser()]);
    return {
      access: me.Policy?.IsAdministrator ? 'write' : 'read',
      value: data.Value ?? {},
      updatedAt: data.UpdatedAt ?? 0,
    };
  } catch {
    // 404: the plugin isn't installed. Anything else: the server's away; try again later.
    return { access: 'none', value: {}, updatedAt: 0 };
  }
}

/** Save them for everyone (administrators). Returns what the server has afterwards: a newer copy there wins. */
export async function pushHousehold(api: Api, value: HouseholdSettings, updatedAt: number): Promise<HouseholdState | null> {
  try {
    const { data } = await request(api, 'POST', { Value: value, UpdatedAt: updatedAt });
    return { access: 'write', value: data.Value ?? {}, updatedAt: data.UpdatedAt ?? 0 };
  } catch {
    return null;
  }
}
