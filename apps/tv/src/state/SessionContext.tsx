import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Api, Jellyfin } from '@jellyfin/sdk';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getJellyfin } from '../jellyfin/sdk';
import type { ServerInfo } from '../jellyfin/servers';
import { secureStorage } from './secureStorage';

const SERVER_KEY = 'tv-and-j/server';
const AUTH_KEY = 'tv-and-j.auth'; // SecureStore keys allow only [A-Za-z0-9._-]

export type Auth = { userId: string; userName: string; accessToken: string };

type SessionState = {
  /** false until storage has been read. */
  ready: boolean;
  server: ServerInfo | null;
  auth: Auth | null;
  jellyfin: Jellyfin | null;
  /** Authenticated API client; null until signed in. */
  api: Api | null;
  saveServer: (server: ServerInfo) => Promise<void>;
  signIn: (auth: Auth) => Promise<void>;
  signOut: () => Promise<void>;
  /** Forget the server entirely and restart onboarding. */
  forgetServer: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [jellyfin, setJellyfin] = useState<Jellyfin | null>(null);
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [auth, setAuth] = useState<Auth | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [jf, rawServer, rawAuth] = await Promise.all([
          getJellyfin(),
          AsyncStorage.getItem(SERVER_KEY),
          secureStorage.get(AUTH_KEY),
        ]);
        setJellyfin(jf);
        setServer(rawServer ? JSON.parse(rawServer) : null);
        setAuth(rawServer && rawAuth ? JSON.parse(rawAuth) : null);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const saveServer = useCallback(async (next: ServerInfo) => {
    await AsyncStorage.setItem(SERVER_KEY, JSON.stringify(next));
    setServer(next);
  }, []);

  const signIn = useCallback(async (next: Auth) => {
    await secureStorage.set(AUTH_KEY, JSON.stringify(next));
    setAuth(next);
  }, []);

  const signOut = useCallback(async () => {
    await secureStorage.remove(AUTH_KEY);
    setAuth(null);
  }, []);

  const forgetServer = useCallback(async () => {
    await Promise.all([secureStorage.remove(AUTH_KEY), AsyncStorage.removeItem(SERVER_KEY)]);
    setAuth(null);
    setServer(null);
  }, []);

  const api = useMemo(
    () => (jellyfin && server && auth ? jellyfin.createApi(server.address, auth.accessToken) : null),
    [jellyfin, server, auth],
  );

  const value = useMemo(
    () => ({ ready, server, auth, jellyfin, api, saveServer, signIn, signOut, forgetServer }),
    [ready, server, auth, jellyfin, api, saveServer, signIn, signOut, forgetServer],
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
