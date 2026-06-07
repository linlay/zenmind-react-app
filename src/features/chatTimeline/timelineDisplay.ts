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

function buildPendingDisplayEntries(
  visibleNodes: readonly ChatTimelineDisplayNode[]
): PendingDisplayEntry[] {
  const entries: PendingDisplayEntry[] = [];
  let pendingToolNodes: ChatTimelineToolNode[] = [];
  let previousNode: ChatTimelineDisplayNode | null = null;

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

function collectTimelineDisplayMetadata(
  entries: readonly PendingDisplayEntry[]
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
  repliesByRunId.forEach((reply) => {
    if (!reply.lastNodeId || reply.hasStreaming || reply.copyParts.length === 0) {
      return;
    }

    footersByNodeId.set(reply.lastNodeId, {
      copyText: reply.copyParts.join('\n\n'),
      timestamp: reply.updatedAt,
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

export function buildChatTimelineDisplayItems(state: ChatTimelineState): ChatTimelineDisplayItem[] {
  const visibleNodes = state.orderedNodeIds
    .map((id) => state.nodesById[id])
    .filter(isVisibleTimelineNode);
  const entries = buildPendingDisplayEntries(visibleNodes);
  const { assistantReplyFooters, runCounts } = collectTimelineDisplayMetadata(entries);
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

export function getChatTimelineDisplayItemType(item: ChatTimelineDisplayItem): string {
  return item.kind;
}
