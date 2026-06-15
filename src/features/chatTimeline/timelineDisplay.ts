import type {
  ChatTimelineAssistantReplyFooter,
  ChatTimelineDisplayItem,
  ChatTimelineDisplayItemKind,
  ChatTimelineMessageNode,
  ChatTimelineNode,
  ChatTimelineNodeDisplayItem,
  ChatTimelineState,
  ChatTimelineToolGroupDisplayItem,
  ChatTimelineToolNode,
} from './types.ts';

type ChatTimelineDisplayNode = ChatTimelineNode & {
  kind: Exclude<ChatTimelineNode['kind'], 'run' | 'usage'>;
};

function displayKindForNode(
  node: ChatTimelineDisplayNode
): Exclude<ChatTimelineDisplayItemKind, 'tool-group'> {
  if (node.kind === 'message') {
    if (node.role === 'user') {
      return 'user-query';
    }
    if (node.role === 'assistant') {
      return 'assistant-content';
    }
    return 'system-message';
  }
  return node.kind;
}

function runIdForNode(node: ChatTimelineDisplayNode): string {
  return node.runId || `standalone:${node.id}`;
}

function normalizeToolGroupValue(value: string): string {
  return String(value || '').trim();
}

function canMergeToolNode(
  pendingNodes: readonly ChatTimelineToolNode[],
  nextNode: ChatTimelineToolNode
): boolean {
  if (pendingNodes.length === 0) {
    return false;
  }

  const firstNode = pendingNodes[0];
  return (
    runIdForNode(firstNode) === runIdForNode(nextNode) &&
    normalizeToolGroupValue(firstNode.toolName) === normalizeToolGroupValue(nextNode.toolName) &&
    normalizeToolGroupValue(firstNode.toolLabel) === normalizeToolGroupValue(nextNode.toolLabel)
  );
}

function isVisibleTimelineNode(
  node: ChatTimelineNode | undefined
): node is ChatTimelineDisplayNode {
  if (!node) {
    return false;
  }
  if (node.kind === 'message') {
    return node.content.trim().length > 0 || node.role === 'user';
  }
  if (node.kind === 'run' || node.kind === 'usage') {
    return false;
  }
  if (node.kind === 'awaiting') {
    return Boolean(node.prompt || node.answer);
  }
  if (node.kind === 'tool') {
    return Boolean(node.title || node.body || node.argsText || node.resultText);
  }
  return Boolean(node.body || node.title);
}

type PendingDisplayEntry =
  | {
      kind: 'node';
      node: ChatTimelineDisplayNode;
    }
  | {
      kind: 'tool-group';
      nodes: ChatTimelineToolNode[];
    };

type AssistantReplyAccumulator = {
  copyParts: string[];
  errorReason: string | null;
  hasStreaming: boolean;
  lastNodeId: string;
  updatedAt: number;
};

type TimelineDisplayMetadata = {
  runCounts: Map<string, number>;
  assistantReplyFooters: Map<string, ChatTimelineAssistantReplyFooter>;
};

type ChangedRunDuration = {
  runId: string;
  durationMs: number | null;
};

type TimelineModelChange = {
  visibleNodeId: string;
  runDuration: ChangedRunDuration | null;
};

type TimelineDisplaySource = {
  visibleNodes: ChatTimelineDisplayNode[];
  runDurationsById: Map<string, number>;
};

export type ChatTimelineDisplayTailSignature = {
  key: string;
  contentLength: number;
  lifecycle: string;
  streaming: boolean;
  updatedAt: number;
};

export type ChatTimelineDisplayModel = {
  revision: number;
  orderedNodeIds: ChatTimelineState['orderedNodeIds'];
  nodesById: ChatTimelineState['nodesById'];
  items: ChatTimelineDisplayItem[];
  tailSignature: ChatTimelineDisplayTailSignature | null;
};

function shouldHideAwaitingAnswerRequestNode(
  node: ChatTimelineDisplayNode,
  previousNode: ChatTimelineDisplayNode | null
): boolean {
  return (
    node.kind === 'request' &&
    previousNode?.kind === 'awaiting' &&
    previousNode.status === 'answer' &&
    runIdForNode(node) === runIdForNode(previousNode)
  );
}

