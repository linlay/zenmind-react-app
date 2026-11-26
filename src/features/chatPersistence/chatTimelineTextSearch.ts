import type { ChatTimelineMessageNode, ChatTimelineState } from '../chatTimeline/types.ts';
import { parseConversationMarkdownSegments } from '../../shared/markdown/previewSegments.ts';
import { CONVERSATION_VIEW_FENCE_EXTENSIONS } from './conversationViewport/conversationViewportFence.ts';

export const MAX_CHAT_SEARCH_MATCHES = 1000;
export type ChatTextSearchMatch = {
  nodeId: string;
  ordinal: number;
  start: number;
  end: number;
  before: string;
  text: string;
  after: string;
};
export type ChatTextSearchResult = { query: string; matches: ChatTextSearchMatch[]; total: number };
export function chatSearchMatchKey(match: Pick<ChatTextSearchMatch, 'nodeId' | 'ordinal'>): string {
  return JSON.stringify([match.nodeId, match.ordinal]);
}

/** The same source text feeds copy and search; rendered VIEW metadata is excluded. */
export function getChatTimelineMessageTextSource(node: Pick<ChatTimelineMessageNode, 'role' | 'content'>): string {
  if (node.role !== 'assistant') return node.content;
  return parseConversationMarkdownSegments(node.content, { extensions: CONVERSATION_VIEW_FENCE_EXTENSIONS })
    .filter((segment) => segment.type !== 'extension')
    .map((segment) => (segment.type === 'markdown' ? segment.markdown : segment.source))
    .join('\n');
}

/** Page-local, allocated while search is open and cleared on close/source change. No DB/full-history index. */
export function createChatTimelineTextSearch() {
  const cache = new Map<
    string,
    { source: string; text: string; query: string; total: number; matches: ChatTextSearchMatch[] }
  >();
  let conversationId = '';
  return {
    clear() {
      cache.clear();
      conversationId = '';
    },
    search(state: ChatTimelineState, query: string): ChatTextSearchResult {
      if (conversationId !== state.conversationId) {
        cache.clear();
        conversationId = state.conversationId;
      }
      const needle = query.trim(),
        matches: ChatTextSearchMatch[] = [];
      const pattern = needle ? new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu') : null;
      let total = 0;
      if (!needle) return { query: needle, matches, total };
      const retained = new Set<string>();
      for (const nodeId of state.orderedNodeIds) {
        const node = state.nodesById[nodeId];
        if (node?.kind !== 'message' || !['user', 'assistant'].includes(node.role)) continue;
        retained.add(nodeId);
        let entry = cache.get(nodeId);
        if (!entry || entry.source !== node.content) {
          // Search message body/Markdown source, excluding hidden VIEW/viewport protocol payloads.
          const text = getChatTimelineMessageTextSource(node);
          entry = { source: node.content, text, query: '', total: 0, matches: [] };
          cache.set(nodeId, entry);
        }
        const budget = MAX_CHAT_SEARCH_MATCHES - matches.length;
        if (entry.query !== needle || entry.matches.length < Math.min(budget, entry.total)) {
          pattern!.lastIndex = 0;
          let hit = pattern!.exec(entry.text),
            ordinal = 0;
          const nodeMatches: ChatTextSearchMatch[] = [];
          while (hit) {
            const position = hit.index;
            ordinal++;
            if (nodeMatches.length < budget)
              nodeMatches.push({
                nodeId,
                ordinal,
                start: position,
                end: position + needle.length,
                before: entry.text.slice(Math.max(0, position - 40), position),
                text: entry.text.slice(position, position + needle.length),
                after: entry.text.slice(position + needle.length, position + needle.length + 60)
              });
            hit = pattern!.exec(entry.text);
          }
          entry.query = needle;
          entry.total = ordinal;
          entry.matches = nodeMatches;
        } else if (entry.matches.length > budget) entry.matches = entry.matches.slice(0, budget);
        total += entry.total;
        matches.push(...entry.matches);
      }
      for (const id of cache.keys()) if (!retained.has(id)) cache.delete(id);
      return { query: needle, matches, total };
    }
  };
}
