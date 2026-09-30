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

export type ScrobbleStatus = Record<ScrobbleService, ScrobbleServiceState> & {
  /** Unwatched My List titles go to their Trakt watchlist (plugin 1.2+). */
  traktWatchlistSync: boolean;
};

const PATH = '/TvAndJ/Scrobbling';

// The server answers in Jellyfin's PascalCase and leaves out empty fields.
type Wire = Record<'Lastfm' | 'ListenBrainz' | 'Trakt', { Available: boolean; Connected: boolean; Username?: string }> & { TraktWatchlistSync?: boolean };

function fromWire(w: Wire): ScrobbleStatus {
  const one = (s: Wire['Lastfm']) => ({ available: s.Available, connected: s.Connected, username: s.Username });
  return { lastfm: one(w.Lastfm), listenbrainz: one(w.ListenBrainz), trakt: one(w.Trakt), traktWatchlistSync: !!w.TraktWatchlistSync };
}

async function call<T>(api: Api, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, data?: unknown): Promise<T> {
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

const MUSIC_TYPES = new Set(['Audio', 'MusicAlbum']);
const VIDEO_TYPES = new Set(['Movie', 'Episode', 'Season', 'Series']);

/** Whether a "Scrobble" button makes sense for this item: it's a kind that scrobbles, and its service is connected. */
export function canScrobble(status: ScrobbleStatus | null | undefined, itemType: string | null | undefined) {
  if (!status || !itemType) return false;
  if (MUSIC_TYPES.has(itemType)) return status.lastfm.connected || status.listenbrainz.connected;
  if (VIDEO_TYPES.has(itemType)) return status.trakt.connected;
  return false;
}

export type ScrobbleOutcome = { service: string; sent: boolean; message?: string };

/** "Scrobble this now", played or not (TV and J plugin 1.2+): one outcome per service it went to. */
export function useScrobbleItem() {
  const { api } = useAuthedSession();
  return useMutation({
    mutationFn: async (itemId: string) => {
      const wire = await call<{ Service: string; Sent: boolean; Message?: string }[]>(api, 'POST', `/Items/${encodeURIComponent(itemId)}`);
      return wire.map((o) => ({ service: o.Service, sent: o.Sent, message: o.Message }));
    },
  });
}

/** One line for what happened: "Scrobbled to Last.fm and ListenBrainz", or what went wrong. */
export function scrobbleSummary(outcomes: ScrobbleOutcome[]) {
  const sent = outcomes.filter((o) => o.sent).map((o) => o.service);
  const failed = outcomes.filter((o) => !o.sent);
  const parts = [];
  if (sent.length) parts.push(`Scrobbled to ${sent.join(' and ')}`);
  for (const f of failed) parts.push(`${f.service}: ${f.message ?? 'didn’t work'}`);
  return { ok: failed.length === 0, text: parts.join('. ') };
}

/**
 * Keep the Trakt watchlist in step with My List (unwatched movies and shows, one way), or stop.
 * Turning it on pushes what's on My List now; resolves with how many titles that added.
 */
export function useWatchlistSync() {
  const { api, auth } = useAuthedSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await call<{ Status: Wire; Added: number }>(api, 'PUT', '/Trakt/Watchlist', { Enabled: enabled });
      return { status: fromWire(res.Status), added: res.Added };
    },
    onSuccess: ({ status }) => queryClient.setQueryData(['scrobbling', auth.userId], status),
  });
}
