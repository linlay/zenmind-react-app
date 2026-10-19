import type { ChatConversationHistoryScope } from './types.ts';
export function normalizeChatConversationHistoryScope(
  scope?: Partial<ChatConversationHistoryScope> | null
): ChatConversationHistoryScope | null {
  const agentKey = String(scope?.agentKey || '').trim();
  return agentKey ? { agentKey } : null;
}
export function getChatConversationHistoryScopeKey(scope?: Partial<ChatConversationHistoryScope> | null): string {
  const normalized = normalizeChatConversationHistoryScope(scope);
  return normalized ? `agent:${normalized.agentKey}` : '';
}
