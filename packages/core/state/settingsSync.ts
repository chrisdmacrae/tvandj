import type { Api } from '@jellyfin/sdk';
import { getDisplayPreferenceApi } from '@jellyfin/sdk/lib/utils/api';

/**
 * Keeps a profile's TV and J settings on its Jellyfin account, so they follow
 * the person between the TV, the web app and any other device. Jellyfin gives
 * every client a per-user "display preferences" record with a free-form
 * CustomPrefs map (its own web app keeps its settings there); ours is one JSON
 * entry, timestamped so the newest copy wins.
 */
const PREFS_ID = 'tvandj';
const CLIENT = 'tvandj';
const KEY = 'profileSettings';

export type Synced<T> = { value: T; updatedAt: number };

/** This profile's settings as Jellyfin has them, or null if there are none (or the server can't be reached). */
export async function pullSettings<T>(api: Api, userId: string): Promise<Synced<T> | null> {
  try {
    const { data } = await getDisplayPreferenceApi(api).getDisplayPreferences({ displayPreferencesId: PREFS_ID, client: CLIENT, userId });
    const raw = data.CustomPrefs?.[KEY];
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Synced<T>>;
    return parsed.value != null && typeof parsed.updatedAt === 'number' ? (parsed as Synced<T>) : null;
  } catch {
    return null;
  }
}

/** Save this profile's settings to Jellyfin, leaving anything else in the record alone. Best effort: offline just means later. */
export async function pushSettings<T>(api: Api, userId: string, synced: Synced<T>) {
  try {
    const prefs = getDisplayPreferenceApi(api);
    const { data: current } = await prefs.getDisplayPreferences({ displayPreferencesId: PREFS_ID, client: CLIENT, userId });
    await prefs.updateDisplayPreferences({
      displayPreferencesId: PREFS_ID,
      client: CLIENT,
      userId,
      displayPreferencesDto: { ...current, CustomPrefs: { ...(current.CustomPrefs ?? {}), [KEY]: JSON.stringify(synced) } },
    });
  } catch {
    // Offline or the server's away: the local copy carries on and wins next time it's newer.
  }
}