function shouldHideDuplicateReasoningNode(
  node: ChatTimelineDisplayNode,
  seenBodiesByRun: Map<string, Set<string>>
): boolean {
  if (node.kind !== 'reasoning') {
    return false;
  }
  const body = node.body.trim();
  if (!body) {
    return false;
  }

  const runId = runIdForNode(node);
  const seenBodies = seenBodiesByRun.get(runId);
  if (seenBodies?.has(body)) {
    return true;
  }
  if (seenBodies) {
    seenBodies.add(body);
  } else {
    seenBodiesByRun.set(runId, new Set([body]));
  }
  return false;
}

function buildPendingDisplayEntries(
  visibleNodes: readonly ChatTimelineDisplayNode[]
): PendingDisplayEntry[] {
  const entries: PendingDisplayEntry[] = [];
  let pendingToolNodes: ChatTimelineToolNode[] = [];
  let previousNode: ChatTimelineDisplayNode | null = null;
  const seenReasoningBodiesByRun = new Map<string, Set<string>>();

  const flushPendingTools = () => {
    if (pendingToolNodes.length === 0) {
      return;
    }

    if (pendingToolNodes.length === 1) {
      entries.push({ kind: 'node', node: pendingToolNodes[0] });
    } else {
      entries.push({ kind: 'tool-group', nodes: pendingToolNodes });
    }

    pendingToolNodes = [];
  };

  visibleNodes.forEach((node) => {
    if (shouldHideAwaitingAnswerRequestNode(node, previousNode)) {
      return;
    }

    if (shouldHideDuplicateReasoningNode(node, seenReasoningBodiesByRun)) {
      return;
    }

    if (node.kind !== 'tool') {
      flushPendingTools();
      entries.push({ kind: 'node', node });
      previousNode = node;
      return;
    }

    if (!canMergeToolNode(pendingToolNodes, node)) {
      flushPendingTools();
    }

    pendingToolNodes.push(node);
    previousNode = node;
  });

  flushPendingTools();
  return entries;
}

function runIdForEntry(entry: PendingDisplayEntry): string {
  const node = entry.kind === 'tool-group' ? entry.nodes[0] : entry.node;
  return runIdForNode(node);
}

function normalizeDurationMs(value: number | null | undefined): number | null {
  if (!Number.isFinite(value) || Number(value) < 0) {
    return null;
  }
  return Number(value);
}

function collectTimelineDisplaySource(state: ChatTimelineState): TimelineDisplaySource {
  const visibleNodes: ChatTimelineDisplayNode[] = [];
  const runDurationsById = new Map<string, number>();
  state.orderedNodeIds.forEach((nodeId) => {
    const node = state.nodesById[nodeId];

    if (!node) {
      return;
    }

    if (node.kind === 'run' && node.runId) {
      const durationMs = normalizeDurationMs(node.durationMs);
      if (durationMs !== null) {
        runDurationsById.set(node.runId, durationMs);
      }
    }

    if (isVisibleTimelineNode(node)) {
      visibleNodes.push(node);
    }
  });

  return {
    visibleNodes,
    runDurationsById,
  };
}

function getRunDurationMsById(state: ChatTimelineState, runId: string): number | null {
  if (!runId) {
    return null;
  }

  for (const nodeId of state.orderedNodeIds) {
    const node = state.nodesById[nodeId];
    if (node?.kind === 'run' && node.runId === runId) {
      return normalizeDurationMs(node.durationMs);
    }
  }

  return null;
}

