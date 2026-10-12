import { createMessageAttachmentsFromReferences } from './chatAttachmentModels.ts';
import { getChatSourceFromId, getRemoteChatSourceId, parseChatSourceId } from './chatSource.ts';
import type { ChatAttachmentReference, ChatComposerAttachment, ChatContextReference } from './types.ts';

export function createChatContextAttachment(
  conversationId: string,
  reference: ChatContextReference
): ChatComposerAttachment {
  if (!reference.id.trim()) throw new Error('Context reference requires an ID');
  const [attachment] = createMessageAttachmentsFromReferences({
    conversationId,
    messageId: `${reference.type}:${reference.id}`,
    references: [reference],
    createdAt: Date.now()
  });
  return attachment;
}

export function assertChatReferenceScope(conversationId: string, references: readonly ChatAttachmentReference[]) {
  for (const reference of references) {
    if (reference.type === 'site')
      throw new Error('Site selection is unavailable on this device. Remove the Site reference before resending.');
    if (reference.type !== 'chat') continue;
    const source = parseChatSourceId(reference.id)?.source;
    if (source && source.key !== getChatSourceFromId(conversationId).key)
      throw new Error('Referenced chat belongs to another source. Remove it and select a chat from this source.');
    if (!reference.id || getRemoteChatSourceId(reference.id) === getRemoteChatSourceId(conversationId))
      throw new Error('A chat cannot reference itself. Remove it and choose another chat.');
  }
}

export type ChatReferenceOption = { id: string; name: string; meta?: Record<string, unknown> };
