import { chatSyncService } from '../../features/chatRealtime/chatSyncService';
import { CHAT_LEGACY_CACHE_SCOPE_ID } from '../../features/chatPersistence/cacheScope';

export const SETTINGS_LEGACY_CACHE_SCOPE_ID = CHAT_LEGACY_CACHE_SCOPE_ID;

export async function hasSettingsLegacyLocalCache() {
  return chatSyncService.hasActiveLocalConversations();
}

export async function clearSettingsProfileCache(scopeId: string, restartRealtime: boolean) {
  try {
    const result = await chatSyncService.clearLocalCacheScope(scopeId);
    if (result.status === 'error') {
      throw new Error(result.errorMessage || 'Failed to clear local cache');
    }
    return result;
  } finally {
    if (restartRealtime) {
      void chatSyncService.start().catch(() => {});
    }
  }
}
