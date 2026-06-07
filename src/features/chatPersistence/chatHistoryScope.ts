import type { ChatConversationHistoryScope } from './types.ts';

function normalizeScopeKey(value: unknown): string | null {
  const normalized = String(value || '').trim();
  return normalized ? normalized : null;
}

export function normalizeChatConversationHistoryScope(
  scope?: Partial<ChatConversationHistoryScope> | null
): ChatConversationHistoryScope | null {
  const teamId = normalizeScopeKey(scope?.teamId);
  if (teamId) {
    return {
      agentKey: null,
      teamId,
    };
  }

  const agentKey = normalizeScopeKey(scope?.agentKey);
  if (agentKey) {
    return {
      agentKey,
      teamId: null,
    };
  }

  return null;
}

export function getChatConversationHistoryScopeKey(
  scope?: Partial<ChatConversationHistoryScope> | null
): string {
  const normalized = normalizeChatConversationHistoryScope(scope);
  if (!normalized) {
    return '';
  }

  return normalized.teamId ? `team:${normalized.teamId}` : `agent:${normalized.agentKey || ''}`;
}
