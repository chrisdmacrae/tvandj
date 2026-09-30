import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Api, Jellyfin } from '@jellyfin/sdk';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getJellyfin } from '../jellyfin/sdk';
import type { ServerInfo } from '../jellyfin/servers';
import { secureStorage } from './secureStorage';

const SERVER_KEY = 'tv-and-j/server';
// SecureStore keys allow only [A-Za-z0-9._-]
const ACCOUNTS_KEY = 'tv-and-j.accounts';
const LEGACY_AUTH_KEY = 'tv-and-j.auth'; // single sign-in, before user switching

export type Auth = { userId: string; userName: string; accessToken: string };

type Stored = { current: string | null; accounts: Auth[] };

type SessionState = {
  /** false until storage has been read. */
  ready: boolean;
  server: ServerInfo | null;
  /** The user browsing right now. */
  auth: Auth | null;
  /** Everyone who has signed in on this device, so switching back needs no password. */
  accounts: Auth[];
  jellyfin: Jellyfin | null;
  /** Authenticated API client for the current user; null until signed in. */
  api: Api | null;
  saveServer: (server: ServerInfo) => Promise<void>;
  /** Save a user's session and make them current. */
  signIn: (auth: Auth) => Promise<void>;
  /** Switch to a user who has already signed in here. */
  switchUser: (userId: string) => Promise<void>;
  /** Forget the current user; falls back to another saved user, or to sign-in. */
  signOut: () => Promise<void>;
  /** Forget the server and every user, and restart onboarding. */
  forgetServer: () => Promise<void>;
  /**
   * Whether someone has picked who's watching since the app started. Until
   * then only the "Who's watching?" screen is reachable (and a profile's PIN,
   * if it has one, stands between it and everything else).
   */
  profileChosen: boolean;
  /** Mark the current profile as chosen for this session. */
  chooseProfile: () => void;
};

const SessionContext = createContext<SessionState | null>(null);

async function persist(stored: Stored) {
  await secureStorage.set(ACCOUNTS_KEY, JSON.stringify(stored));
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [jellyfin, setJellyfin] = useState<Jellyfin | null>(null);
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [stored, setStored] = useState<Stored>({ current: null, accounts: [] });
  // Deliberately not persisted: every launch asks who's watching.
  const [profileChosen, setProfileChosen] = useState(false);
  const chooseProfile = useCallback(() => setProfileChosen(true), []);

  useEffect(() => {
    (async () => {
      try {
        const [jf, rawServer, rawAccounts, rawLegacy] = await Promise.all([
          getJellyfin(),
          AsyncStorage.getItem(SERVER_KEY),
          secureStorage.get(ACCOUNTS_KEY),
          secureStorage.get(LEGACY_AUTH_KEY),
        ]);
        setJellyfin(jf);
        setServer(rawServer ? JSON.parse(rawServer) : null);
        if (!rawServer) return;
        if (rawAccounts) {
          setStored(JSON.parse(rawAccounts));
        } else if (rawLegacy) {
          // Carry an existing single sign-in over to the multi-user store.
          const legacy = JSON.parse(rawLegacy) as Auth;
          const migrated = { current: legacy.userId, accounts: [legacy] };
          await persist(migrated);
          await secureStorage.remove(LEGACY_AUTH_KEY);
          setStored(migrated);
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // Latest value for computing updates; React state updaters aren't guaranteed to run synchronously.
  const storedRef = useRef(stored);
  storedRef.current = stored;
  const update = useCallback(async (next: (prev: Stored) => Stored) => {
    const result = next(storedRef.current);
    storedRef.current = result;
    setStored(result);
    await persist(result);
  }, []);

  const saveServer = useCallback(async (next: ServerInfo) => {
    await AsyncStorage.setItem(SERVER_KEY, JSON.stringify(next));
    setServer(next);
  }, []);

  // Signing in or switching is choosing who's watching.
  const signIn = useCallback(
    async (next: Auth) => {
      await update((prev) => ({
        current: next.userId,
        accounts: [...prev.accounts.filter((a) => a.userId !== next.userId), next],
      }));
      setProfileChosen(true);
    },
    [update],
  );

  const switchUser = useCallback(
    async (userId: string) => {
      await update((prev) => (prev.accounts.some((a) => a.userId === userId) ? { ...prev, current: userId } : prev));
      setProfileChosen(true);
    },
    [update],
  );

  // Signing out hands the TV to whoever else is saved here, so ask who's watching again.
  const signOut = useCallback(async () => {
    await update((prev) => {
      const accounts = prev.accounts.filter((a) => a.userId !== prev.current);
      return { current: accounts[0]?.userId ?? null, accounts };
    });
    setProfileChosen(false);
  }, [update]);

  const forgetServer = useCallback(async () => {
    await Promise.all([secureStorage.remove(ACCOUNTS_KEY), AsyncStorage.removeItem(SERVER_KEY)]);
    setStored({ current: null, accounts: [] });
    setServer(null);
    setProfileChosen(false);
  }, []);

  const auth = useMemo(() => stored.accounts.find((a) => a.userId === stored.current) ?? null, [stored]);
  const api = useMemo(
    () => (jellyfin && server && auth ? jellyfin.createApi(server.address, auth.accessToken) : null),
    [jellyfin, server, auth],
  );

  const value = useMemo(
    () => ({
      ready,
      server,
      auth,
      accounts: stored.accounts,
      jellyfin,
      api,
      saveServer,
      signIn,
      switchUser,
      signOut,
      forgetServer,
      profileChosen,
      chooseProfile,
    }),
    [ready, server, auth, stored.accounts, jellyfin, api, saveServer, signIn, switchUser, signOut, forgetServer, profileChosen, chooseProfile],
  );
  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionState {
  const ctx = use(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

/** For screens behind the auth guard, where a signed-in session is guaranteed. */
export function useAuthedSession(): SessionState & { api: Api; auth: Auth; server: ServerInfo } {
  const session = useSession();
  if (!session.api || !session.auth || !session.server) throw new Error('Not signed in');
  return session as SessionState & { api: Api; auth: Auth; server: ServerInfo };
}
