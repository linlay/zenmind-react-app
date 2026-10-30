import {
  CONVERSATION_PREVIEW_MAX_SOURCE_BYTES,
  getConversationPreviewSourceByteLength
} from '../../../shared/components/conversationPreview/runtimeBridge.ts';
import type { ConversationMarkdownFenceExtension } from '../../../shared/markdown/previewSegments.ts';

export type ConversationViewFenceData = { index: number; key?: string; payload?: unknown; error?: string };
export const CONVERSATION_VIEW_FENCE_EXTENSION: ConversationMarkdownFenceExtension = {
  key: 'view',
  aliases: ['view'],
  requireLineEnd: true,
  matchOpeningLine: (line) => /^```view(?:[ \t]|$)/i.test(line),
  parse: ({ openingLine, source, index }) => {
    const fields = openingLine
      .slice(7)
      .trim()
      .split(/\s+/)
      .filter((field) => field.startsWith('key='));
    const key = fields.length === 1 ? fields[0].slice(4) : '';
    if (!/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/.test(key)) return { index, error: 'invalid_view' };
    const body = source.trim();
    try {
      if (getConversationPreviewSourceByteLength(body) > CONVERSATION_PREVIEW_MAX_SOURCE_BYTES || !/^[{[]/.test(body))
        throw new Error();
      const payload: unknown = JSON.parse(body);
      return { index, key, payload };
    } catch {
      return { index, key, error: 'view_data_invalid' };
    }
  }
};
export const CONVERSATION_VIEW_FENCE_EXTENSIONS = [CONVERSATION_VIEW_FENCE_EXTENSION] as const;
