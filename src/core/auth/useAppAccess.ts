import { useSyncExternalStore } from 'react';

import { getAppAccessSnapshot, subscribeAppAccessStore } from './appAccess';

export function useAppAccess() {
  return useSyncExternalStore(
    subscribeAppAccessStore,
    getAppAccessSnapshot,
    getAppAccessSnapshot
  );
}
