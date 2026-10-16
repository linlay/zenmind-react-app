import { clearChatComposerPreferences } from './chatComposerPreferences.ts';
import type { AccountDevice } from '../../core/api/contracts/deviceLink.ts';
import { getDesktopPlatformCredential } from '../../core/api/services/deviceLinkApi.ts';
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
import { resolveAndPersistAccountDesktopCacheScope } from '../../core/auth/accountDesktopCacheScopes.ts';
import { getCloudAuthSnapshot, restoreCloudCredential, subscribeCloudAuth } from '../../core/auth/cloudAuth.ts';
import { verifyDefaultCloud, cancelCloudVerification } from './cloudAccess.ts';
import { listAccountDevices } from '../../core/api/services/deviceLinkApi.ts';
import { updateAccountDesktopAvailability } from '../../core/auth/activeDesktop.ts';
import { getActiveChatSource } from './chatSourceRuntime';
import { getChatCacheScopeId } from './cacheScope';
import { clearDesktopPlatformCredentialCache } from '../../core/api/activeWsTransport.ts';
import { chatSyncService } from '../chatRealtime/chatSyncService.ts';
import { ensureChatDatabase, switchChatDatabaseScope } from './database.ts';
import { notifyChatCacheScopeChanged } from './cacheScope.ts';

let selectionGeneration = 0;

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
    clearDesktopPlatformCredentialCache();
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
  restoreCloudCredential();
  const firstLaunch = !hasSavedSourceSelection() && !hasLegacyDesktopSelection();
  let stopped = false;
  let directoryAccountId = '';
  let preferenceAccountId = getAccountAuthSnapshot().session?.accountId || '';
  let preferenceCloudScope = getCloudAuthSnapshot().scopeId;
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
      const next = getAccountAuthSnapshot();
      const accountId = next.session?.accountId || '';
      if (!next.isBootstrapping && accountId !== preferenceAccountId) {
        if (preferenceAccountId) clearChatComposerPreferences(`account:${preferenceAccountId}`);
        preferenceAccountId = accountId;
      }
      reconcileSource();
      refreshRestoredDesktop();
    }),
    subscribeCloudAuth(() => {
      const next = getCloudAuthSnapshot();
      if (preferenceCloudScope && (next.scopeId !== preferenceCloudScope || next.status === 'login_required'))
        clearChatComposerPreferences(`cloud:${preferenceCloudScope}`);
      preferenceCloudScope = next.scopeId;
      reconcileSource();
    }),
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
      await getDesktopPlatformCredential(device.deviceId);
      if (getAccountAuthSnapshot().session?.accountId !== accountId) throw new Error('Account changed');
    }
    if (authGeneration !== getAccountAuthGeneration()) throw new Error('Source selection superseded');
  } else if (getCloudAuthSnapshot().status !== 'available') throw new Error('Cloud access unavailable');
  if (requestGeneration !== selectionGeneration) throw new Error('Source selection superseded');
  const previous = getSelectedSource();
  const previousScope = getChatCacheScopeId();
  const scopeId = device
    ? resolveAndPersistAccountDesktopCacheScope(accountId, device.deviceId).entry.cacheScopeId
    : getCloudAuthSnapshot().scopeId;
  clearDesktopPlatformCredentialCache();
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
