import {
  MINIMUM_VERSION,
  ProductNameIssue,
  RecommendedServerInfoScore,
  VersionUnsupportedIssue,
  type RecommendedServerIssue,
} from '@jellyfin/sdk';
import { getJellyfin } from './sdk';

export type ServerInfo = {
  id: string;
  name: string;
  /** Base URL that answered, e.g. http://192.168.1.20:8096 */
  address: string;
  version?: string;
};

export class ServerConnectionError extends Error {}

function describeIssues(issues: RecommendedServerIssue[] = []): string {
  const unsupported = issues.find((i) => i instanceof VersionUnsupportedIssue);
  if (unsupported) {
    return `This server runs Jellyfin ${unsupported.version}. Update it to ${MINIMUM_VERSION} or newer.`;
  }
  if (issues.some((i) => i instanceof ProductNameIssue)) {
    return "Something answered at that address, but it isn't a Jellyfin server.";
  }
  return "Couldn't reach a Jellyfin server there. Check the address, and that the server is on and on the same network.";
}

/**
 * Turns whatever the user typed (or a discovered address) into a verified
 * server. The SDK expands bare hosts into http/https and 8096/8920 candidates,
 * probes each one's public system info, and scores the results.
 */
export async function connectToServer(input: string): Promise<ServerInfo> {
  const address = input.trim();
  if (!address) throw new ServerConnectionError('Enter your server’s address.');

  const { discovery } = await getJellyfin();
  if (discovery.getAddressCandidates(address).length === 0) {
    throw new ServerConnectionError("That doesn't look like a server address.");
  }

  const candidates = await discovery.getRecommendedServerCandidates(address, RecommendedServerInfoScore.BAD);
  const best = discovery.findBestServer(candidates);
  if (!best?.systemInfo?.Id) {
    throw new ServerConnectionError(describeIssues(candidates[0]?.issues));
  }

  return {
    id: best.systemInfo.Id,
    name: best.systemInfo.ServerName || 'Jellyfin',
    address: best.address,
    version: best.systemInfo.Version ?? undefined,
  };
}
