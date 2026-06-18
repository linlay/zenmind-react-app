import type { AgentWonderSuggestion } from '../../../core/api/services/chatApi';

export type ChatWonderGridConfig = {
  columnCount: 2 | 3;
  visibleCount: 3 | 4;
};

const CHAT_WONDER_THREE_COLUMN_MIN_WIDTH = 390;
const HASH_OFFSET = 2166136261;
const HASH_PRIME = 16777619;

export function resolveChatWonderGridConfig(width: number): ChatWonderGridConfig {
  return width >= CHAT_WONDER_THREE_COLUMN_MIN_WIDTH
    ? { columnCount: 3, visibleCount: 3 }
    : { columnCount: 2, visibleCount: 4 };
}

function hashWonderKey(value: string, seed: number): number {
  let hash = (HASH_OFFSET ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), HASH_PRIME) >>> 0;
  }
  return hash;
}

export function pickChatWonderSuggestions(
  wonders: readonly AgentWonderSuggestion[],
  visibleCount: number,
  seed: number
): AgentWonderSuggestion[] {
  const count = Math.max(0, Math.trunc(visibleCount));
  if (count <= 0) {
    return [];
  }
  if (wonders.length <= count) {
    return [...wonders];
  }
  if (seed <= 0) {
    return wonders.slice(0, count);
  }

  return wonders
    .map((wonder, index) => ({
      index,
      score: hashWonderKey(`${wonder.id}:${wonder.text}:${index}`, seed),
      wonder,
    }))
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .slice(0, count)
    .map((item) => item.wonder);
}
