import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'tvandj.remoteTarget';

type RemoteTarget = {
  /** The Jellyfin session this browser is controlling, if any. */
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
};

const RemoteTargetContext = createContext<RemoteTarget>({ sessionId: null, setSessionId: () => {} });

function read() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Which device (e.g. the TV) this browser is remote-controlling. Remembered here; a convenience, not a setting. */
export function RemoteTargetProvider({ children }: { children: ReactNode }) {
  const [sessionId, setState] = useState<string | null>(read);
  const setSessionId = useCallback((id: string | null) => {
    setState(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Private mode: just this visit.
    }
  }, []);
  const value = useMemo(() => ({ sessionId, setSessionId }), [sessionId, setSessionId]);
  return <RemoteTargetContext value={value}>{children}</RemoteTargetContext>;
}

export const useRemoteTarget = () => use(RemoteTargetContext);
