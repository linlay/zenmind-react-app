import { useSyncExternalStore } from 'react';

import { getAuthSnapshot, subscribeAuthStore } from './appAuth';

export function useAuthSession() {
  return useSyncExternalStore(subscribeAuthStore, getAuthSnapshot, getAuthSnapshot);
}
