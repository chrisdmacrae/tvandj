import { usePathname } from 'expo-router';
import { useEffect } from 'react';

type Direction = 'up' | 'down' | 'left' | 'right';

const KEYS: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

const FOCUSABLE = '[tabindex]:not([tabindex="-1"]), a[href], button, input, textarea, select';

/** What arrows can land on: focusable, visible, and inside the open dialog if there is one. */
function candidates(): HTMLElement[] {
  const dialogs = document.querySelectorAll<HTMLElement>('[aria-modal="true"]');
  const scope: ParentNode = dialogs.length ? dialogs[dialogs.length - 1] : document;
  return Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return false;
    // Screens the stack has moved past stay in the DOM, hidden.
    if (el.closest('[aria-hidden="true"], [inert]')) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && (el.checkVisibility?.({ visibilityProperty: true }) ?? true);
  });
}

/** Gap between two ranges, 0 when they overlap. */
const gap = (a1: number, a2: number, b1: number, b2: number) => Math.max(0, b1 - a2, a1 - b2);

/**
 * The nearest element in a direction, the way a TV remote moves: straight
 * ahead first (overlapping the current row or column), then the closest
 * off to the side, with a small pull towards lining up centres.
 */
function nearest(from: DOMRect, direction: Direction, all: HTMLElement[], current: Element | null) {
  const cx = from.left + from.width / 2;
  const cy = from.top + from.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of all) {
    if (el === current || el.contains(current)) continue;
    const r = el.getBoundingClientRect();
    const rx = r.left + r.width / 2;
    const ry = r.top + r.height / 2;
    let ahead: number;
    let side: number;
    let offset: number;
    if (direction === 'right' || direction === 'left') {
      if (direction === 'right' ? rx <= cx || r.left < from.left : rx >= cx || r.right > from.right) continue;
      ahead = direction === 'right' ? Math.max(0, r.left - from.right) : Math.max(0, from.left - r.right);
      side = gap(from.top, from.bottom, r.top, r.bottom);
      offset = Math.abs(ry - cy);
    } else {
      if (direction === 'down' ? ry <= cy || r.top < from.top : ry >= cy || r.bottom > from.bottom) continue;
      ahead = direction === 'down' ? Math.max(0, r.top - from.bottom) : Math.max(0, from.top - r.bottom);
      side = gap(from.left, from.right, r.left, r.right);
      offset = Math.abs(rx - cx);
    }
    const score = ahead + side * 4 + offset * 0.1;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

/** With nothing focused yet, the first thing on screen (top-left). */
function firstOnScreen(all: HTMLElement[]) {
  const visible = all.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
  });
  return visible.sort((a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    return ra.top - rb.top || ra.left - rb.left;
  })[0];
}

/**
 * Arrow keys move focus around the page like the TV remote's D-pad; Enter
 * and Space press (react-native-web's Pressable handles those). Off while
 * the player is up: it takes the arrows for its own controls.
 */
export function useArrowKeyNavigation() {
  const pathname = usePathname();
  const enabled = !pathname.startsWith('/watch');

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const direction = KEYS[e.key];
      if (!direction || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const active = document.activeElement as HTMLElement | null;
      const focused = active && active !== document.body ? active : null;
      if (focused) {
        const tag = focused.tagName;
        // Arrows belong to the field: the caret in text, options in a select, lines in a textarea.
        if (tag === 'SELECT' || tag === 'TEXTAREA' || focused.isContentEditable) return;
        if (tag === 'INPUT' && (direction === 'left' || direction === 'right')) return;
      }
      const all = candidates();
      const next = focused ? nearest(focused.getBoundingClientRect(), direction, all, focused) : firstOnScreen(all);
      // Nothing that way: stay put, but don't let the arrow scroll the page out from under the focus.
      e.preventDefault();
      if (!next) return;
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    };
    // Capture: react-native-web's TextInput stops keydown from bubbling.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled]);
}
