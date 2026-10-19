import { useSyncExternalStore } from 'react';

import { getAccountAuthSnapshot, subscribeAccountAuth } from './accountAuth.ts';

export function useAccountAuth() {
  return useSyncExternalStore(subscribeAccountAuth, getAccountAuthSnapshot, getAccountAuthSnapshot);
}
