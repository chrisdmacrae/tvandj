import type { AuthenticationResult } from '@jellyfin/sdk/lib/generated-client/models';
import { getAuthenticationApi } from '@jellyfin/sdk/lib/utils/api';
import { isAxiosError } from 'axios';
import type { Jellyfin } from '@jellyfin/sdk';
import type { Auth } from '../state/SessionContext';

export class SignInError extends Error {}

function toAuth(result: AuthenticationResult): Auth {
  if (!result.AccessToken || !result.User?.Id) throw new SignInError('The server didn’t return a session.');
  return { accessToken: result.AccessToken, userId: result.User.Id, userName: result.User.Name ?? '' };
}

export async function signInWithPassword(jellyfin: Jellyfin, address: string, username: string, password: string) {
  const api = jellyfin.createApi(address);
  try {
    const { data } = await getAuthenticationApi(api).authenticateUserByName({
      authenticateUserByName: { Username: username, Pw: password },
    });
    return toAuth(data);
  } catch (e) {
    if (isAxiosError(e) && e.response?.status === 401) throw new SignInError('Wrong username or password.');
    throw new SignInError('Couldn’t reach the server. Try again.');
  }
}

export type QuickConnectSession = { code: string; secret: string };

/** Returns null when the server has Quick Connect turned off. */
export async function startQuickConnect(jellyfin: Jellyfin, address: string): Promise<QuickConnectSession | null> {
  const auth = getAuthenticationApi(jellyfin.createApi(address));
  const { data: enabled } = await auth.getQuickConnectEnabled();
  if (!enabled) return null;
  const { data } = await auth.initiateQuickConnect();
  if (!data.Code || !data.Secret) return null;
  return { code: data.Code, secret: data.Secret };
}

/** Resolves with a session once the code is approved on another device, or null if still waiting. */
export async function pollQuickConnect(jellyfin: Jellyfin, address: string, secret: string): Promise<Auth | null> {
  const auth = getAuthenticationApi(jellyfin.createApi(address));
  const { data } = await auth.getQuickConnectState({ secret });
  if (!data.Authenticated) return null;
  const { data: result } = await auth.authenticateWithQuickConnect({ quickConnectDto: { Secret: secret } });
  return toAuth(result);
}
