import type { ConversationPreviewKind, ConversationPreviewTheme } from './types';

const MAX_HEIGHT_CACHE_ENTRIES = 64;

const INITIAL_HEIGHT_BY_KIND: Record<ConversationPreviewKind, number> = {
  mermaid: 220,
  echarts: 320,
  html: 480
};

const HEIGHT_RANGE_BY_KIND: Record<ConversationPreviewKind, readonly [number, number]> = {
  mermaid: [160, 480],
  echarts: [240, 480],
  html: [240, 720]
};

const heightCache = new Map<string, number>();

export function createConversationPreviewHeightCacheKey(
  kind: ConversationPreviewKind,
  sourceHash: string,
  theme: ConversationPreviewTheme
): string {
  return `${kind}:${sourceHash}:${theme}`;
}

export function clampConversationPreviewHeight(kind: ConversationPreviewKind, height: number): number {
  const [minimum, maximum] = HEIGHT_RANGE_BY_KIND[kind];
  return Math.min(maximum, Math.max(minimum, Math.round(height)));
}

export function getConversationPreviewHeight(kind: ConversationPreviewKind, cacheKey: string): number {
  const cached = heightCache.get(cacheKey);
  if (cached === undefined) {
    return INITIAL_HEIGHT_BY_KIND[kind];
  }
  heightCache.delete(cacheKey);
  heightCache.set(cacheKey, cached);
  return cached;
}

export function setConversationPreviewHeight(kind: ConversationPreviewKind, cacheKey: string, height: number): number {
  const clamped = clampConversationPreviewHeight(kind, height);
  heightCache.delete(cacheKey);
  heightCache.set(cacheKey, clamped);
  while (heightCache.size > MAX_HEIGHT_CACHE_ENTRIES) {
    const oldest = heightCache.keys().next().value;
    if (!oldest) {
      break;
    }
    heightCache.delete(oldest);
  }
  return clamped;
}

export const conversationPreviewHeightCacheInternals = {
  clear: () => heightCache.clear(),
  size: () => heightCache.size
};
