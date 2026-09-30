import type { Api } from '@jellyfin/sdk';
import type { GeneralCommandType, PlaystateCommand, SessionInfoDto } from '@jellyfin/sdk/lib/generated-client/models';
import { getSessionApi } from '@jellyfin/sdk/lib/utils/api';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuthedSession } from '../state/SessionContext';

const TICKS_PER_SECOND = 10_000_000;
/** How often a remote refreshes what the device is playing (it reports every 10s; seeks and pauses land sooner). */
const POLL_MS = 2_000;
/** Devices seen within this long count as on. */
const ACTIVE_WITHIN_S = 600;

export type RemoteDevice = SessionInfoDto & { Id: string };

/** Start playing titles on another device (from a spot, in seconds; otherwise its own resume point). */
export function playOn(api: Api, sessionId: string, itemIds: string[], options: { startSeconds?: number; startIndex?: number } = {}) {
  return getSessionApi(api).play({
    sessionId,
    playCommand: 'PlayNow',
    itemIds,
    startIndex: options.startIndex,
    startPositionTicks: options.startSeconds != null ? Math.round(options.startSeconds * TICKS_PER_SECOND) : undefined,
  });
}

/**
 * Other devices this user can control through Jellyfin: TV and J on a TV, the
 * Jellyfin apps, anything that registered for remote control. Not this one.
 */
export function useRemoteDevices(options: { poll?: boolean; enabled?: boolean } = {}) {
  const { api, auth } = useAuthedSession();
  return useQuery({
    queryKey: ['remoteDevices', auth.userId],
    enabled: options.enabled ?? true,
    refetchInterval: options.poll ? POLL_MS : false,
    queryFn: async () => {
      const { data } = await getSessionApi(api).getSessions({ controllableByUserId: auth.userId, activeWithinSeconds: ACTIVE_WITHIN_S });
      return data.filter((s): s is RemoteDevice => !!s.Id && !!s.SupportsRemoteControl && s.DeviceId !== api.deviceInfo.id);
    },
  });
}

/**
 * When no screen shows up: every recent session Jellyfin will tell this user
 * about, and why each isn't controllable here (another user's, not accepting
 * remote control, or this very device).
 */
export function useRemoteDiagnostics(enabled: boolean) {
  const { api, auth } = useAuthedSession();
  return useQuery({
    queryKey: ['remoteDiagnostics', auth.userId],
    enabled,
    queryFn: async () => {
      const { data } = await getSessionApi(api).getSessions({ activeWithinSeconds: ACTIVE_WITHIN_S });
      return data
        .filter((s) => s.Id)
        .map((s) => ({
          id: s.Id!,
          name: `${s.DeviceName ?? 'Device'} (${[s.Client, s.ApplicationVersion].filter(Boolean).join(' ')})`,
          reason:
            s.DeviceId === api.deviceInfo.id
              ? 'This device'
              : s.UserId && s.UserId !== auth.userId
                ? `Signed in as ${s.UserName ?? 'another user'}`
                : !s.SupportsRemoteControl
                  ? 'Not accepting remote control'
                  : 'Available',
        }));
    },
  });
}

/** One device, refreshed every couple of seconds while something watches it. */
export function useRemoteDevice(sessionId: string | undefined) {
  const devices = useRemoteDevices({ poll: true, enabled: !!sessionId });
  return { ...devices, data: devices.data?.find((d) => d.Id === sessionId) ?? null };
}

/** Where a device is in what it's playing, in seconds. */
export function remotePosition(device: RemoteDevice | null) {
  const ticks = device?.PlayState?.PositionTicks ?? 0;
  const runtime = device?.NowPlayingItem?.RunTimeTicks ?? 0;
  return { position: ticks / TICKS_PER_SECOND, duration: runtime / TICKS_PER_SECOND };
}

/** Everything you can ask another device to do. Each command refreshes its state right after. */
export function useRemoteCommands(sessionId: string | undefined) {
  const { api } = useAuthedSession();
  const sessions = getSessionApi(api);
  const devices = useRemoteDevices({ enabled: false });
  const refresh = () => setTimeout(() => devices.refetch(), 400);
  const run = useMutation({
    mutationFn: async (send: (id: string) => Promise<unknown>) => {
      if (!sessionId) return;
      await send(sessionId);
    },
    onSettled: refresh,
  });
  const go = (send: (id: string) => Promise<unknown>) => run.mutate(send);

  return {
    busy: run.isPending,
    /** Start playing titles there (from a spot, in seconds; otherwise the device's own resume point). */
    play: (itemIds: string[], options: { startSeconds?: number; startIndex?: number } = {}) => go((id) => playOn(api, id, itemIds, options)),
    playstate: (command: PlaystateCommand, seekSeconds?: number) =>
      go((id) =>
        sessions.sendPlaystateCommand({
          sessionId: id,
          command,
          seekPositionTicks: seekSeconds != null ? Math.round(seekSeconds * TICKS_PER_SECOND) : undefined,
        }),
      ),
    command: (name: GeneralCommandType, args?: Record<string, string>) =>
      go((id) => sessions.sendFullGeneralCommand({ sessionId: id, generalCommand: { Name: name, Arguments: args ?? {} } })),
    message: (text: string) =>
      go((id) => sessions.sendMessageCommand({ sessionId: id, messageCommand: { Header: 'TV and J', Text: text, TimeoutMs: 8000 } })),
  };
}
