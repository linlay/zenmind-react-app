import { createMessageAttachmentsFromReferences } from './chatAttachmentModels.ts';
import type { ChatComposerAttachment, ChatAttachmentReference } from './types.ts';

export const MAX_SELECTED_TEXT_CHARACTERS = 50_000;
export const MAX_SELECTION_ANNOTATION_CHARACTERS = 10_000;

export function readSelectedRange(text: string, start: number, end: number): string | null {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > text.length)
    return null;
  if (end - start > MAX_SELECTED_TEXT_CHARACTERS) return null;
  // Never silently include unselected characters or send half of an emoji.
  const splitsPair = (offset: number) =>
    offset > 0 &&
    offset < text.length &&
    /[\uD800-\uDBFF]/.test(text[offset - 1]) &&
    /[\uDC00-\uDFFF]/.test(text[offset]);
  if (splitsPair(start) || splitsPair(end)) return null;
  const selected = text.slice(start, end);
  return selected.trim() ? selected : null;
}

export function createChatSelectionAttachment(input: {
  conversationId: string;
  text: string;
  annotation: string;
  annotationIndex: number;
  sourceKind: 'message' | 'code';
}): ChatComposerAttachment {
  if (
    !input.text.trim() ||
    input.text.length > MAX_SELECTED_TEXT_CHARACTERS ||
    input.annotation.length > MAX_SELECTION_ANNOTATION_CHARACTERS ||
    !Number.isSafeInteger(input.annotationIndex) ||
    input.annotationIndex < 1
  )
    throw new Error('Invalid selected text reference');
  const reference: ChatAttachmentReference = {
    id: `selection-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    type: 'selection',
    text: input.text,
    annotationIndex: input.annotationIndex,
    ...(input.annotation.trim() ? { annotation: input.annotation } : {}),
    meta: { sourceKind: input.sourceKind }
  };
  const createdAt = Date.now();
  const [attachment] = createMessageAttachmentsFromReferences({
    conversationId: input.conversationId,
    messageId: reference.id!,
    references: [reference],
    createdAt
  });
  return attachment;
}
