import type { DirectoryConversationOpenResult } from './chatRepository';
import { createChatConversationTarget } from './chatConversationTarget.ts';
import type { ChatDetailRouteParams, ChatDirectoryItem } from './types';

function getChatDetailTargetParams(
  item: ChatDirectoryItem
): Pick<ChatDetailRouteParams, 'conversationSubtitle' | 'conversationTarget'> {
  const conversationTarget = createChatConversationTarget(item);

  return {
    conversationSubtitle: conversationTarget?.subtitle ?? item.subtitle,
    ...(conversationTarget ? { conversationTarget } : {}),
  };
}

export function buildChatDetailRouteParams(
  item: ChatDirectoryItem,
  result: DirectoryConversationOpenResult
): ChatDetailRouteParams {
  return {
    conversationId: result.conversation.conversationId,
    ...getChatDetailTargetParams(item),
    initialConversation: result.conversation,
    ...(result.historyScope ? { historyScope: result.historyScope } : {}),
    skipInitialReconcile: result.skipInitialReconcile,
  };
}

export function getAgentDetailPrewarmKeyForEmptyConversation(
  item: ChatDirectoryItem,
  result: DirectoryConversationOpenResult
): string | null {
  if (!result.skipInitialReconcile || String(result.conversation.lastMessageText || '').trim()) {
    return null;
  }

  return String(item.agentKey || result.historyScope?.agentKey || '').trim() || null;
}