function collectTimelineDisplayMetadata(
  entries: readonly PendingDisplayEntry[],
  runDurationsById: ReadonlyMap<string, number>
): TimelineDisplayMetadata {
  const runCounts = new Map<string, number>();
  const repliesByRunId = new Map<string, AssistantReplyAccumulator>();

  entries.forEach((entry) => {
    const runId = runIdForEntry(entry);
    runCounts.set(runId, (runCounts.get(runId) ?? 0) + 1);

    if (entry.kind !== 'node') {
      return;
    }
    const node = entry.node;
    if (node.kind !== 'message' || node.role !== 'assistant') {
      return;
    }

    const current = repliesByRunId.get(runId) ?? {
      copyParts: [],
      errorReason: null,
      hasStreaming: false,
      lastNodeId: '',
      updatedAt: 0,
    };
    if (node.content.trim()) {
      current.copyParts.push(node.content);
    }
    current.errorReason = node.errorReason || current.errorReason;
    current.hasStreaming = current.hasStreaming || node.streaming;
    current.lastNodeId = node.id;
    current.updatedAt = Math.max(current.updatedAt, node.updatedAt);
    repliesByRunId.set(runId, current);
  });

  const footersByNodeId = new Map<string, ChatTimelineAssistantReplyFooter>();
  repliesByRunId.forEach((reply, runId) => {
    if (!reply.lastNodeId || reply.hasStreaming || reply.copyParts.length === 0) {
      return;
    }

    footersByNodeId.set(reply.lastNodeId, {
      copyText: reply.copyParts.join('\n\n'),
      timestamp: reply.updatedAt,
      durationMs: runDurationsById.get(runId) ?? null,
      errorReason: reply.errorReason,
    });
  });

  return {
    runCounts,
    assistantReplyFooters: footersByNodeId,
  };
}

function buildNodeDisplayItem(
  node: ChatTimelineDisplayNode,
  groupIndex: number,
  groupCount: number,
  assistantReplyFooter: ChatTimelineAssistantReplyFooter | null = null
): ChatTimelineNodeDisplayItem {
  const kind = displayKindForNode(node);
  return {
    key: `${kind}:${node.id}`,
    kind,
    node,
    nodeId: node.id,
    runId: runIdForNode(node),
    isFirstInRun: groupIndex === 0,
    isLastInRun: groupIndex === groupCount - 1,
    groupIndex,
    assistantReplyFooter,
  };
}

function buildToolGroupDisplayItem(
  nodes: readonly ChatTimelineToolNode[],
  groupIndex: number,
  groupCount: number
): ChatTimelineToolGroupDisplayItem {
  const firstNode = nodes[0];
  return {
    key: `tool-group:${firstNode.id}`,
    kind: 'tool-group',
    node: firstNode,
    nodes: [...nodes],
    nodeId: firstNode.id,
    runId: runIdForNode(firstNode),
    isFirstInRun: groupIndex === 0,
    isLastInRun: groupIndex === groupCount - 1,
    groupIndex,
    toolName: firstNode.toolName,
    toolLabel: firstNode.toolLabel,
    count: nodes.length,
  };
}

function getTimelineNodeContentLength(node: ChatTimelineDisplayItem['node']): number {
  if (node.kind === 'message') {
    return (
      node.content.length + (node.attachments || []).reduce((total, attachment) => total + attachment.name.length, 0)
    );
  }
  if (node.kind === 'tool') {
    return node.title.length + node.body.length + node.argsText.length + node.resultText.length + node.status.length;
  }
  if (node.kind === 'awaiting') {
    return (
      node.prompt.length +
      node.payloadText.length +
      node.answer.length +
      (node.answerSummary?.title.length ?? 0) +
      (node.answerSummary?.copyText.length ?? 0)
    );
  }
  if (node.kind === 'run') {
    return node.title.length + node.body.length + node.status.length;
  }
  return node.title.length + node.body.length + node.status.length;
}

function getTimelineItemContentLength(item: ChatTimelineDisplayItem): number {
  if (item.kind === 'tool-group') {
    return item.nodes.reduce((total, node) => total + getTimelineNodeContentLength(node), 0);
  }
  return getTimelineNodeContentLength(item.node);
}

