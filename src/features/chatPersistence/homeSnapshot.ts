import { MMKV } from 'react-native-mmkv';

import { normalizeAgentAvatarIcon } from '../../shared/visual/agentAvatarIcon.ts';
import {
  buildChatDirectorySnapshotKey,
  CHAT_CACHE_SCHEMA_VERSION,
  CHAT_LEGACY_CACHE_SCOPE_ID,
  getChatCacheScopeId,
  normalizeChatCacheScopeId
} from './cacheScope';
import { normalizeChatReasoningEffort } from './agentModelSettings.ts';
import { ChatDirectoryItem, ChatDirectorySnapshot } from './types';
import { getChatSourceFromId } from './chatSource';

const storage = new MMKV({ id: 'zenmind-chat-home-snapshot' });
const LEGACY_HOME_SNAPSHOT_KEY = 'chat_home_snapshot_v1';
const DIRECTORY_SNAPSHOT_KEY = 'chat_directory_snapshot_v1';

function normalizeDirectorySnapshotItem(item: ChatDirectoryItem): ChatDirectoryItem {
  return {
    ...item,
    source: getChatSourceFromId(item.id),
    icon: normalizeAgentAvatarIcon(item.icon),
    unreadCount: Math.max(0, Math.trunc(Number(item.unreadCount || 0))),
    pinnedAt: Number(item.pinnedAt || 0),
    sortRank: Number.isFinite(Number(item.sortRank)) ? Number(item.sortRank) : 0,
    agentKey: item.agentKey ? String(item.agentKey) : null,
    agentMode: item.agentMode ? String(item.agentMode) : null,
    modelKey: item.modelKey ? String(item.modelKey) : null,
    reasoningEffort: normalizeChatReasoningEffort(item.reasoningEffort),
    latestConversationId: item.latestConversationId ? String(item.latestConversationId) : null,
    lastMessageText: String(item.lastMessageText || ''),
    lastMessageAt: Number.isFinite(Number(item.lastMessageAt)) ? Number(item.lastMessageAt) : 0
  };
}

export function readChatDirectorySnapshot(): ChatDirectorySnapshot | null {
  const scopeId = getChatCacheScopeId();
  const raw = storage.getString(buildChatDirectorySnapshotKey(scopeId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as ChatDirectorySnapshot;
    if (parsed?.version !== CHAT_CACHE_SCHEMA_VERSION || !Array.isArray(parsed.items)) {
      storage.delete(buildChatDirectorySnapshotKey(scopeId));
      return null;
    }
    return {
      ...parsed,
      items: parsed.items.map(normalizeDirectorySnapshotItem)
    };
  } catch {
    return null;
  }
}

export function writeChatDirectorySnapshot(items: ChatDirectoryItem[]) {
  const snapshot: ChatDirectorySnapshot = {
    version: CHAT_CACHE_SCHEMA_VERSION,
    updatedAt: Date.now(),
    items
  };

  storage.set(buildChatDirectorySnapshotKey(), JSON.stringify(snapshot));
}

export function clearChatDirectorySnapshot() {
  storage.delete(LEGACY_HOME_SNAPSHOT_KEY);
  if (getChatCacheScopeId() === CHAT_LEGACY_CACHE_SCOPE_ID) {
    storage.delete(DIRECTORY_SNAPSHOT_KEY);
  }
  storage.delete(buildChatDirectorySnapshotKey());
}

export function clearChatDirectorySnapshotForScope(scopeId: string) {
  const rawScopeId = String(scopeId || '').trim();
  const normalizedScopeId = normalizeChatCacheScopeId(rawScopeId);
  if (!rawScopeId || normalizedScopeId !== rawScopeId || normalizedScopeId === getChatCacheScopeId()) {
    return;
  }

  storage.delete(buildChatDirectorySnapshotKey(normalizedScopeId));
  if (normalizedScopeId === CHAT_LEGACY_CACHE_SCOPE_ID && getChatCacheScopeId() !== CHAT_LEGACY_CACHE_SCOPE_ID) {
    storage.delete(LEGACY_HOME_SNAPSHOT_KEY);
    storage.delete(DIRECTORY_SNAPSHOT_KEY);
  }
}
