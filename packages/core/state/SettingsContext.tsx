import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useSession } from './SessionContext';
import { pullHousehold, pushHousehold, type HouseholdAccess, type HouseholdState } from './householdSync';
import { pullSettings, pushSettings } from './settingsSync';

/** Wait for a burst of changes (tapping through chips) to settle before saving to Jellyfin. */
const PUSH_DELAY_MS = 1000;

const SETTINGS_KEY = 'tv-and-j/settings';

export type Quality = '1080p' | '4k';
export type Codec = 'h264' | 'hevc';
export type Language = 'english' | 'french' | 'german' | 'spanish' | 'japanese';

export type Settings = {
  /** Optional downloadarr integration; discovery and requests only appear when set. */
  downloadarrUrl: string | null;
  request: {
    qualities: Quality[];
    codecs: Codec[];
    languages: Language[];
  };
  playback: {
    /** Jump over intros and recaps without asking. */
    autoSkipIntro: boolean;
    /** Count down into the next episode when one ends. */
    autoplayNext: boolean;
    /** Play a title's YouTube trailer on downloadarr request pages. */
    trailers: boolean;
    /** Play a show's theme song on its page. */
    themeMusic: boolean;
  };
  /** Minutes idle on the browse screens before the screensaver; 0 turns it off. */
  screensaverMinutes: number;
};

export const DEFAULT_SETTINGS: Settings = {
  downloadarrUrl: null,
  request: { qualities: ['1080p'], codecs: ['h264', 'hevc'], languages: ['english'] },
  playback: { autoSkipIntro: false, autoplayNext: true, trailers: true, themeMusic: true },
  screensaverMinutes: 3,
};

type SettingsState = {
  settings: Settings;
  ready: boolean;
  update: (patch: Partial<Settings>) => Promise<void>;
  /**
   * Household settings (the downloadarr address) through the TV and J Jellyfin
   * plugin: 'none' without the plugin (they're per device), 'read' when an
   * administrator sets them for everyone, 'write' for administrators.
   */
  householdAccess: HouseholdAccess;
  /** The downloadarr address in use came from the household settings, not this device. */
  downloadarrFromHousehold: boolean;
};

const SettingsContext = createContext<SettingsState | null>(null);

/**
 * Set while a trailer's web view is starting, cleared once it plays or gives up.
 * Still set at launch means the app died loading one (some devices' WebView
 * can't render and takes the app down with it), so trailers get switched off.
 */
export const TRAILER_IN_FLIGHT_KEY = 'tvandj.trailerInFlight';

/** Per-profile: what each person wants from playback and requests. */
type ProfileSettings = {
  request: Settings['request'];
  playback: Pick<Settings['playback'], 'autoSkipIntro' | 'autoplayNext' | 'themeMusic'>;
};
/** Per-TV: where downloadarr is, whether this device's web view can play trailers, and the screensaver. */
type DeviceSettings = { downloadarrUrl: Settings['downloadarrUrl']; trailers: boolean; screensaverMinutes: number };

const profileKey = (userId: string) => `${SETTINGS_KEY}/${userId}`;

function combine(device: DeviceSettings, profile: ProfileSettings): Settings {
  return {
    downloadarrUrl: device.downloadarrUrl,
    screensaverMinutes: device.screensaverMinutes,
    request: profile.request,
    playback: { ...profile.playback, trailers: device.trailers },
  };
}

function split(settings: Settings): { device: DeviceSettings; profile: ProfileSettings } {
  const { trailers, ...playback } = settings.playback;
  return {
    device: { downloadarrUrl: settings.downloadarrUrl, trailers, screensaverMinutes: settings.screensaverMinutes },
    profile: { request: settings.request, playback },
  };
}

/** Anything saved: a profile's settings, the device's, or the older all-in-one shape. */
type StoredSettings = Omit<Partial<Settings>, 'request' | 'playback'> & {
  request?: Partial<Settings['request']>;
  playback?: Partial<Settings['playback']>;
  trailers?: boolean;
};

/** Stored settings (either kind, or the older all-in-one shape) over the defaults. */
function withDefaults(stored: StoredSettings): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    request: { ...DEFAULT_SETTINGS.request, ...stored.request },
    playback: {
      ...DEFAULT_SETTINGS.playback,
      ...stored.playback,
      ...(stored.trailers != null ? { trailers: stored.trailers } : {}),
    },
  };
}

/** A profile's settings as saved on this device, stamped with when they last changed (0: before syncing). */
type StoredProfile = ProfileSettings & { updatedAt?: number };