function buildTimelineTailSignature(
  items: readonly ChatTimelineDisplayItem[]
): ChatTimelineDisplayTailSignature | null {
  const tail = items[items.length - 1];
  if (!tail) {
    return null;
  }

  const node = tail.kind === 'tool-group' ? tail.nodes[tail.nodes.length - 1] : tail.node;
  return {
    key: tail.key,
    contentLength: getTimelineItemContentLength(tail),
    lifecycle: tail.kind === 'tool-group' ? tail.nodes.map((item) => item.lifecycle).join('|') : node.lifecycle,
    streaming:
      tail.kind === 'tool-group'
        ? tail.nodes.some((item) => item.streaming)
        : 'streaming' in node
          ? Boolean(node.streaming)
          : false,
    updatedAt: tail.kind === 'tool-group' ? Math.max(...tail.nodes.map((item) => item.updatedAt)) : node.updatedAt,
  };
}

function getChangedRunDuration(
  previousNode: ChatTimelineNode | undefined,
  nextNode: ChatTimelineNode | undefined
): ChangedRunDuration | null {
  if (previousNode?.kind !== 'run' || nextNode?.kind !== 'run' || previousNode.runId !== nextNode.runId) {
    return null;
  }
  const durationMs = normalizeDurationMs(nextNode.durationMs);
  if (!nextNode.runId || normalizeDurationMs(previousNode.durationMs) === durationMs) {
    return null;
  }
  return {
    runId: nextNode.runId,
    durationMs,
  };
}

function getTimelineModelChange(
  state: ChatTimelineState,
  previous: ChatTimelineDisplayModel
): TimelineModelChange | null {
  if (state.orderedNodeIds !== previous.orderedNodeIds) {
    return null;
  }

  let changedVisibleNodeId = '';
  let changedRunDuration: ChangedRunDuration | null = null;
  for (const nodeId of state.orderedNodeIds) {
    const previousNode = previous.nodesById[nodeId];
    const nextNode = state.nodesById[nodeId];
    if (previousNode === nextNode) {
      continue;
    }

    const previousVisible = isVisibleTimelineNode(previousNode);
    const nextVisible = isVisibleTimelineNode(nextNode);
    if (!previousVisible && !nextVisible) {
      const runDuration = getChangedRunDuration(previousNode, nextNode);
      if (runDuration) {
        if (changedRunDuration && changedRunDuration.runId !== runDuration.runId) {
          return null;
        }
        changedRunDuration = runDuration;
      }
      continue;
    }
    if (previousVisible !== nextVisible || changedVisibleNodeId) {
      return null;
    }
    changedVisibleNodeId = nodeId;
  }

  if (changedVisibleNodeId && changedRunDuration) {
    return null;
  }

  return {
    visibleNodeId: changedVisibleNodeId,
    runDuration: changedRunDuration,
  };
}

function buildAssistantReplyFooterForTail(
  items: readonly ChatTimelineDisplayItem[],
  tailItem: ChatTimelineDisplayItem,
  nextNode: ChatTimelineDisplayNode,
  getDurationMs: (runId: string) => number | null
): ChatTimelineAssistantReplyFooter | null {
  if (nextNode.kind !== 'message' || nextNode.role !== 'assistant') {
    return null;
  }

  const runId = runIdForNode(nextNode);
  const copyParts: string[] = [];
  let hasStreaming = false;
  let errorReason: string | null = null;
  let updatedAt = 0;

  for (const item of items) {
    if (item.kind !== 'assistant-content' || item.runId !== runId) {
      continue;
    }

    const node = item.key === tailItem.key ? nextNode : item.node;
    if (node.kind !== 'message' || node.role !== 'assistant') {
      continue;
    }
    if (node.content.trim()) {
      copyParts.push(node.content);
    }
    hasStreaming = hasStreaming || node.streaming;
    errorReason = node.errorReason || errorReason;
    updatedAt = Math.max(updatedAt, node.updatedAt);
  }

  if (hasStreaming || copyParts.length === 0) {
    return null;
  }

  return {
    copyText: copyParts.join('\n\n'),
    timestamp: updatedAt,
    durationMs: getDurationMs(runId),
    errorReason,
  };
}

