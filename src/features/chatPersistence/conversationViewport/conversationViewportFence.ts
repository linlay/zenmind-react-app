import {
  CONVERSATION_PREVIEW_MAX_SOURCE_BYTES,
  getConversationPreviewSourceByteLength
} from '../../../shared/components/conversationPreview/runtimeBridge.ts';
import type { ConversationMarkdownFenceExtension } from '../../../shared/markdown/previewSegments.ts';

export type ConversationViewportFenceData = {
  viewportKey: string;
  payload: unknown;
};

function parseHeaderFields(header: string): Record<string, string> {
  const fields: Record<string, string> = {};
  header.split(',').forEach((part) => {
    const separator = part.indexOf('=');
    if (separator <= 0) {
      return;
    }
    const key = part.slice(0, separator).trim().toLowerCase();
    const value = part.slice(separator + 1).trim();
    if (key && value) {
      fields[key] = value;
    }
  });
  return fields;
}

export function parseConversationViewportFence(source: string): ConversationViewportFenceData | null {
  if (getConversationPreviewSourceByteLength(source) > CONVERSATION_PREVIEW_MAX_SOURCE_BYTES) {
    return null;
  }
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  const headerIndex = lines.findIndex((line) => line.trim().length > 0);
  if (headerIndex < 0) {
    return null;
  }
  const fields = parseHeaderFields(lines[headerIndex]!.trim());
  const viewportKey = fields.key || '';
  if (fields.type?.toLowerCase() !== 'html' || !viewportKey || viewportKey.length > 256) {
    return null;
  }

  const payloadRaw = lines.slice(headerIndex + 1).join('\n').trim();
  let payload: unknown = {};
  if (payloadRaw) {
    try {
      payload = JSON.parse(payloadRaw);
    } catch {
      payload = {};
    }
  }
  return { viewportKey, payload };
}

export function isConversationViewportFenceData(value: unknown): value is ConversationViewportFenceData {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as ConversationViewportFenceData).viewportKey === 'string'
  );
}

export const CONVERSATION_VIEWPORT_FENCE_EXTENSION: ConversationMarkdownFenceExtension = {
  key: 'viewport',
  aliases: ['viewport'],
  parse: ({ source }) => parseConversationViewportFence(source)
};

export const CONVERSATION_VIEWPORT_FENCE_EXTENSIONS = [CONVERSATION_VIEWPORT_FENCE_EXTENSION] as const;