/**
 * Settings for whoever's watching. Request preferences and playback habits
 * belong to each profile and sync through their Jellyfin account (see
 * settingsSync), so they follow them between the TV, the web app and other
 * devices; the newest copy wins. The downloadarr address, trailer support and
 * the screensaver belong to this device and stay here.
 *
 * The local copy loads first so nothing waits on the network; Jellyfin's copy
 * replaces it if newer, on load and whenever the app comes back to the front.
 * A profile with nothing saved yet starts from the device's older all-in-one
 * settings while they're still there.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const { api, auth } = useSession();
  const userId = auth?.userId ?? null;
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  // When this profile's settings last changed, here or elsewhere.
  const updatedAt = useRef(0);
  const apiRef = useRef(api);
  apiRef.current = api;
  const [household, setHousehold] = useState<HouseholdState>({ access: 'none', value: {}, updatedAt: 0 });
  const householdRef = useRef(household);
  householdRef.current = household;

  /** The household settings from the server; a newer copy there replaces ours. */
  const pullHouseholdSettings = useCallback(async () => {
    const current = apiRef.current;
    if (!current) return setHousehold({ access: 'none', value: {}, updatedAt: 0 });
    const remote = await pullHousehold(current);
    setHousehold((local) => (remote.access === 'none' || remote.updatedAt >= local.updatedAt ? remote : { ...local, access: remote.access }));
  }, []);

  /** Take Jellyfin's copy of this profile's settings, and the household's, if newer than ours. */
  const pull = useCallback(async () => {
    pullHouseholdSettings();
    const current = apiRef.current;
    if (!current || !userId) return;
    const remote = await pullSettings<ProfileSettings>(current, userId);
    if (!remote) {
      // Nothing on the server yet: put ours there, if they've ever changed.
      if (updatedAt.current) {
        setSettings((prev) => {
          pushSettings(current, userId, { value: split(prev).profile, updatedAt: updatedAt.current });
          return prev;
        });
      }
      return;
    }
    if (remote.updatedAt <= updatedAt.current) return;
    updatedAt.current = remote.updatedAt;
    setSettings((prev) => {
      const profile = split(withDefaults(remote.value)).profile;
      const stored: StoredProfile = { ...profile, updatedAt: remote.updatedAt };
      AsyncStorage.setItem(profileKey(userId), JSON.stringify(stored)).catch(() => {});
      return combine(split(prev).device, profile);
    });
  }, [userId, pullHouseholdSettings]);

  useEffect(() => {
    let cancelled = false;
    updatedAt.current = 0;
    Promise.all([
      AsyncStorage.getItem(SETTINGS_KEY),
      userId ? AsyncStorage.getItem(profileKey(userId)) : Promise.resolve(null),
      AsyncStorage.getItem(TRAILER_IN_FLIGHT_KEY),
    ])
      .then(([rawDevice, rawProfile, trailerCrashed]) => {
        if (cancelled) return;
        const device = withDefaults(rawDevice ? JSON.parse(rawDevice) : {});
        const storedProfile: StoredProfile | null = rawProfile ? JSON.parse(rawProfile) : null;
        const profile = storedProfile ? withDefaults(storedProfile) : device;
        updatedAt.current = storedProfile?.updatedAt ?? 0;
        const loaded = combine(split(device).device, split(profile).profile);
        if (trailerCrashed) {
          loaded.playback = { ...loaded.playback, trailers: false };
          AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(split(loaded).device)).catch(() => {});
          AsyncStorage.removeItem(TRAILER_IN_FLIGHT_KEY).catch(() => {});
        }
        setSettings(loaded);
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        setReady(true);
        pull();
      });
    return () => {
      cancelled = true;
    };
  }, [userId, pull]);

  // Back in front (e.g. after changing something on the phone): pick up what changed elsewhere.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => state === 'active' && pull());
    return () => sub.remove();
  }, [pull]);

  const pushTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(pushTimer.current), []);

  const update = useCallback(
    async (patch: Partial<Settings>) => {
      // An administrator changing a household setting changes it for everyone.
      const current = apiRef.current;
      if ('downloadarrUrl' in patch && current && householdRef.current.access === 'write') {
        const stamp = Date.now();
        const value = { ...householdRef.current.value, downloadarrUrl: patch.downloadarrUrl ?? null };
        setHousehold({ access: 'write', value, updatedAt: stamp });
        pushHousehold(current, value, stamp).then((saved) => saved && setHousehold(saved));
      }
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        const before = split(prev);
        const { device, profile } = split(next);
        AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(device)).catch(() => {});
        if (userId && JSON.stringify(profile) !== JSON.stringify(before.profile)) {
          // A change to this person's settings: stamp it, keep it here, and send it to Jellyfin.
          const stamp = Date.now();
          updatedAt.current = stamp;
          const stored: StoredProfile = { ...profile, updatedAt: stamp };
          AsyncStorage.setItem(profileKey(userId), JSON.stringify(stored)).catch(() => {});
          clearTimeout(pushTimer.current);
          pushTimer.current = setTimeout(() => {
            const current = apiRef.current;
            if (current) pushSettings(current, userId, { value: profile, updatedAt: stamp });
          }, PUSH_DELAY_MS);
        }
        return next;
      });
    },
    [userId],
  );

  // The household's downloadarr address, when there is one, beats this device's own.
  const downloadarrFromHousehold = household.access !== 'none' && household.value.downloadarrUrl !== undefined;
  const effective = useMemo(
    () => (downloadarrFromHousehold ? { ...settings, downloadarrUrl: household.value.downloadarrUrl ?? null } : settings),
    [settings, downloadarrFromHousehold, household.value.downloadarrUrl],
  );

  const value = useMemo(
    () => ({ settings: effective, ready, update, householdAccess: household.access, downloadarrFromHousehold }),
    [effective, ready, update, household.access, downloadarrFromHousehold],
  );
  return <SettingsContext value={value}>{children}</SettingsContext>;
}

export function useSettings(): SettingsState {
  const ctx = use(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
