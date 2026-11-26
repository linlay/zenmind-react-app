import {
  isChatRequestMessageVariant,
  normalizeChatRequestMessageVariant
} from '../../core/api/services/chatEventProtocol.ts';
import { getRemoteChatSourceId } from '../chatPersistence/chatSource.ts';
import type { ChatTimelineMessageNode, ChatTimelineMessageVariant, ChatTimelineNode } from './types.ts';

export {
  isChatRequestMessageVariant as isChatTimelineCommandMessageVariant,
  normalizeChatRequestMessageVariant as normalizeChatTimelineRequestMessageVariant
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function classifyChatRequestInput(
  event: Record<string, unknown>,
  receiverAgentKey = ''
): ChatTimelineMessageNode['inputSource'] {
  const origin = event.origin && typeof event.origin === 'object' ? (event.origin as Record<string, unknown>) : {};
  const type = text(origin.type) || (event.role === 'automation' ? 'automation' : '');
  if (event.type !== 'request.steer' && event.hidden === true &&
      (type !== 'automation' || (event.lane && event.lane !== 'main'))) {
    return { kind: 'hidden' };
  }
  if (type === 'automation') return { kind: 'automation', sender: text(origin.automationName) };

  const mailKind = event.mailOrigin !== 'user' && text(event.mailId) ? text(event.mailKind) : '';
  const sender = getRemoteChatSourceId(text(origin.agentKey));
  if (mailKind === 'ask') return { kind: 'ask', sender };
  if (!type || type === 'user') return undefined;

  const receiver = getRemoteChatSourceId(text(event.agentKey) || receiverAgentKey);
  if (['reply', 'notify'].includes(mailKind) && (!sender || !receiver || sender === receiver)) {
    return { kind: 'hidden' };
  }
  return { kind: 'agent', sender };
}

export function normalizeChatTimelineMessageVariant(value: unknown): ChatTimelineMessageVariant {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized === 'default') {
    return 'default';
  }
  return isChatRequestMessageVariant(normalized) ? normalized : 'default';
}

export function migratePersistedChatTimelineMessageNode(node: ChatTimelineNode): ChatTimelineNode {
  if (node.kind !== 'message') {
    return node;
  }

  const messageVariant = normalizeChatTimelineMessageVariant(node.messageVariant);
  return node.messageVariant === messageVariant ? node : { ...node, messageVariant };
}
