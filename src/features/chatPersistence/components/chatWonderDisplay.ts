import type { AgentWonderSuggestion } from '../../../core/api/services/chatApi';

export const CHAT_WONDER_VISIBLE_COUNT = 3;
const HASH_OFFSET = 2166136261;
const HASH_PRIME = 16777619;

function hashWonderKey(value: string, seed: number): number {
  let hash = (HASH_OFFSET ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), HASH_PRIME) >>> 0;
  }
  return hash;
}

export function pickChatWonderSuggestions(
  wonders: readonly AgentWonderSuggestion[],
  seed: number
): AgentWonderSuggestion[] {
  if (wonders.length <= CHAT_WONDER_VISIBLE_COUNT) {
    return [...wonders];
  }
  if (seed <= 0) {
    return wonders.slice(0, CHAT_WONDER_VISIBLE_COUNT);
  }

  return wonders
    .map((wonder, index) => ({
      index,
      score: hashWonderKey(`${wonder.id}:${wonder.text}:${index}`, seed),
      wonder,
    }))
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .slice(0, CHAT_WONDER_VISIBLE_COUNT)
    .map((item) => item.wonder);
}