function updateAssistantReplyFooterDuration(
  items: readonly ChatTimelineDisplayItem[],
  runId: string,
  durationMs: number | null
): ChatTimelineDisplayItem[] | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.kind !== 'assistant-content' || item.runId !== runId || !item.assistantReplyFooter) {
      continue;
    }
    if (item.assistantReplyFooter.durationMs === durationMs) {
      return null;
    }

    const nextItems = [...items];
    nextItems[index] = {
      ...item,
      assistantReplyFooter: {
        ...item.assistantReplyFooter,
        durationMs,
      },
    };
    return nextItems;
  }

  return null;
}

function updateTailDisplayModel(
  state: ChatTimelineState,
  previous: ChatTimelineDisplayModel
): ChatTimelineDisplayModel | null {
  const change = getTimelineModelChange(state, previous);
  if (!change) {
    return null;
  }
  if (!change.visibleNodeId) {
    const items = change.runDuration
      ? (updateAssistantReplyFooterDuration(
          previous.items,
          change.runDuration.runId,
          change.runDuration.durationMs
        ) ?? previous.items)
      : previous.items;
    return {
      ...previous,
      revision: state.revision,
      nodesById: state.nodesById,
      items,
    };
  }

  const previousTail = previous.items[previous.items.length - 1];
  if (!previousTail || previousTail.kind === 'tool-group' || previousTail.nodeId !== change.visibleNodeId) {
    return null;
  }

  const nextNode = state.nodesById[change.visibleNodeId];
  if (!isVisibleTimelineNode(nextNode)) {
    return null;
  }

  const nextKind = displayKindForNode(nextNode);
  if (nextKind !== previousTail.kind) {
    return null;
  }

  const nextTail = {
    ...previousTail,
    key: `${nextKind}:${nextNode.id}`,
    kind: nextKind,
    node: nextNode,
    nodeId: nextNode.id,
    runId: runIdForNode(nextNode),
    assistantReplyFooter: buildAssistantReplyFooterForTail(
      previous.items,
      previousTail,
      nextNode,
      (runId) => getRunDurationMsById(state, runId)
    ),
  } as ChatTimelineDisplayItem;
  const items = [...previous.items.slice(0, -1), nextTail];

  return {
    revision: state.revision,
    orderedNodeIds: state.orderedNodeIds,
    nodesById: state.nodesById,
    items,
    tailSignature: buildTimelineTailSignature(items),
  };
}

export function buildChatTimelineDisplayItems(state: ChatTimelineState): ChatTimelineDisplayItem[] {
  const { visibleNodes, runDurationsById } = collectTimelineDisplaySource(state);
  const entries = buildPendingDisplayEntries(visibleNodes);
  const { assistantReplyFooters, runCounts } = collectTimelineDisplayMetadata(entries, runDurationsById);
  const runIndexes = new Map<string, number>();

  return entries.map((entry) => {
    const runId = runIdForEntry(entry);
    const groupIndex = runIndexes.get(runId) ?? 0;
    const groupCount = runCounts.get(runId) ?? 1;
    runIndexes.set(runId, groupIndex + 1);

    return entry.kind === 'tool-group'
      ? buildToolGroupDisplayItem(entry.nodes, groupIndex, groupCount)
      : buildNodeDisplayItem(
          entry.node,
          groupIndex,
          groupCount,
          entry.node.kind === 'message'
            ? (assistantReplyFooters.get((entry.node as ChatTimelineMessageNode).id) ?? null)
            : null
        );
  });
}

export function buildChatTimelineDisplayModel(
  state: ChatTimelineState,
  previous?: ChatTimelineDisplayModel | null
): ChatTimelineDisplayModel {
  if (previous && previous.items.length > 0) {
    const updated = updateTailDisplayModel(state, previous);
    if (updated) {
      return updated;
    }
  }

  const items = buildChatTimelineDisplayItems(state);
  return {
    revision: state.revision,
    orderedNodeIds: state.orderedNodeIds,
    nodesById: state.nodesById,
    items,
    tailSignature: buildTimelineTailSignature(items),
  };
}

export function getChatTimelineDisplayItemType(item: ChatTimelineDisplayItem): string {
  return item.kind;
}
