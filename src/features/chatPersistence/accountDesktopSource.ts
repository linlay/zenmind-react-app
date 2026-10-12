import { Directory, File } from 'expo-file-system';
import { defaultDatabaseDirectory } from 'expo-sqlite';
import type { AccountDevice } from '../../core/api/contracts/deviceLink.ts';
import { issueDesktopRouteCredential } from '../../core/api/services/deviceLinkApi.ts';
import { getAccountAuthGeneration, getAccountAuthSnapshot, subscribeAccountAuth } from '../../core/auth/accountAuth.ts';
import {
  commitActiveDesktop,
  commitSelectedSource,
  getSelectedSource,
  hasSavedSourceSelection,
  hasLegacyDesktopSelection,
  restoreLegacyDesktopSelection,
  subscribeActiveDesktop,
  isActiveDesktopOffline
} from '../../core/auth/activeDesktop.ts';
import {
  listAccountDesktopCacheScopeEntries,
  removeLegacyAccountCloudCacheScope,
  completeLegacyChatCachePurge,
  isLegacyChatCachePurged,
  resolveAndPersistAccountDesktopCacheScope
} from '../../core/auth/accountDesktopCacheScopes.ts';
import { getCloudAuthSnapshot, restoreCloudCredential, subscribeCloudAuth } from '../../core/auth/cloudAuth.ts';
import { verifyDefaultCloud, cancelCloudVerification } from './cloudAccess.ts';
import { listAccountDevices } from '../../core/api/services/deviceLinkApi.ts';
import { updateAccountDesktopAvailability } from '../../core/auth/activeDesktop.ts';
import { getActiveChatSource } from './chatSourceRuntime';
import { getChatCacheScopeId } from './cacheScope';
import { MMKV } from 'react-native-mmkv';
import { createRequestId, clearDesktopRouteCredentialCache } from '../../core/api/activeWsTransport.ts';
import { chatSyncService } from '../chatRealtime/chatSyncService.ts';
import { deleteChatDatabaseScopeIfExists, ensureChatDatabase, switchChatDatabaseScope } from './database.ts';
import { clearChatDirectorySnapshotForScope } from './homeSnapshot.ts';
import { notifyChatCacheScopeChanged } from './cacheScope.ts';

let selectionGeneration = 0;

function purgeLegacyCaches(): void {
  for (const entry of listAccountDesktopCacheScopeEntries()) {
    if (entry.desktopId) continue;
    deleteChatDatabaseScopeIfExists(entry.cacheScopeId);
    clearChatDirectorySnapshotForScope(entry.cacheScopeId);
    removeLegacyAccountCloudCacheScope(entry);
  }
  if (!isLegacyChatCachePurged()) {
    const directory = new Directory(defaultDatabaseDirectory);
    if (directory.exists) {
      for (const file of directory.list()) {
        if (!(file instanceof File)) continue;
        const match = /^zenmind-chat-(demo|[a-zA-Z0-9_-]+)\.db$/u.exec(file.name);
        if (!match || match[1] === 'signed_out' || match[1].startsWith('as_') || match[1].startsWith('cs_')) continue;
        const scopeId = match[1] === 'demo' ? 'legacy' : match[1];
        deleteChatDatabaseScopeIfExists(scopeId);
        clearChatDirectorySnapshotForScope(scopeId);
      }
    }
    new MMKV({ id: 'zenmind-device-profiles' }).clearAll();
    new MMKV({ id: 'zenmind-auth-session' }).delete('auth_device_token_v1');
    completeLegacyChatCachePurge();
  }
}

function reconcileSource(): void {
  const selected = getSelectedSource();
  const account = getAccountAuthSnapshot();
  if (selected?.kind === 'desktop' && !account.isBootstrapping && account.session?.accountId !== selected.accountId) {
    commitSelectedSource(null);
    return;
  }
  const source = getActiveChatSource();
  const scopeId =
    source?.kind === 'default'
      ? getCloudAuthSnapshot().scopeId
      : source && selected?.kind === 'desktop'
        ? resolveAndPersistAccountDesktopCacheScope(selected.accountId, selected.desktopId).entry.cacheScopeId
        : 'signed_out';
  if (scopeId !== getChatCacheScopeId()) {
    selectionGeneration++;
    clearDesktopRouteCredentialCache();
    chatSyncService.stop();
    switchChatDatabaseScope(scopeId);
  }
  if (selected?.kind === 'desktop' && isActiveDesktopOffline()) chatSyncService.stop();
  chatSyncService.notifySourceAccessChanged();
  if (source) {
    void chatSyncService.prewarmHome().catch(() => {});
    void chatSyncService.start().catch(() => {});
  }
}

