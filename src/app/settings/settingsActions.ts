import { getCloudAuthSnapshot } from '../../core/auth/cloudAuth';
import { listAccountDesktopCacheScopeEntries } from '../../core/auth/accountDesktopCacheScopes';
import { CHAT_LEGACY_CACHE_SCOPE_ID, getChatCacheScopeId } from '../../features/chatPersistence/cacheScope';
import type { ChatCacheConversationStorage } from '../../features/chatPersistence/database';
import { chatSyncService } from '../../features/chatRealtime/chatSyncService';

export const SETTINGS_LEGACY_CACHE_SCOPE_ID = CHAT_LEGACY_CACHE_SCOPE_ID;

export type SettingsCacheScope = {
  accountId: string | null;
  desktopId: string;
  desktopName: string;
  cacheScopeId: string;
  current: boolean;
  unassigned: boolean;
  sizeBytes: number;
  lastLoadedAt: number;
  conversationCount: number;
  conversations: ChatCacheConversationStorage[];
};

export async function listSettingsCacheScopes(currentAccountId: string | null): Promise<SettingsCacheScope[]> {
  const normalizedCurrentAccountId = String(currentAccountId || '').trim();
  const candidates: {
    accountId: string | null;
    desktopId: string;
    desktopName: string;
    cacheScopeId: string;
    unassigned: boolean;
  }[] = listAccountDesktopCacheScopeEntries()
    .filter((entry) => Boolean(entry.desktopId))
    .map((entry) => ({
      ...entry,
      desktopName: '',
      unassigned: false
    }));
  const cloud = getCloudAuthSnapshot();
  if (cloud.scopeId)
    candidates.push({ accountId: null, desktopId: '', desktopName: '', cacheScopeId: cloud.scopeId, unassigned: true });
  const seen = new Set<string>();
  const scopes: SettingsCacheScope[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.cacheScopeId)) {
      continue;
    }
    seen.add(candidate.cacheScopeId);
    const inventory = await chatSyncService.inspectLocalCacheScope(candidate.cacheScopeId);
    if (inventory.database === 'missing') {
      continue;
    }
    const canReadConversationMetadata = Boolean(
      candidate.accountId && normalizedCurrentAccountId && candidate.accountId === normalizedCurrentAccountId
    );
    scopes.push({
      ...candidate,
      current: candidate.cacheScopeId === getChatCacheScopeId(),
      sizeBytes: inventory.sizeBytes,
      lastLoadedAt: inventory.lastLoadedAt,
      conversationCount: inventory.conversationCount,
      conversations: canReadConversationMetadata ? inventory.conversations : []
    });
  }
  return scopes.sort(
    (left, right) =>
      String(left.accountId || '').localeCompare(String(right.accountId || '')) ||
      left.desktopName.localeCompare(right.desktopName) ||
      left.desktopId.localeCompare(right.desktopId)
  );
}

async function restartRealtimeAfterActiveScopeClear(scopeIds: ReadonlySet<string>) {
  if (scopeIds.has(getChatCacheScopeId())) {
    await chatSyncService.start();
  }
}

export async function clearSettingsDesktopCache(scopeId: string) {
  const normalizedScopeId = String(scopeId || '').trim();
  const clearedScopes = new Set([normalizedScopeId]);
  try {
    const result = await chatSyncService.clearLocalCacheScope(normalizedScopeId);
    if (result.status === 'error') {
      throw new Error(result.errorMessage || 'Failed to clear local cache');
    }
    return result;
  } finally {
    await restartRealtimeAfterActiveScopeClear(clearedScopes).catch(() => {});
  }
}

export async function clearSettingsAccountCache(accountId: string) {
  const normalizedAccountId = String(accountId || '').trim();
  const scopeIds = new Set(
    listAccountDesktopCacheScopeEntries()
      .filter((entry) => entry.accountId === normalizedAccountId)
      .map((entry) => entry.cacheScopeId)
  );
  if (!normalizedAccountId || scopeIds.size === 0) {
    throw new Error('Account cache is not registered');
  }
  try {
    for (const scopeId of scopeIds) {
      const result = await chatSyncService.clearLocalCacheScope(scopeId);
      if (result.status === 'error') {
        throw new Error(result.errorMessage || 'Failed to clear local cache');
      }
    }
  } finally {
    await restartRealtimeAfterActiveScopeClear(scopeIds).catch(() => {});
  }
}

export async function clearSettingsConversationCache(
  currentAccountId: string,
  scopeId: string,
  conversationId: string
) {
  const normalizedAccountId = String(currentAccountId || '').trim();
  const normalizedScopeId = String(scopeId || '').trim();
  const ownsScope = listAccountDesktopCacheScopeEntries().some(
    (entry) => entry.accountId === normalizedAccountId && entry.cacheScopeId === normalizedScopeId
  );
  if (!ownsScope) {
    throw new Error('Sign in to the matching account before clearing a conversation');
  }
  const active = normalizedScopeId === getChatCacheScopeId();
  try {
    return await chatSyncService.clearLocalConversationCache(normalizedScopeId, conversationId);
  } finally {
    if (active) {
      await chatSyncService.start().catch(() => {});
    }
  }
}
