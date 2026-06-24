import type {
  ChatTimelineAssistantReplyFooter,
  ChatTimelineAwaitingNode,
  ChatTimelineDisplayItem,
  ChatTimelineDisplayItemKind,
  ChatTimelineMessageNode,
  ChatTimelineNode,
  ChatTimelineNodeDisplayItem,
  ChatTimelineState,
  ChatTimelineTextNode,
  ChatTimelineToolGroupDisplayItem,
  ChatTimelineToolNode,
} from './types.ts';
import { CHAT_TIMELINE_REASONING_PROCESS_TITLE } from './timelineConstants.ts';

type ChatTimelineDisplayTextNode = ChatTimelineTextNode & {
  kind: Exclude<ChatTimelineTextNode['kind'], 'usage'>;
};

type ChatTimelineDisplayNode =
  | ChatTimelineMessageNode
  | ChatTimelineDisplayTextNode
  | ChatTimelineToolNode
  | ChatTimelineAwaitingNode;

type ChatTimelineReasoningDisplayNode = ChatTimelineDisplayTextNode & {
  kind: 'reasoning';
};

function isTimelineDisplayNode(node: ChatTimelineNode | null | undefined): node is ChatTimelineDisplayNode {
  return Boolean(node && node.kind !== 'run' && node.kind !== 'usage');
}

