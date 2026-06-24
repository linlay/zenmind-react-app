import type { KanbanIssue } from '../../core/api/services/kanbanApi';
import type { ChatDetailRouteParams } from '../chatPersistence/types';

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function issueTimestamp(issue: KanbanIssue): number {
  const parsed = Date.parse(readText(issue.updatedAt) || readText(issue.createdAt));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function buildKanbanChatDetailParams(issue: KanbanIssue, agentName: string): ChatDetailRouteParams | null {
  const conversationId = readText(issue.chatId);
  if (!conversationId) {
    return null;
  }
  const agentKey = readText(issue.assigneeAgentKey) || readText(issue.workerAgent);
  const title = readText(agentName) || agentKey;

  return {
    conversationId,
    conversationSubtitle: title,
    conversationTarget: {
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
