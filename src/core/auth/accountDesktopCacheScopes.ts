import { MMKV } from 'react-native-mmkv';
import {
  createEmptyAccountDesktopCacheScopeSnapshot,
  normalizeAccountDesktopCacheScopeSnapshot,
  resolveAccountDesktopCacheScope,
  type AccountDesktopCacheScopeSnapshot
} from './accountDesktopCacheScopeModel.ts';

const storage = new MMKV({ id: 'zenmind-account-desktop-cache-scopes' });
const REGISTRY_KEY = 'account_source_cache_scopes_v2';
const PURGED_KEY = 'legacy_chat_cache_purged_v2';

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

export function isLegacyChatCachePurged(): boolean {
  return storage.getBoolean(PURGED_KEY) === true;
}

export function completeLegacyChatCachePurge(): void {
  storage.delete('account_desktop_cache_scope_registry_v1');
  storage.set(PURGED_KEY, true);
}

// Drop only the obsolete account-owned cloud mapping; Desktop mappings remain intact.
export function removeLegacyAccountCloudCacheScope(entry: {
  accountId: string;
  desktopId: string;
  cacheScopeId: string;
}): void {
  if (entry.desktopId) return;
  const snapshot = readAccountDesktopCacheScopeSnapshot();
  const key = JSON.stringify([entry.accountId, '']);
  if (snapshot.mappings[key]?.cacheScopeId !== entry.cacheScopeId) return;
  delete snapshot.mappings[key];
  storage.set(REGISTRY_KEY, JSON.stringify(snapshot));
}
