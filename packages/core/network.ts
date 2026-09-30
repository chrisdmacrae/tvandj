import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const FORWARD_CREDENTIALS_KEY = 'tv-and-j/forward-credentials';

/**
 * Whether requests to Jellyfin and downloadarr carry the browser's cookies for
 * those addresses. Needed when they sit behind a sign-in proxy such as
 * Cloudflare Access (its CF_Authorization cookie), and off by default: servers
 * must then answer CORS with this app's exact origin and
 * Access-Control-Allow-Credentials, which Jellyfin's default ("*") doesn't.
 * Only browsers care; native requests aren't subject to CORS.
 */
let forward = false;

function apply(on: boolean) {
  forward = on;
  // The Jellyfin SDK uses the global axios instance.
  axios.defaults.withCredentials = on;
}

/** Read the saved choice; call before the first request. */
export async function loadNetworkSettings() {
  apply((await AsyncStorage.getItem(FORWARD_CREDENTIALS_KEY)) === 'true');
}

export async function setForwardCredentials(on: boolean) {
  apply(on);
  await AsyncStorage.setItem(FORWARD_CREDENTIALS_KEY, String(on));
}

export const forwardsCredentials = () => forward;

/** For fetch(): `credentials: requestCredentials()`. */
export const requestCredentials = (): RequestCredentials => (forward ? 'include' : 'same-origin');
