import type { KanbanIssue } from '../../core/api/services/kanbanApi';
import type { ChatDetailRouteParams } from '../chatPersistence/types';
import {
  encodeChatSourceId,
  type ChatSource
} from '../chatPersistence/chatSource.ts';

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function issueTimestamp(issue: KanbanIssue): number {
  const parsed = Date.parse(readText(issue.updatedAt) || readText(issue.createdAt));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function buildKanbanChatDetailParams(
  issue: KanbanIssue,
  agentName: string,
  source: ChatSource
): ChatDetailRouteParams | null {
  const remoteConversationId = readText(issue.chatId);
  if (!remoteConversationId) {
    return null;
  }
  const conversationId = encodeChatSourceId(source, remoteConversationId);
  const remoteAgentKey = readText(issue.assigneeAgentKey) || readText(issue.workerAgent);
  const agentKey = encodeChatSourceId(source, remoteAgentKey);
  const title = readText(agentName) || remoteAgentKey;

  return {
    conversationId,
    conversationSubtitle: title,
    conversationTarget: {
      source,
      kind: 'agent',
      title,
      subtitle: readText(issue.title),
      agentKey: agentKey || null,
      teamId: null,
      agentMode: null,
      modelKey: null,
      reasoningEffort: null
    },
    historyScope: { agentKey: agentKey || null, teamId: null },
    initialConversation: {
      source,
      conversationId,
      title: readText(issue.title),
      lastMessageText: readText(issue.description),
      lastMessageAt: issueTimestamp(issue),
      unreadCount: 0,
      lastMessageStatus: 'sent',
      pinnedAt: 0
    }
  };
}
