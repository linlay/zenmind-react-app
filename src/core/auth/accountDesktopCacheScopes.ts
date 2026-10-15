import { MMKV } from 'react-native-mmkv';
import {
  createEmptyAccountDesktopCacheScopeSnapshot,
  normalizeAccountDesktopCacheScopeSnapshot,
  resolveAccountDesktopCacheScope,
  type AccountDesktopCacheScopeSnapshot
} from './accountDesktopCacheScopeModel.ts';

const storage = new MMKV({ id: 'zenmind-account-desktop-cache-scopes' });
const REGISTRY_KEY = 'account_source_cache_scopes_v2';

export function readAccountDesktopCacheScopeSnapshot(): AccountDesktopCacheScopeSnapshot {
  try {
    return normalizeAccountDesktopCacheScopeSnapshot(JSON.parse(storage.getString(REGISTRY_KEY) || 'null'));
  } catch {
    return createEmptyAccountDesktopCacheScopeSnapshot();
  }
}

export function resolveAndPersistAccountDesktopCacheScope(accountId: string, desktopId: string) {
  const resolution = resolveAccountDesktopCacheScope({
    snapshot: readAccountDesktopCacheScopeSnapshot(),
    accountId,
    desktopId,
    createScopeId: () => `as_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
  });
  if (resolution.created) storage.set(REGISTRY_KEY, JSON.stringify(resolution.snapshot));
  return resolution;
}

export function listAccountDesktopCacheScopeEntries() {
  return Object.values(readAccountDesktopCacheScopeSnapshot().mappings);
}