function isReasoningDisplayNode(node: ChatTimelineNode | null | undefined): node is ChatTimelineReasoningDisplayNode {
  return isTimelineDisplayNode(node) && node.kind === 'reasoning';
}

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
  if (!isTimelineDisplayNode(node)) {
    return false;
  }
  if (node.kind === 'message') {
    return node.content.trim().length > 0 || node.role === 'user';
  }
  if (node.kind === 'awaiting') {
    return Boolean(node.prompt || node.answer);
  }
  if (node.kind === 'tool') {
    return Boolean(node.title || node.body || node.argsText || node.resultText);
  }
  if (node.kind === 'reasoning' && !node.body.trim() && isDefaultReasoningTitle(node.title)) {
    return isActiveTimelineDisplayNode(node);
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
  durationMs: number | null;
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

function isActiveTimelineDisplayNode(node: ChatTimelineDisplayNode): boolean {
  return node.lifecycle === 'active' || ('streaming' in node && Boolean(node.streaming));
}

function isDefaultReasoningTitle(title: string): boolean {
  return String(title || '').trim() === CHAT_TIMELINE_REASONING_PROCESS_TITLE;
}

function isReasoningStatusNode(node: ChatTimelineDisplayNode): boolean {
  if (node.kind !== 'reasoning') {
    return false;
  }

  const title = node.title.trim();
  const body = node.body.trim();
  return Boolean(title && !isDefaultReasoningTitle(title) && (!body || body === title));
}

function getReasoningStatusPair(
  node: ChatTimelineDisplayNode,
  statusNode: ChatTimelineDisplayNode | null | undefined
): { node: ChatTimelineReasoningDisplayNode; statusNode: ChatTimelineReasoningDisplayNode } | null {
  if (
    !isReasoningDisplayNode(node) ||
    !isReasoningDisplayNode(statusNode) ||
    runIdForNode(node) !== runIdForNode(statusNode) ||
    !isReasoningStatusNode(statusNode) ||
    !isActiveTimelineDisplayNode(statusNode) ||
    !isDefaultReasoningTitle(node.title)
  ) {
    return null;
  }

  return { node, statusNode };
}

function withReasoningStatusTitle(
  node: ChatTimelineDisplayNode,
  statusNode: ChatTimelineDisplayNode | null | undefined
): ChatTimelineDisplayNode {
  const pair = getReasoningStatusPair(node, statusNode);
  if (!pair) {
    return node;
  }

  return {
    ...pair.node,
    title: pair.statusNode.title,
    status: pair.statusNode.status || pair.node.status,
    streaming: pair.node.streaming || pair.statusNode.streaming,
    lifecycle: 'active',
    updatedAt: Math.max(pair.node.updatedAt, pair.statusNode.updatedAt),
  };
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
  const pendingReasoningStatusNodes = new Map<string, ChatTimelineDisplayNode>();

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

  const pushNodeEntry = (node: ChatTimelineDisplayNode) => {
    entries.push({ kind: 'node', node });
    previousNode = node;
  };

  const flushPendingReasoningStatusNodes = () => {
    if (pendingReasoningStatusNodes.size === 0) {
      return;
    }

    flushPendingTools();
    for (const node of pendingReasoningStatusNodes.values()) {
      pushNodeEntry(node);
    }
    pendingReasoningStatusNodes.clear();
  };

  const applyReasoningStatusToPreviousEntry = (statusNode: ChatTimelineDisplayNode): boolean => {
    const lastEntry = entries[entries.length - 1];
    if (!lastEntry || lastEntry.kind !== 'node') {
      return false;
    }

    const node = withReasoningStatusTitle(lastEntry.node, statusNode);
    if (node === lastEntry.node) {
      return false;
    }

    entries[entries.length - 1] = { kind: 'node', node };
    if (previousNode?.id === lastEntry.node.id) {
      previousNode = node;
    }
    return true;
  };

  for (const node of visibleNodes) {
    if (node.kind !== 'reasoning') {
      flushPendingReasoningStatusNodes();
    }

    if (shouldHideAwaitingAnswerRequestNode(node, previousNode)) {
      continue;
    }

    if (isReasoningStatusNode(node)) {
      flushPendingTools();
      if (!applyReasoningStatusToPreviousEntry(node)) {
        pendingReasoningStatusNodes.set(runIdForNode(node), node);
      }
      continue;
    }

    const pendingReasoningStatusNode =
      node.kind === 'reasoning' ? pendingReasoningStatusNodes.get(runIdForNode(node)) : null;
    if (pendingReasoningStatusNode) {
      pendingReasoningStatusNodes.delete(runIdForNode(node));
    }
    const displayNode = withReasoningStatusTitle(node, pendingReasoningStatusNode);

    if (shouldHideDuplicateReasoningNode(displayNode, seenReasoningBodiesByRun)) {
      continue;
    }

    if (displayNode.kind !== 'tool') {
      flushPendingTools();
      pushNodeEntry(displayNode);
      continue;
    }

    if (!canMergeToolNode(pendingToolNodes, displayNode)) {
      flushPendingTools();
    }

    pendingToolNodes.push(displayNode);
    previousNode = displayNode;
  }

  flushPendingReasoningStatusNodes();
  flushPendingTools();
  return entries;
}

function runIdForEntry(entry: PendingDisplayEntry): string {
  const node = entry.kind === 'tool-group' ? entry.nodes[0] : entry.node;
  return runIdForNode(node);
}

function isUserQueryEntry(entry: PendingDisplayEntry): boolean {
  return entry.kind === 'node' && entry.node.kind === 'message' && entry.node.role === 'user';
}

function assistantMessageForEntry(entry: PendingDisplayEntry): ChatTimelineMessageNode | null {
  if (entry.kind !== 'node' || entry.node.kind !== 'message' || entry.node.role !== 'assistant') {
    return null;
  }
  return entry.node;
}

function isActiveRuntimeNode(node: ChatTimelineNode | undefined): boolean {
  return (
    isTimelineDisplayNode(node) &&
    node.kind !== 'message' &&
    isActiveTimelineDisplayNode(node)
  );
}

function hasActiveRuntimeNode(item: PendingDisplayEntry | ChatTimelineDisplayItem): boolean {
  return item.kind === 'tool-group'
    ? item.nodes.some((node) => isActiveRuntimeNode(node))
    : isActiveRuntimeNode(item.node);
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

function resolveTailDisplayNode(
  previousTail: ChatTimelineDisplayItem,
  node: ChatTimelineDisplayNode
): ChatTimelineDisplayNode {
  if (
    node.kind !== 'reasoning' ||
    previousTail.kind !== 'reasoning' ||
    !isReasoningDisplayNode(previousTail.node) ||
    runIdForNode(node) !== runIdForNode(previousTail.node) ||
    !isActiveTimelineDisplayNode(previousTail.node) ||
    !isDefaultReasoningTitle(node.title) ||
    isDefaultReasoningTitle(previousTail.node.title)
  ) {
    return node;
  }

  return {
    ...node,
    title: previousTail.node.title,
    status: previousTail.node.status || node.status,
    streaming: node.streaming || previousTail.node.streaming,
    lifecycle: 'active',
    updatedAt: Math.max(node.updatedAt, previousTail.node.updatedAt),
  };
}

function createAssistantReplyAccumulator(): AssistantReplyAccumulator {
  return {
    copyParts: [],
    durationMs: null,
    errorReason: null,
    hasStreaming: false,
    lastNodeId: '',
    updatedAt: 0,
  };
}

function addAssistantReplyNode(
  reply: AssistantReplyAccumulator,
  node: ChatTimelineMessageNode,
  runDurationsById: ReadonlyMap<string, number>
) {
  if (node.content.trim()) {
    reply.copyParts.push(node.content);
  }
  reply.durationMs = runDurationsById.get(runIdForNode(node)) ?? null;
  reply.errorReason = node.errorReason || reply.errorReason;
  reply.hasStreaming = reply.hasStreaming || node.streaming;
  reply.lastNodeId = node.id;
  reply.updatedAt = Math.max(reply.updatedAt, node.updatedAt);
}

function buildAssistantReplyFooter(
  reply: AssistantReplyAccumulator
): ChatTimelineAssistantReplyFooter | null {
  if (!reply.lastNodeId || reply.hasStreaming || reply.copyParts.length === 0) {
    return null;
  }

  return {
    copyText: reply.copyParts.join('\n\n'),
    timestamp: reply.updatedAt,
    durationMs: reply.durationMs,
    errorReason: reply.errorReason,
  };
}

function collectTimelineDisplayMetadata(
  entries: readonly PendingDisplayEntry[],
  runDurationsById: ReadonlyMap<string, number>
): TimelineDisplayMetadata {
  const runCounts = new Map<string, number>();
  const assistantReplyFooters = new Map<string, ChatTimelineAssistantReplyFooter>();
  let reply = createAssistantReplyAccumulator();

  const flushReply = () => {
    const footer = buildAssistantReplyFooter(reply);
    if (footer) {
      assistantReplyFooters.set(reply.lastNodeId, footer);
    }
    reply = createAssistantReplyAccumulator();
  };

  entries.forEach((entry) => {
    const runId = runIdForEntry(entry);
    runCounts.set(runId, (runCounts.get(runId) ?? 0) + 1);

    if (isUserQueryEntry(entry)) {
      flushReply();
      return;
    }

    const node = assistantMessageForEntry(entry);
    if (!node) {
      if (hasActiveRuntimeNode(entry)) {
        reply.hasStreaming = true;
      }
      return;
    }

    addAssistantReplyNode(reply, node, runDurationsById);
  });

  flushReply();

  return {
    runCounts,
    assistantReplyFooters,
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

function isUserQueryDisplayItem(item: ChatTimelineDisplayItem): boolean {
  return item.kind === 'user-query';
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

function didRuntimeActivityChange(
  previousNode: ChatTimelineDisplayNode | undefined,
  nextNode: ChatTimelineDisplayNode
): boolean {
  if (!previousNode || nextNode.kind === 'message') {
    return false;
  }
  return isActiveTimelineDisplayNode(previousNode) !== isActiveTimelineDisplayNode(nextNode);
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
  if (nextNode.streaming) {
    return null;
  }

  const copyParts: string[] = [];
  let hasStreaming = false;
  let errorReason: string | null = null;
  const durationMs = getDurationMs(runIdForNode(nextNode));
  let updatedAt = 0;

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (isUserQueryDisplayItem(item)) {
      break;
    }
    if (item.kind !== 'assistant-content') {
      if (hasActiveRuntimeNode(item)) {
        hasStreaming = true;
      }
      continue;
    }

    const node = item.key === tailItem.key ? nextNode : item.node;
    if (node.kind !== 'message' || node.role !== 'assistant') {
      continue;
    }

    if (node.content.trim()) {
      copyParts.unshift(node.content);
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
    durationMs,
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
    if (
      item.kind !== 'assistant-content' ||
      item.runId !== runId ||
      !item.assistantReplyFooter
    ) {
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

  const previousNode = previous.nodesById[change.visibleNodeId];
  if (
    isVisibleTimelineNode(previousNode) &&
    didRuntimeActivityChange(previousNode, nextNode)
  ) {
    return null;
  }

  const nextDisplayNode = resolveTailDisplayNode(previousTail, nextNode);
  const nextKind = displayKindForNode(nextDisplayNode);
  if (nextKind !== previousTail.kind) {
    return null;
  }

  const nextTail = {
    ...previousTail,
    key: `${nextKind}:${nextDisplayNode.id}`,
    kind: nextKind,
    node: nextDisplayNode,
    nodeId: nextDisplayNode.id,
    runId: runIdForNode(nextDisplayNode),
    assistantReplyFooter: buildAssistantReplyFooterForTail(
      previous.items,
      previousTail,
      nextDisplayNode,
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
