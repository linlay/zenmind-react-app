import type { ConversationPreviewEvent, ConversationPreviewRequest } from './types';

export const CONVERSATION_PREVIEW_CHANNEL = 'zenmind-conversation-preview';
export const CONVERSATION_PREVIEW_MAX_SOURCE_BYTES = 256 * 1024;
export const CONVERSATION_PREVIEW_TIMEOUT_MS = 8_000;

export function createConversationPreviewRequestId(cacheKey: string, retryNonce: number): string {
  return `${cacheKey}:${retryNonce}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

export function getConversationPreviewSourceByteLength(source: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(source).byteLength;
  }
  let byteLength = 0;
  for (const character of source) {
    const codePoint = character.codePointAt(0) ?? 0;
    byteLength += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return byteLength;
}

export function serializeConversationPreviewRequest(request: ConversationPreviewRequest): string {
  return JSON.stringify({ channel: CONVERSATION_PREVIEW_CHANNEL, request });
}

export function parseConversationPreviewEvent(
  raw: unknown,
  expectedRequestId: string
): ConversationPreviewEvent | null {
  let candidate: unknown = raw;
  if (typeof raw === 'string') {
    try {
      candidate = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }
  const envelope = candidate as { channel?: unknown; event?: unknown };
  if (envelope.channel !== CONVERSATION_PREVIEW_CHANNEL || !envelope.event || typeof envelope.event !== 'object') {
    return null;
  }
  const event = envelope.event as { type?: unknown; requestId?: unknown; height?: unknown; message?: unknown };
  if (event.requestId !== expectedRequestId) {
    return null;
  }
  if (event.type === 'ready') {
    return { type: 'ready', requestId: expectedRequestId };
  }
  if (event.type === 'resize' && typeof event.height === 'number' && Number.isFinite(event.height)) {
    return { type: 'resize', requestId: expectedRequestId, height: event.height };
  }
  if (event.type === 'error' && typeof event.message === 'string') {
    return { type: 'error', requestId: expectedRequestId, message: event.message.slice(0, 2_000) };
  }
  return null;
}
