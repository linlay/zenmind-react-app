import {
  isChatRequestMessageVariant,
  normalizeChatRequestMessageVariant
} from '../../core/api/services/chatEventProtocol.ts';
import type { ChatTimelineMessageVariant, ChatTimelineNode } from './types.ts';

export {
  isChatRequestMessageVariant as isChatTimelineCommandMessageVariant,
  normalizeChatRequestMessageVariant as normalizeChatTimelineRequestMessageVariant
};

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
