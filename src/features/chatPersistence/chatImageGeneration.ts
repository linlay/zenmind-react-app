import type { ChatTimelineLifecycle, ChatTimelineToolNode } from '../chatTimeline/types.ts';
import { getRemoteChatSourceId } from './chatSource.ts';

export type ChatImageSlotStatus =
  | 'preparing'
  | 'generation'
  | 'edit'
  | 'inpainting'
  | 'recovering'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'missing';
export type ChatImageSlot = {
  key: string;
  index: number;
  status: ChatImageSlotStatus;
  error: string;
  resourceUrl: string;
  name: string;
};
const MAX_JSON_CHARS = 64 * 1024;
function record(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    if (value.length > MAX_JSON_CHARS) return null;
    try {
      return record(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
function reason(value: unknown): string {
  const error = record(value);
  return (text(value) || text(error?.message) || text(error?.reason) || text(error?.code)).slice(0, 2000);
}

// Only the result's URL is a resource contract. Never infer a URL from path/relativePath/stdout.
export function resolveGeneratedImageResourceUrl(value: unknown, conversationId: string): string {
  const raw = text(value),
    chatId = getRemoteChatSourceId(conversationId);
  if (!raw || raw.length > 4096 || !chatId || /[\u0000-\u001f\u007f\\]/u.test(raw)) return '';
  const safeSegments = (path: string) =>
    path.split('/').every((segment) => {
      try {
        const decoded = decodeURIComponent(segment);
        return !!decoded && decoded !== '.' && decoded !== '..' && !/[\/\\\u0000-\u001f\u007f]/u.test(decoded);
      } catch {
        return false;
      }
    });
  if (chatId.includes('/') || !safeSegments(chatId)) return '';
  if (raw.startsWith('/api/resource?')) {
    const params = new URLSearchParams(raw.slice('/api/resource?'.length)),
      file = params.get('file') || '';
    if (!file.startsWith(`${chatId}/`) || !safeSegments(file)) return '';
    return `/api/resource?${new URLSearchParams({ file }).toString()}`;
  }
  if (raw.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(raw) || /[?#]/u.test(raw) || !safeSegments(raw)) return '';
  if (decodeURIComponent(raw.split('/')[0]) === chatId) return ''; // not the new chat-relative contract
  return `/api/resource?${new URLSearchParams({ file: `${chatId}/${raw}` }).toString()}`;
}

export function buildChatImageGenerationSlots(
  node: ChatTimelineToolNode,
  conversationId: string,
  runLifecycle?: ChatTimelineLifecycle
): ChatImageSlot[] {
  const args = record(node.argsText),
    result = record(node.resultText);
  const count = typeof args?.n === 'number' && Number.isInteger(args.n) && args.n >= 1 && args.n <= 4 ? args.n : 1;
  const operation =
    result?.operation === 'inpainting' || args?.mask
      ? 'inpainting'
      : result?.operation === 'edit' || (Array.isArray(args?.images) && args.images.length)
        ? 'edit'
        : 'generation';
  const images = new Map<number, Record<string, unknown>>();
  for (const [position, value] of (Array.isArray(result?.images) ? result.images.slice(0, 4) : []).entries()) {
    const image = record(value);
    const index = image?.index === undefined ? position : image.index;
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > 3 || images.has(index)) continue;
    images.set(index, image || {});
  }
  const fallbackError =
    text(result?.message).slice(0, 2000) || reason(result?.error) || text(node.errorDetail?.message).slice(0, 2000);
  const failed = node.lifecycle === 'error' || node.status === 'failed' || result?.ok === false;
  const cancelled = node.lifecycle === 'cancelled' || runLifecycle === 'cancelled';
  const active = runLifecycle === 'active' && node.lifecycle === 'active';
  return Array.from({ length: Math.max(count, ...[...images.keys()].map((index) => index + 1)) }, (_, index) => {
    const image = images.get(index),
      error = text(image?.message).slice(0, 2000) || reason(image?.error) || reason(image?.reason);
    const resourceUrl = image?.ok === false ? '' : resolveGeneratedImageResourceUrl(image?.url, conversationId);
    // A successful slot remains visible even if another slot or the run failed/cancelled.
    const status: ChatImageSlotStatus = resourceUrl
      ? 'success'
      : image?.ok === false || error || failed
        ? 'failed'
        : cancelled
          ? 'cancelled'
          : result || !active
            ? 'missing'
            : !node.streaming
              ? 'recovering'
              : args
                ? operation
                : 'preparing';
    return {
      key: `${conversationId}:${node.runId}:${node.toolId || node.id}:${index}`,
      index,
      status,
      error: status === 'failed' ? error || fallbackError : '',
      resourceUrl,
      name: text(image?.name) || `image-${index + 1}.png`
    };
  });
}
