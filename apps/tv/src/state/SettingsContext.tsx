import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

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
};

export const DEFAULT_SETTINGS: Settings = {
  downloadarrUrl: null,
  request: { qualities: ['1080p'], codecs: ['h264', 'hevc'], languages: ['english'] },
};

type SettingsState = {
  settings: Settings;
  ready: boolean;
  update: (patch: Partial<Settings>) => Promise<void>;
};

const SettingsContext = createContext<SettingsState | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY)
      .then((raw) => {
        if (!raw) return;
        const stored = JSON.parse(raw) as Partial<Settings>;
        setSettings({ ...DEFAULT_SETTINGS, ...stored, request: { ...DEFAULT_SETTINGS.request, ...stored.request } });
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const update = useCallback(async (patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo(() => ({ settings, ready, update }), [settings, ready, update]);
  return <SettingsContext value={value}>{children}</SettingsContext>;
}

export function useSettings(): SettingsState {
  const ctx = use(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
