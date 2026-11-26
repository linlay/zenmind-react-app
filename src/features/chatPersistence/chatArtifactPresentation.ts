import { reframeChatTimelineItems } from '../chatTimeline/timelinePresentation.ts';
import type {
  ChatTimelineArtifactNode,
  ChatTimelineDisplayItem,
  ChatTimelineState
} from '../chatTimeline/index.ts';

export function selectChatTimelineArtifacts(state: ChatTimelineState): ChatTimelineArtifactNode[] {
  const artifacts: ChatTimelineArtifactNode[] = [];

  state.orderedNodeIds.forEach((nodeId) => {
    const node = state.nodesById[nodeId];
    if (node?.kind === 'artifact') {
      artifacts.push(node);
    }
  });

  return artifacts;
}

export function buildChatTimelineMainDisplayItems(
  items: readonly ChatTimelineDisplayItem[]
): ChatTimelineDisplayItem[] {
  return reframeChatTimelineItems(items.filter((item) => item.kind !== 'artifact'));
}
