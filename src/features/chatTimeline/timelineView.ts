import { readChatViewReference, type ChatViewReference } from '../../core/api/services/chatViewProtocol.ts';

export type ChatTimelineViewBinding = { index: number; view?: ChatViewReference; viewError?: string };

export function readTimelineViewBindings(values: unknown[]): Record<number, ChatTimelineViewBinding> {
  const result: Record<number, ChatTimelineViewBinding> = {};
  for (const value of values) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const item = value as Record<string, unknown>;
    if (typeof item.index !== 'number' || !Number.isInteger(item.index) || item.index < 0) continue;
    const view = readChatViewReference(item.view);
    const viewError =
      typeof item.viewError === 'string'
        ? item.viewError
        : item.view !== undefined && !view
          ? 'invalid_view'
          : undefined;
    if (view || viewError)
      result[item.index] = { index: item.index, ...(view ? { view } : {}), ...(viewError ? { viewError } : {}) };
  }
  return result;
}
