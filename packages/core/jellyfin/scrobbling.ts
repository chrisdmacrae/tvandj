import type { Api } from '@jellyfin/sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthedSession } from '../state/SessionContext';

/**
 * Scrobbling through the TV and J plugin (1.1+, server/jellyfin-plugin-tvandj): each person
 * connects their own Last.fm, ListenBrainz and Trakt accounts, and the server scrobbles what
 * they play in any Jellyfin app. Keys and tokens stay on the server; the apps only see whether
 * an account is connected, and as whom.
 */
export type ScrobbleService = 'lastfm' | 'listenbrainz' | 'trakt';

export type ScrobbleServiceState = {
  /** The server can scrobble to it: Last.fm and Trakt need an administrator's app credentials first. */
  available: boolean;
  connected: boolean;
  username?: string;
};

export type ScrobbleStatus = Record<ScrobbleService, ScrobbleServiceState>;

const PATH = '/TvAndJ/Scrobbling';

// The server answers in Jellyfin's PascalCase and leaves out empty fields.
type Wire = Record<'Lastfm' | 'ListenBrainz' | 'Trakt', { Available: boolean; Connected: boolean; Username?: string }>;

function fromWire(w: Wire): ScrobbleStatus {
  const one = (s: Wire['Lastfm']) => ({ available: s.Available, connected: s.Connected, username: s.Username });
  return { lastfm: one(w.Lastfm), listenbrainz: one(w.ListenBrainz), trakt: one(w.Trakt) };
}

async function call<T>(api: Api, method: 'GET' | 'POST' | 'DELETE', path: string, data?: unknown): Promise<T> {
  try {
    const res = await api.axiosInstance.request<T>({
      method,
      url: `${api.basePath}${PATH}${path}`,
      data,
      headers: { Authorization: api.authorizationHeader, 'Content-Type': 'application/json' },
    });
    return res.data;
  } catch (e) {
    // The plugin explains refusals (a wrong password, a bad token) in `detail`.
    const detail = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail;
    throw new Error(detail ?? 'Couldn’t reach your Jellyfin server.');
  }
}

/** This person's scrobbling accounts, or null when the server doesn't have the TV and J plugin 1.1+. */
export function useScrobbling() {
  const { api, auth } = useAuthedSession();
  return useQuery({
    queryKey: ['scrobbling', auth.userId],
    retry: false,
    queryFn: async () => {
      try {
        return fromWire(await call<Wire>(api, 'GET', ''));
      } catch {
        return null;
      }
    },
  });
}

function useScrobbleMutation<V>(run: (api: Api, vars: V) => Promise<Wire>) {
  const { api, auth } = useAuthedSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: V) => run(api, vars),
    onSuccess: (wire) => queryClient.setQueryData(['scrobbling', auth.userId], fromWire(wire)),
  });
}

/** Sign in to Last.fm. The server swaps the password for a session key and doesn't keep it. */
export function useConnectLastfm() {
  return useScrobbleMutation((api, v: { username: string; password: string }) =>
    call<Wire>(api, 'POST', '/Lastfm', { Username: v.username, Password: v.password }),
  );
}

/** Connect ListenBrainz with the person's user token (listenbrainz.org/settings). */
export function useConnectListenBrainz() {
  return useScrobbleMutation((api, token: string) => call<Wire>(api, 'POST', '/ListenBrainz', { Token: token }));
}

export function useDisconnectScrobbler() {
  return useScrobbleMutation((api, service: ScrobbleService) => call<Wire>(api, 'DELETE', `/${service}`));
}

export type TraktSignIn =
  | { state: 'idle' }
  | { state: 'starting' }
  /** Show `code`; the person enters it at `url` on their phone or computer. */
  | { state: 'waiting'; code: string; url: string }
  | { state: 'failed'; message: string };

/**
 * Trakt's device sign-in, made for TVs: show a short code, the person enters it at
 * trakt.tv/activate, and this polls until they have. Stops polling when unmounted.
 */
export function useTraktSignIn() {
  const { api, auth } = useAuthedSession();
  const queryClient = useQueryClient();
  const [signIn, setSignIn] = useState<TraktSignIn>({ state: 'idle' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped on every start and stop, so a poll already in flight knows it's been superseded.
  const generation = useRef(0);
  const stopPolling = useCallback(() => {
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => stopPolling, [stopPolling]);

  const start = useCallback(async () => {
    stopPolling();
    const mine = generation.current;
    setSignIn({ state: 'starting' });
    try {
      const code = await call<{ UserCode: string; VerificationUrl: string; Interval: number }>(api, 'POST', '/Trakt/Code');
      if (generation.current !== mine) return;
      setSignIn({ state: 'waiting', code: code.UserCode, url: code.VerificationUrl });
      const poll = async () => {
        try {
          const result = await call<{ Status: string }>(api, 'POST', '/Trakt/Poll');
          if (generation.current !== mine) return;
          if (result.Status === 'pending') {
            timer.current = setTimeout(poll, Math.max(code.Interval, 5) * 1000);
            return;
          }
          if (result.Status === 'connected') {
            setSignIn({ state: 'idle' });
            await queryClient.invalidateQueries({ queryKey: ['scrobbling', auth.userId] });
          } else {
            setSignIn({ state: 'failed', message: result.Status === 'denied' ? 'Trakt sign-in was declined.' : 'The code ran out. Try again.' });
          }
        } catch (e) {
          if (generation.current === mine) setSignIn({ state: 'failed', message: (e as Error).message });
        }
      };
      timer.current = setTimeout(poll, Math.max(code.Interval, 5) * 1000);
    } catch (e) {
      if (generation.current === mine) setSignIn({ state: 'failed', message: (e as Error).message });
    }
  }, [api, auth.userId, queryClient, stopPolling]);

  const cancel = useCallback(() => {
    stopPolling();
    setSignIn({ state: 'idle' });
  }, [stopPolling]);

  return { signIn, start, cancel };
}
