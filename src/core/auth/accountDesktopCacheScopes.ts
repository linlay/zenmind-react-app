import { MMKV } from 'react-native-mmkv';

import { listDeviceProfiles } from './deviceProfiles';
import {
  createEmptyAccountDesktopCacheScopeSnapshot,
  listUnassignedLegacyCacheScopes,
  normalizeAccountDesktopCacheScopeSnapshot,
  resolveAccountDesktopCacheScope,
  type AccountDesktopCacheScopeSnapshot,
  type CacheScopeResolution
} from './accountDesktopCacheScopeModel.ts';

const cacheScopeStorage = new MMKV({ id: 'zenmind-account-desktop-cache-scopes' });
const CACHE_SCOPE_REGISTRY_KEY = 'account_desktop_cache_scope_registry_v1';

export function readAccountDesktopCacheScopeSnapshot(): AccountDesktopCacheScopeSnapshot {
  const raw = cacheScopeStorage.getString(CACHE_SCOPE_REGISTRY_KEY);
  if (!raw) {
    return createEmptyAccountDesktopCacheScopeSnapshot();
  }
  try {
    return normalizeAccountDesktopCacheScopeSnapshot(JSON.parse(raw) as unknown);
  } catch {
    return createEmptyAccountDesktopCacheScopeSnapshot();
  }
}

export function resolveAndPersistAccountDesktopCacheScope(accountId: string, desktopId: string): CacheScopeResolution {
  const resolution = resolveAccountDesktopCacheScope({
    snapshot: readAccountDesktopCacheScopeSnapshot(),
    accountId,
    desktopId,
    legacyProfiles: listDeviceProfiles()
  });
  if (resolution.result === 'resolved' && resolution.created) {
    // Persist ownership before any caller is allowed to switch the active SQLite scope.
    cacheScopeStorage.set(CACHE_SCOPE_REGISTRY_KEY, JSON.stringify(resolution.snapshot));
  }
  return resolution;
}

export function listPersistedUnassignedLegacyCacheScopes() {
  return listUnassignedLegacyCacheScopes(readAccountDesktopCacheScopeSnapshot(), listDeviceProfiles());
}

export function listAccountDesktopCacheScopeEntries() {
  return Object.values(readAccountDesktopCacheScopeSnapshot().mappings).sort(
    (left, right) =>
      left.accountId.localeCompare(right.accountId) ||
      left.desktopId.localeCompare(right.desktopId) ||
      left.cacheScopeId.localeCompare(right.cacheScopeId)
  );
}
