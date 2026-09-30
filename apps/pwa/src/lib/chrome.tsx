import { createContext, use } from 'react';

/** Space the phone's bottom navigation covers, so screens can scroll their content clear of it. */
export const BottomSpaceContext = createContext(0);
export const useBottomSpace = () => use(BottomSpaceContext);