export function startAccountSourceLifecycle(): () => void {
  purgeLegacyCaches();
  restoreCloudCredential();
  const firstLaunch = !hasSavedSourceSelection() && !hasLegacyDesktopSelection();
  let stopped = false;
  let directoryAccountId = '';
  let directoryController: AbortController | null = null;
  const refreshRestoredDesktop = () => {
    const account = getAccountAuthSnapshot();
    const id = account.session?.accountId || '';
    if (account.isBootstrapping || id === directoryAccountId) return;
    directoryAccountId = id;
    restoreLegacyDesktopSelection(id);
    directoryController?.abort();
    directoryController = id ? new AbortController() : null;
    if (directoryController) void refreshAccountDesktopDirectory(directoryController.signal).catch(() => {});
  };
  const unsubscribers = [
    subscribeAccountAuth(() => {
      reconcileSource();
      refreshRestoredDesktop();
    }),
    subscribeCloudAuth(reconcileSource),
    subscribeActiveDesktop(reconcileSource)
  ];
  reconcileSource();
  refreshRestoredDesktop();
  void verifyDefaultCloud().then((status) => {
    if (!stopped && firstLaunch && !hasSavedSourceSelection() && status === 'available')
      commitSelectedSource({ kind: 'cloud' });
  });
  return () => {
    stopped = true;
    directoryController?.abort();
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    cancelCloudVerification();
    chatSyncService.stop();
  };
}

export async function refreshAccountDesktopDirectory(signal?: AbortSignal) {
  const accountId = getAccountAuthSnapshot().session?.accountId;
  if (!accountId) return { items: [] };
  const result = await listAccountDevices(signal);
  if (signal?.aborted || getAccountAuthSnapshot().session?.accountId !== accountId) throw new Error('Account changed');
  if (updateAccountDesktopAvailability(accountId, result.items)) deactivateAccountDesktopSource(accountId);
  return result;
}

export function deactivateAccountDesktopSource(accountId: string): void {
  const selected = getSelectedSource();
  if (selected?.kind === 'desktop' && selected.accountId === accountId) {
    selectionGeneration++;
    chatSyncService.stop();
    switchChatDatabaseScope('signed_out', false);
    commitSelectedSource(null);
    notifyChatCacheScopeChanged();
  }
}

export async function activateAccountDesktopSource(accountId: string, device: AccountDevice | null): Promise<void> {
  const requestGeneration = ++selectionGeneration;
  const authGeneration = getAccountAuthGeneration();
  if (device) {
    if (!accountId || getAccountAuthSnapshot().session?.accountId !== accountId) throw new Error('Account changed');
    if (device.online !== false) {
      const route = await issueDesktopRouteCredential(device.deviceId, createRequestId());
      const session = getAccountAuthSnapshot().session;
      if (
        !session ||
        route.routeContext.accountId !== accountId ||
        route.routeContext.sourceDeviceId !== session.deviceId ||
        route.routeContext.targetDesktopId !== device.deviceId
      )
        throw new Error('Route credential identity mismatch');
    }
    if (authGeneration !== getAccountAuthGeneration()) throw new Error('Source selection superseded');
  } else if (getCloudAuthSnapshot().status !== 'available') throw new Error('Cloud access unavailable');
  if (requestGeneration !== selectionGeneration) throw new Error('Source selection superseded');
  const previous = getSelectedSource();
  const previousScope = getChatCacheScopeId();
  const scopeId = device
    ? resolveAndPersistAccountDesktopCacheScope(accountId, device.deviceId).entry.cacheScopeId
    : getCloudAuthSnapshot().scopeId;
  clearDesktopRouteCredentialCache();
  chatSyncService.stop();
  try {
    switchChatDatabaseScope(scopeId, false);
    if (device) commitActiveDesktop(accountId, device);
    else commitSelectedSource({ kind: 'cloud' });
    notifyChatCacheScopeChanged();
    await ensureChatDatabase();
  } catch (error) {
    if (requestGeneration === selectionGeneration) {
      chatSyncService.stop();
      switchChatDatabaseScope(previousScope, false);
      commitSelectedSource(previous);
      notifyChatCacheScopeChanged();
    }
    throw error;
  }
  if (requestGeneration !== selectionGeneration || (device && authGeneration !== getAccountAuthGeneration()))
    throw new Error('Source selection superseded');
  // Connectivity failures retain the selected source and its cache.
  void chatSyncService.start().catch(() => {});
}
