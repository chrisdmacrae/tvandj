import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSession } from './SessionContext';

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
  };
};

export const DEFAULT_SETTINGS: Settings = {
  downloadarrUrl: null,
  request: { qualities: ['1080p'], codecs: ['h264', 'hevc'], languages: ['english'] },
  playback: { autoSkipIntro: false, autoplayNext: true, trailers: true },
};

type SettingsState = {
  settings: Settings;
  ready: boolean;
  update: (patch: Partial<Settings>) => Promise<void>;
};

const SettingsContext = createContext<SettingsState | null>(null);

/**
 * Set while a trailer's web view is starting, cleared once it plays or gives up.
 * Still set at launch means the app died loading one (some devices' WebView
 * can't render and takes the app down with it), so trailers get switched off.
 */
export const TRAILER_IN_FLIGHT_KEY = 'tvandj.trailerInFlight';

/** Per-profile: what each person wants from playback and requests. */
type ProfileSettings = { request: Settings['request']; playback: Pick<Settings['playback'], 'autoSkipIntro' | 'autoplayNext'> };
/** Per-TV: where downloadarr is, and whether this device's web view can play trailers. */
type DeviceSettings = { downloadarrUrl: Settings['downloadarrUrl']; trailers: boolean };

const profileKey = (userId: string) => `${SETTINGS_KEY}/${userId}`;

function combine(device: DeviceSettings, profile: ProfileSettings): Settings {
  return {
    downloadarrUrl: device.downloadarrUrl,
    request: profile.request,
    playback: { ...profile.playback, trailers: device.trailers },
  };
}

function split(settings: Settings): { device: DeviceSettings; profile: ProfileSettings } {
  const { trailers, ...playback } = settings.playback;
  return {
    device: { downloadarrUrl: settings.downloadarrUrl, trailers },
    profile: { request: settings.request, playback },
  };
}

/** Stored settings (either kind, or the older all-in-one shape) over the defaults. */
function withDefaults(stored: Partial<Settings> & { trailers?: boolean }): Settings {
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

/**
 * Settings for whoever's watching. Request preferences and playback habits
 * belong to each profile; the downloadarr address and trailer support belong
 * to the TV. A profile with nothing saved yet starts from the TV's older
 * all-in-one settings while they're still there, so the switch to per-profile
 * settings doesn't reset them.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const userId = useSession().auth?.userId ?? null;
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      AsyncStorage.getItem(SETTINGS_KEY),
      userId ? AsyncStorage.getItem(profileKey(userId)) : Promise.resolve(null),
      AsyncStorage.getItem(TRAILER_IN_FLIGHT_KEY),
    ])
      .then(([rawDevice, rawProfile, trailerCrashed]) => {
        if (cancelled) return;
        const device = withDefaults(rawDevice ? JSON.parse(rawDevice) : {});
        const profile = rawProfile ? withDefaults(JSON.parse(rawProfile)) : device;
        const loaded = combine(split(device).device, split(profile).profile);
        if (trailerCrashed) {
          loaded.playback = { ...loaded.playback, trailers: false };
          AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(split(loaded).device)).catch(() => {});
          AsyncStorage.removeItem(TRAILER_IN_FLIGHT_KEY).catch(() => {});
        }
        setSettings(loaded);
      })
      .catch(() => {})
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const update = useCallback(
    async (patch: Partial<Settings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        const { device, profile } = split(next);
        AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(device)).catch(() => {});
        if (userId) AsyncStorage.setItem(profileKey(userId), JSON.stringify(profile)).catch(() => {});
        return next;
      });
    },
    [userId],
  );

  const value = useMemo(() => ({ settings, ready, update }), [settings, ready, update]);
  return <SettingsContext value={value}>{children}</SettingsContext>;
}

export function useSettings(): SettingsState {
  const ctx = use(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
