import { useTVEventHandler } from 'react-native';

/**
 * Remote/D-pad key events. react-native-tvos provides the hook on TV and
 * phone builds; react-native-web doesn't, so web falls back to a no-op.
 */
export const useRemoteKeys: typeof useTVEventHandler = useTVEventHandler ?? (() => {});
