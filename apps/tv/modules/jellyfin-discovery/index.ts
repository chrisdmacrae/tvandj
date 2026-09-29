import { requireOptionalNativeModule } from 'expo';

export type DiscoveredServer = {
  id: string;
  name: string;
  /** Base URL the server advertises, e.g. http://192.168.1.20:8096 */
  address: string;
};

type JellyfinDiscoveryModule = {
  discover(timeoutMs: number): Promise<DiscoveredServer[]>;
};

// Android only for now; other platforms fall back to manual entry.
const native = requireOptionalNativeModule<JellyfinDiscoveryModule>('JellyfinDiscovery');

export const isDiscoverySupported = native != null;

/** Broadcasts on the LAN and resolves with every server that answers within `timeoutMs`. */
export async function discoverServers(timeoutMs = 3000): Promise<DiscoveredServer[]> {
  return native ? native.discover(timeoutMs) : [];
}
