import type { BaseItemDto, GeneralCommandType } from '@jellyfin/sdk/lib/generated-client/models';
import { getLibraryApi, getSessionApi } from '@jellyfin/sdk/lib/utils/api';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Text, colors, radii, safeArea, spacing } from '@tv-and-j/design-system';
import { useMusic } from '../music/MusicPlayer';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';

const TICKS_PER_SECOND = 10_000_000;
const RECONNECT_MIN_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;
const MESSAGE_DEFAULT_MS = 6_000;

/** What a player on screen can do when a phone asks. */
export type RemoteHandlers = {
  pause: () => void;
  resume: () => void;
  togglePlay: () => void;
  stop: () => void;
  seekTo: (seconds: number) => void;
  seekBy: (seconds: number) => void;
  next?: () => void;
  setVolume: (volume: number) => void;
  changeVolume: (delta: number) => void;
  toggleMute: (muted?: boolean) => void;
  selectAudio: (index: number) => void;
  selectSubtitle: (index: number) => void;
};

// The player currently on screen, if any. One at a time: the last to register wins.
let handlers: RemoteHandlers | null = null;

/** Let phones control this player while it's on screen. */
export function useRemoteHandlers(next: RemoteHandlers, active: boolean) {
  const latest = useRef(next);
  latest.current = next;
  useEffect(() => {
    if (!active) return;
    // Forward to the latest callbacks so re-renders don't re-register.
    const proxy: RemoteHandlers = {
      pause: () => latest.current.pause(),
      resume: () => latest.current.resume(),
      togglePlay: () => latest.current.togglePlay(),
      stop: () => latest.current.stop(),
      seekTo: (s) => latest.current.seekTo(s),
      seekBy: (s) => latest.current.seekBy(s),
      next: () => latest.current.next?.(),
      setVolume: (v) => latest.current.setVolume(v),
      changeVolume: (d) => latest.current.changeVolume(d),
      toggleMute: (m) => latest.current.toggleMute(m),
      selectAudio: (i) => latest.current.selectAudio(i),
      selectSubtitle: (i) => latest.current.selectSubtitle(i),
    };
    handlers = proxy;
    return () => {
      if (handlers === proxy) handlers = null;
    };
  }, [active]);
}

const SUPPORTED_COMMANDS: GeneralCommandType[] = [
  'DisplayMessage',
  'SetVolume',
  'VolumeUp',
  'VolumeDown',
  'Mute',
  'Unmute',
  'ToggleMute',
  'SetAudioStreamIndex',
  'SetSubtitleStreamIndex',
  'PlayState',
  'Play',
];

type Message = { MessageType: string; Data?: any };
type Toast = { header?: string; text: string };

/**
 * Makes this TV a device the Jellyfin phone and web apps can control ("Play
 * on", pause, seek, change tracks, send a message). Registers what it
 * supports, then listens on Jellyfin's live connection for commands,
 * reconnecting if the server goes away. Now-playing on the phone comes from
 * the playback reports the player already sends.
 */
