import { createContext, use, useCallback, useRef, useState, type ReactNode } from 'react';

type SetGlow = (color: string | null | Promise<string | null>) => void;

// Two contexts on purpose: every card needs the setter, only the glow needs the
// colour. Sharing one would re-render every card on screen each time focus moves.
const ColorContext = createContext<string | null>(null);
const SetterContext = createContext<SetGlow>(() => {});

/** The ambient glow colour for the browse screens, driven by whichever card has focus. */
export function GlowProvider({ children }: { children: ReactNode }) {
  const [color, setColor] = useState<string | null>(null);
  const latest = useRef(0);

  const setGlow = useCallback<SetGlow>((next) => {
    const ticket = ++latest.current;
    Promise.resolve(next).then((c) => {
      // Focus may have moved on while a remote colour was being computed.
      if (ticket === latest.current && c) setColor(c);
    });
  }, []);

  return (
    <SetterContext value={setGlow}>
      <ColorContext value={color}>{children}</ColorContext>
    </SetterContext>
  );
}

/** For cards: set the glow on focus. Stable; never causes a re-render. */
export function useSetGlow() {
  return use(SetterContext);
}

/** For the glow itself. */
export function useGlowColor() {
  return use(ColorContext);
}

