import type {
  ChatTimelineArtifactNode,
  ChatTimelineAssistantReplyFooterDisplayItem,
  ChatTimelineDisplayItem,
  ChatTimelineState
} from '../chatTimeline/index.ts';

type FramedChatTimelineDisplayItem = Exclude<ChatTimelineDisplayItem, ChatTimelineAssistantReplyFooterDisplayItem>;

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
  const mainItems = items.filter((item) => item.kind !== 'artifact');
  const runCounts = new Map<string, number>();

  mainItems.forEach((item) => {
    if (item.kind !== 'assistant-reply-footer') {
      runCounts.set(item.runId, (runCounts.get(item.runId) ?? 0) + 1);
    }
  });

  const runIndexes = new Map<string, number>();
  return mainItems.map((item) => {
    if (item.kind === 'assistant-reply-footer') {
      return item;
    }

    const groupIndex = runIndexes.get(item.runId) ?? 0;
    const groupCount = runCounts.get(item.runId) ?? 1;
    const isFirstInRun = groupIndex === 0;
    const isLastInRun = groupIndex === groupCount - 1;
    runIndexes.set(item.runId, groupIndex + 1);

    if (item.groupIndex === groupIndex && item.isFirstInRun === isFirstInRun && item.isLastInRun === isLastInRun) {
      return item;
    }

    return {
      ...item,
      groupIndex,
      isFirstInRun,
      isLastInRun
    } satisfies FramedChatTimelineDisplayItem;
  });
}