export function RemoteControl() {
  const { api, auth } = useAuthedSession();
  const music = useMusic();
  const playMusic = useRef((items: BaseItemDto[], startIndex: number) => music.playQueue(items, { startIndex }));
  playMusic.current = (items, startIndex) => music.playQueue(items, { startIndex });
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;
    let keepAlive: ReturnType<typeof setInterval>;
    let delay = RECONNECT_MIN_MS;

    const send = (message: Message) => socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify(message));

    const handle = (message: Message) => {
      const data = message.Data ?? {};
      switch (message.MessageType) {
        case 'ForceKeepAlive': {
          // The server drops clients that go quiet; ping at half its timeout.
          clearInterval(keepAlive);
          const seconds = Number(data) || 60;
          keepAlive = setInterval(() => send({ MessageType: 'KeepAlive' }), (seconds * 1000) / 2);
          break;
        }
        case 'Play': {
          const ids: string[] = data.ItemIds ?? [];
          const startIndex: number = data.StartIndex ?? 0;
          const id = ids[startIndex] ?? ids[0];
          if (!id) break;
          const start = data.StartPositionTicks ? String(data.StartPositionTicks / TICKS_PER_SECOND) : undefined;
          // Songs go to the music queue (in the order sent); anything else opens its page and plays.
          getLibraryApi(api)
            .getItems({ userId: auth.userId, ids })
            .then(({ data: result }) => {
              const items = result.Items ?? [];
              if (items.length && items.every((i) => i.MediaType === 'Audio')) {
                const ordered = ids.map((i) => items.find((item) => item.Id === i)).filter((i): i is BaseItemDto => !!i);
                playMusic.current(ordered, startIndex);
                router.push('/now-playing');
              } else {
                router.push({ pathname: '/item/[id]', params: { id, autoplay: '1', ...(start ? { start } : {}) } });
              }
            })
            .catch(() => router.push({ pathname: '/item/[id]', params: { id, autoplay: '1', ...(start ? { start } : {}) } }));
          break;
        }
        case 'Playstate': {
          const h = handlers;
          if (!h) break;
          switch (data.Command) {
            case 'Pause':
              h.pause();
              break;
            case 'Unpause':
              h.resume();
              break;
            case 'PlayPause':
              h.togglePlay();
              break;
            case 'Stop':
              h.stop();
              break;
            case 'Seek':
              if (data.SeekPositionTicks != null) h.seekTo(data.SeekPositionTicks / TICKS_PER_SECOND);
              break;
            case 'Rewind':
              h.seekBy(-10);
              break;
            case 'FastForward':
              h.seekBy(30);
              break;
            case 'NextTrack':
              h.next?.();
              break;
          }
          break;
        }
        case 'GeneralCommand': {
          const args = data.Arguments ?? {};
          const h = handlers;
          switch (data.Name) {
            case 'DisplayMessage': {
              const text = args.Text ?? args.Header;
              if (!text) break;
              setToast({ header: args.Text ? args.Header : undefined, text });
              clearTimeout(toastTimer.current);
              toastTimer.current = setTimeout(() => setToast(null), Number(args.TimeoutMs) || MESSAGE_DEFAULT_MS);
              break;
            }
            case 'SetVolume':
              h?.setVolume(Math.max(0, Math.min(100, Number(args.Volume))) / 100);
              break;
            case 'VolumeUp':
              h?.changeVolume(0.1);
              break;
            case 'VolumeDown':
              h?.changeVolume(-0.1);
              break;
            case 'Mute':
              h?.toggleMute(true);
              break;
            case 'Unmute':
              h?.toggleMute(false);
              break;
            case 'ToggleMute':
              h?.toggleMute();
              break;
            case 'SetAudioStreamIndex':
              if (args.Index != null) h?.selectAudio(Number(args.Index));
              break;
            case 'SetSubtitleStreamIndex':
              if (args.Index != null) h?.selectSubtitle(Number(args.Index));
              break;
          }
          break;
        }
      }
    };

    const connect = () => {
      if (closed) return;
      const url = `${api.basePath.replace(/^http/, 'ws')}/socket?ApiKey=${encodeURIComponent(api.accessToken)}&deviceId=${encodeURIComponent(api.deviceInfo.id)}`;
      socket = new WebSocket(url);
      socket.onopen = () => {
        delay = RECONNECT_MIN_MS;
      };
      socket.onmessage = (e) => {
        try {
          handle(JSON.parse(String(e.data)) as Message);
        } catch {
          // Not for us.
        }
      };
      socket.onclose = () => {
        clearInterval(keepAlive);
        if (closed) return;
        retry = setTimeout(connect, delay);
        delay = Math.min(delay * 2, RECONNECT_MAX_MS);
      };
    };

    // Tell Jellyfin what this TV can do, so it's offered as a place to play and control.
    getSessionApi(api)
      .postFullCapabilities({
        clientCapabilitiesDto: {
          PlayableMediaTypes: ['Video', 'Audio'],
          SupportedCommands: SUPPORTED_COMMANDS,
          SupportsMediaControl: true,
          SupportsPersistentIdentifier: true,
        },
      })
      .catch(() => {})
      .finally(connect);

    return () => {
      closed = true;
      clearTimeout(retry);
      clearInterval(keepAlive);
      socket?.close();
    };
  }, [api, auth.userId]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  if (!toast) return null;
  return (
    // A message from someone's phone, top centre, over whatever's on screen.
    <View pointerEvents="none" style={{ position: 'absolute', top: safeArea.vertical, left: 0, right: 0, alignItems: 'center' }}>
      <View style={{ maxWidth: 520, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surfaceRaised, gap: spacing.xxs }}>
        {toast.header ? <Text variant="label">{toast.header}</Text> : null}
        <Text tone={toast.header ? 'secondary' : 'primary'}>{toast.text}</Text>
      </View>
    </View>
  );
}
