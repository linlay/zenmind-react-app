import { useSyncExternalStore } from 'react';
import { getCloudAuthSnapshot, subscribeCloudAuth } from './cloudAuth';
export function useCloudAuth() {
  return useSyncExternalStore(subscribeCloudAuth, getCloudAuthSnapshot, getCloudAuthSnapshot);
}
