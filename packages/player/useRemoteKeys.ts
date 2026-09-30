import { useEffect, useRef } from 'react';
import { Platform, useTVEventHandler } from 'react-native';

/** A remote or keyboard press, in the TV's terms. eventKeyAction 1 is a completed press (TV key-up). */
export type RemoteEvent = { eventType: string; eventKeyAction?: number };

/** Keyboard keys → the TV remote's names, so the web player behaves exactly like the TV's. */
const KEYS: Record<string, string> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Enter: 'select',
  ' ': 'playPause',
  k: 'playPause',
  MediaPlayPause: 'playPause',
  j: 'rewind',
  MediaRewind: 'rewind',
  l: 'fastForward',
  MediaFastForward: 'fastForward',
  Escape: 'back',
};

function useKeyboardKeys(handler: (event: RemoteEvent) => void) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Typing in a field isn't a remote press.
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const eventType = KEYS[e.key];
      if (!eventType || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      // Keep Space and the arrows for the player rather than scrolling the page.
      if (eventType !== 'select' && eventType !== 'back') e.preventDefault();
      latest.current({ eventType, eventKeyAction: 1 });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/**
 * Remote presses: the TV remote on TV (react-native-tvos), the keyboard on the
 * web (arrows, Enter, Space/K, J/L, Esc), in the same terms either way.
 */
export const useRemoteKeys: (handler: (event: RemoteEvent) => void) => void =
  Platform.OS === 'web' ? useKeyboardKeys : ((useTVEventHandler as unknown as (h: (e: RemoteEvent) => void) => void) ?? (() => {}));
