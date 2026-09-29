import { requireOptionalNativeModule } from 'expo';

type Reply = { payload: string; address: string };

type LanDiscoveryModule = {
  broadcast(message: string, port: number, timeoutMs: number): Promise<Reply[]>;
};

// Android only for now; other platforms fall back to manual entry.
const native = requireOptionalNativeModule<LanDiscoveryModule>('JellyfinDiscovery');

export const isDiscoverySupported = native != null;

function parse<T>(payload: string): T | null {
  try {
    return JSON.parse(payload) as T;
  } catch {
    return null;
  }
}

export type DiscoveredServer = {
  id: string;
  name: string;
  /** Base URL the server advertises, e.g. http://192.168.1.20:8096 */
  address: string;
};

/** Jellyfin servers on the LAN (udp/7359). */
export async function discoverServers(timeoutMs = 3000): Promise<DiscoveredServer[]> {
  if (!native) return [];
  const servers = new Map<string, DiscoveredServer>();
  for (const reply of await native.broadcast('who is JellyfinServer?', 7359, timeoutMs)) {
    const json = parse<{ Id?: string; Name?: string; Address?: string }>(reply.payload);
    if (json?.Id && json.Address) servers.set(json.Id, { id: json.Id, name: json.Name ?? '', address: json.Address });
  }
  return [...servers.values()];
}

/**
 * downloadarr's API on the LAN (udp/7360). It replies with its API port and,
 * only if configured, a full URL; otherwise the reply's source address is the host.
 */
export async function discoverDownloadarr(timeoutMs = 2000): Promise<string | null> {
  if (!native) return null;
  for (const reply of await native.broadcast('who is Downloadarr?', 7360, timeoutMs)) {
    const json = parse<{ Name?: string; Port?: number; Address?: string }>(reply.payload);
    if (json?.Name !== 'Downloadarr') continue;
    if (json.Address) return json.Address;
    if (json.Port && reply.address) return `http://${reply.address}:${json.Port}`;
  }
  return null;
}
