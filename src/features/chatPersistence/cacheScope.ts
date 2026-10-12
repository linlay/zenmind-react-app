const DEFAULT_CHAT_CACHE_SCOPE_ID = 'signed_out';
const CACHE_SCOPE_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/u;

let currentChatCacheScopeId = DEFAULT_CHAT_CACHE_SCOPE_ID;
const listeners = new Set<() => void>();

export function subscribeChatCacheScope(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyChatCacheScopeChanged() {
  listeners.forEach((listener) => listener());
}

export function normalizeChatCacheScopeId(value: string): string {
  const normalized = String(value || '').trim();
  if (CACHE_SCOPE_PATTERN.test(normalized)) {
    return normalized;
  }
  return DEFAULT_CHAT_CACHE_SCOPE_ID;
}

export function getChatCacheScopeId(): string {
  return currentChatCacheScopeId;
}

export function setChatCacheScopeId(scopeId: string): boolean {
  const normalized = normalizeChatCacheScopeId(scopeId);
  if (currentChatCacheScopeId === normalized) {
    return false;
  }
  currentChatCacheScopeId = normalized;
  return true;
}

export function buildChatDatabaseName(scopeId = currentChatCacheScopeId): string {
  const normalized = normalizeChatCacheScopeId(scopeId);
  return normalized === 'legacy' ? 'zenmind-chat-demo.db' : `zenmind-chat-${normalized}.db`;
}

export function buildChatDirectorySnapshotKey(scopeId = currentChatCacheScopeId): string {
  return `${normalizeChatCacheScopeId(scopeId)}:chat_directory_snapshot_v1`;
}

export const CHAT_LEGACY_CACHE_SCOPE_ID = 'legacy';
