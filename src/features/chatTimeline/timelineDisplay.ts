import type {
  ChatTimelineAssistantReplyFooter,
  ChatTimelineAssistantReplyFooterDisplayItem,
  ChatTimelineActionNode,
  ChatTimelineArtifactNode,
  ChatTimelineAwaitingNode,
  ChatTimelineContextCompactNode,
  ChatTimelineDisplayItem,
  ChatTimelineDisplayItemKind,
  ChatTimelineMessageNode,
  ChatTimelineNode,
  ChatTimelineNodeDisplayItem,
  ChatTimelinePlanDisplayItem,
  ChatTimelinePlanNode,
  ChatTimelineState,
  ChatTimelineSourceNode,
  ChatTimelineTaskDisplayItem,
  ChatTimelineTaskNode,
  ChatTimelineTextNode,
  ChatTimelineToolGroupDisplayItem,
  ChatTimelineToolNode,
} from './types.ts';
import { getChatTimelineArtifactContentLength } from './timelineArtifact.ts';
import { getChatTimelineActionContentLength } from './timelineAction.ts';
import { getChatTimelineContextCompactContentLength } from './timelineContextCompact.ts';
import { getChatTimelineErrorDetailSignature } from './timelinePlatformError.ts';
import { getChatTimelinePlanContentLength } from './timelinePlan.ts';
import { isChatTimelineCommandMessageVariant } from './timelineRequest.ts';
import { getChatTimelineSourceContentLength } from './timelineSource.ts';
import { getChatTimelineTaskContentLength } from './timelineTask.ts';

type ChatTimelineDisplayTextNode = ChatTimelineTextNode & {
  kind: Exclude<ChatTimelineTextNode['kind'], 'usage'>;
};

type ChatTimelineDisplayNode =
  | ChatTimelineMessageNode
  | ChatTimelineDisplayTextNode
  | ChatTimelineContextCompactNode
  | ChatTimelineActionNode
  | ChatTimelineArtifactNode
  | ChatTimelinePlanNode
  | ChatTimelineTaskNode
  | ChatTimelineToolNode
  | ChatTimelineSourceNode
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

function isActivePlanAwaitingNode(node: ChatTimelineDisplayNode): boolean {
  return node.kind === 'awaiting' && node.status === 'ask' && node.interactive?.kind === 'plan';
}

function displayKindForNode(
  node: ChatTimelineDisplayNode
): Exclude<ChatTimelineDisplayItemKind, 'tool-group' | 'assistant-reply-footer'> {
  if (node.kind === 'message') {
    if (node.role === 'user') {
      return isChatTimelineCommandMessageVariant(node.messageVariant)
        ? 'request'
        : 'user-query';
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
    return (
      node.content.trim().length > 0 ||
      node.role === 'user' ||
      Boolean(node.errorDetail)
    );
  }
  if (node.kind === 'awaiting') {
    if (isActivePlanAwaitingNode(node)) {
      return false;
    }
    return Boolean(node.prompt || node.payloadText || node.answer || node.interactive);
  }
  if (node.kind === 'tool') {
    return Boolean(node.title || node.body || node.argsText || node.resultText);
  }
  if (node.kind === 'source') {
    return true;
  }
  if (node.kind === 'artifact') {
    return true;
  }
  if (node.kind === 'plan') {
    return true;
  }
  if (node.kind === 'task') {
    return true;
  }
  if (node.kind === 'action') {
    return true;
  }
  if (node.kind === 'context') {
    return true;
  }
  if (node.kind === 'reasoning' && !node.body.trim() && isDefaultReasoningNode(node)) {
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
    }
  | {
      kind: 'task-group';
      nodes: ChatTimelineTaskNode[];
    };

type AssistantReplyAccumulator = {
  copyParts: string[];
  durationMs: number | null;
  errorReason: string | null;
  hasActiveWork: boolean;
  keySeed: string;
  runId: string;
  updatedAt: number;
};

type TimelineDisplayMetadata = {
  runCounts: Map<string, number>;
};

type HiddenRunChange = {
  runId: string;
};

type TimelineModelChange = {
  visibleNodeId: string;
  hiddenRunChange: HiddenRunChange | null;
};

type TimelineRunDisplayState = {
  durationMs: number | null;
  active: boolean;
};

type TimelineDisplaySource = {
  visibleNodes: ChatTimelineDisplayNode[];
  runStatesById: Map<string, TimelineRunDisplayState>;
  tasksByPlanNodeId: Map<string, ChatTimelineTaskNode[]>;
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

function isDefaultReasoningNode(node: ChatTimelineDisplayNode): boolean {
  return node.kind === 'reasoning' && !String(node.title || '').trim();
}

function isReasoningStatusNode(node: ChatTimelineDisplayNode): boolean {
  if (node.kind !== 'reasoning') {
    return false;
  }

  const title = node.title.trim();
  const body = node.body.trim();
  return Boolean(title && !isDefaultReasoningNode(node) && (!body || body === title));
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
    !isActiveTimelineDisplayNode(node) ||
    !isDefaultReasoningNode(node)
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
  const taskGroupsByKey = new Map<string, ChatTimelineTaskNode[]>();

  const taskGroupKey = (node: ChatTimelineTaskNode) =>
    JSON.stringify([
      runIdForNode(node),
      node.planId,
      node.parentTaskId,
      node.taskGroupId || node.taskId,
    ]);
  visibleNodes.forEach((node) => {
    if (node.kind !== 'task') {
      return;
    }
    const key = taskGroupKey(node);
    const group = taskGroupsByKey.get(key);
    if (group) {
      group.push(node);
    } else {
      taskGroupsByKey.set(key, [node]);
    }
  });

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

    if (displayNode.kind === 'task') {
      flushPendingTools();
      const group = taskGroupsByKey.get(taskGroupKey(displayNode)) ?? [displayNode];
      if (group[0]?.id === displayNode.id) {
        entries.push({ kind: 'task-group', nodes: group });
      }
      previousNode = displayNode;
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
  const node = entry.kind === 'node' ? entry.node : entry.nodes[0];
  return runIdForNode(node);
}

function isUserQueryEntry(entry: PendingDisplayEntry): boolean {
  return (
    entry.kind === 'node' &&
    entry.node.kind === 'message' &&
    entry.node.role === 'user' &&
    !isChatTimelineCommandMessageVariant(entry.node.messageVariant)
  );
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

function hasActiveRuntimeNode(item: PendingDisplayEntry): boolean {
  return item.kind !== 'node'
    ? item.nodes.some((node) => isActiveRuntimeNode(node))
    : isActiveRuntimeNode(item.node);
}

function normalizeDurationMs(value: number | null | undefined): number | null {
  if (!Number.isFinite(value) || Number(value) < 0) {
    return null;
  }
  return Number(value);
}

function resolveTaskPlanNode(
  task: ChatTimelineTaskNode,
  plansById: ReadonlyMap<string, ChatTimelinePlanNode>,
  plansByRunId: ReadonlyMap<string, readonly ChatTimelinePlanNode[]>,
  tasksById: ReadonlyMap<string, ChatTimelineTaskNode>,
  visited = new Set<string>()
): ChatTimelinePlanNode | null {
  if (visited.has(task.taskId)) {
    return null;
  }
  visited.add(task.taskId);

  if (task.planId) {
    const explicit = plansById.get(task.planId);
    if (explicit) {
      return explicit;
    }
  }

  if (task.parentTaskId) {
    const parent = tasksById.get(task.parentTaskId);
    if (parent) {
      const parentPlan = resolveTaskPlanNode(
        parent,
        plansById,
        plansByRunId,
        tasksById,
        visited
      );
      if (parentPlan) {
        return parentPlan;
      }
    }
  }

  const runPlans = task.runId ? plansByRunId.get(task.runId) ?? [] : [];
  return runPlans.length === 1 ? runPlans[0] : null;
}

function collectTimelineDisplaySource(state: ChatTimelineState): TimelineDisplaySource {
  const visibleNodes: ChatTimelineDisplayNode[] = [];
  const runStatesById = new Map<string, TimelineRunDisplayState>();
  const plans: ChatTimelinePlanNode[] = [];
  const tasks: ChatTimelineTaskNode[] = [];
  state.orderedNodeIds.forEach((nodeId) => {
    const node = state.nodesById[nodeId];
    if (node?.kind === 'plan') {
      plans.push(node);
    } else if (node?.kind === 'task') {
      tasks.push(node);
    }
  });
  const tasksById = new Map(tasks.map((task) => [task.taskId, task]));
  const plansById = new Map(plans.map((plan) => [plan.planId, plan]));
  const plansByRunId = new Map<string, ChatTimelinePlanNode[]>();
  plans.forEach((plan) => {
    if (!plan.runId) {
      return;
    }
    const runPlans = plansByRunId.get(plan.runId);
    if (runPlans) {
      runPlans.push(plan);
    } else {
      plansByRunId.set(plan.runId, [plan]);
    }
  });
  const tasksByPlanNodeId = new Map<string, ChatTimelineTaskNode[]>();
  const associatedTaskNodeIds = new Set<string>();
  tasks.forEach((task) => {
    const plan = resolveTaskPlanNode(task, plansById, plansByRunId, tasksById);
    if (!plan) {
      return;
    }
    const planTasks = tasksByPlanNodeId.get(plan.id);
    if (planTasks) {
      planTasks.push(task);
    } else {
      tasksByPlanNodeId.set(plan.id, [task]);
    }
    associatedTaskNodeIds.add(task.id);
  });

  state.orderedNodeIds.forEach((nodeId) => {
    const node = state.nodesById[nodeId];

    if (!node) {
      return;
    }

    if (node.kind === 'run' && node.runId) {
      runStatesById.set(node.runId, {
        durationMs: normalizeDurationMs(node.durationMs),
        active: node.lifecycle === 'active',
      });
    }

    if (isVisibleTimelineNode(node) && !associatedTaskNodeIds.has(node.id)) {
      visibleNodes.push(node);
    }
  });

  if (state.activeRunId) {
    const current = runStatesById.get(state.activeRunId);
    runStatesById.set(state.activeRunId, {
      durationMs: current?.durationMs ?? null,
      active: true,
    });
  }

  return {
    visibleNodes,
    runStatesById,
    tasksByPlanNodeId,
  };
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
    !isActiveTimelineDisplayNode(node) ||
    !isDefaultReasoningNode(node) ||
    isDefaultReasoningNode(previousTail.node)
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
    hasActiveWork: false,
    keySeed: '',
    runId: '',
    updatedAt: 0,
  };
}

function isRunActive(
  runStatesById: ReadonlyMap<string, TimelineRunDisplayState>,
  runId: string
): boolean {
  return Boolean(runId && runStatesById.get(runId)?.active);
}

function addAssistantReplyNode(
  reply: AssistantReplyAccumulator,
  node: ChatTimelineMessageNode,
  runStatesById: ReadonlyMap<string, TimelineRunDisplayState>
) {
  const runId = runIdForNode(node);
  if (node.content.trim()) {
    reply.copyParts.push(node.content);
    reply.keySeed = node.id;
  }
  reply.runId = runId;
  reply.durationMs = runStatesById.get(runId)?.durationMs ?? null;
  reply.errorReason = node.errorReason || reply.errorReason;
  reply.hasActiveWork = reply.hasActiveWork || node.streaming || isRunActive(runStatesById, runId);
  reply.updatedAt = Math.max(reply.updatedAt, node.updatedAt);
}

function addAssistantReplyRuntimeEntry(
  reply: AssistantReplyAccumulator,
  entry: PendingDisplayEntry,
  runStatesById: ReadonlyMap<string, TimelineRunDisplayState>
) {
  const runId = runIdForEntry(entry);
  if (!reply.runId) {
    reply.runId = runId;
  }
  reply.hasActiveWork = reply.hasActiveWork || hasActiveRuntimeNode(entry) || isRunActive(runStatesById, runId);
}

function buildAssistantReplyFooter(
  reply: AssistantReplyAccumulator
): ChatTimelineAssistantReplyFooter | null {
  if (reply.hasActiveWork || reply.copyParts.length === 0) {
    return null;
  }

  return {
    copyText: reply.copyParts.join('\n\n'),
    timestamp: reply.updatedAt,
    durationMs: reply.durationMs,
    errorReason: reply.errorReason,
  };
}

function buildAssistantReplyFooterDisplayItem(
  reply: AssistantReplyAccumulator,
  footer: ChatTimelineAssistantReplyFooter
): ChatTimelineAssistantReplyFooterDisplayItem {
  return {
    key: `assistant-reply-footer:${reply.keySeed || reply.runId || 'standalone'}:${footer.timestamp}`,
    kind: 'assistant-reply-footer',
    runId: reply.runId,
    footer,
  };
}

function collectTimelineDisplayMetadata(
  entries: readonly PendingDisplayEntry[]
): TimelineDisplayMetadata {
  const runCounts = new Map<string, number>();

  entries.forEach((entry) => {
    const runId = runIdForEntry(entry);
    runCounts.set(runId, (runCounts.get(runId) ?? 0) + 1);
  });

  return {
    runCounts,
  };
}

function buildNodeDisplayItem(
  node: ChatTimelineDisplayNode,
  groupIndex: number,
  groupCount: number,
  tasksByPlanNodeId: ReadonlyMap<string, ChatTimelineTaskNode[]>
): ChatTimelineNodeDisplayItem | ChatTimelinePlanDisplayItem {
  const kind = displayKindForNode(node);
  const item = {
    key: `${kind}:${node.id}`,
    kind,
    node,
    nodeId: node.id,
    runId: runIdForNode(node),
    isFirstInRun: groupIndex === 0,
    isLastInRun: groupIndex === groupCount - 1,
    groupIndex,
  };
  if (node.kind === 'plan') {
    return {
      ...item,
      kind: 'plan',
      node,
      tasks: [...(tasksByPlanNodeId.get(node.id) ?? [])],
    };
  }
  if (node.kind === 'task') {
    throw new Error('task nodes must be emitted through task display groups');
  }
  return item as ChatTimelineNodeDisplayItem;
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

function buildTaskDisplayItem(
  nodes: readonly ChatTimelineTaskNode[],
  groupIndex: number,
  groupCount: number
): ChatTimelineTaskDisplayItem {
  const firstNode = nodes[0];
  return {
    key: `task-group:${firstNode.id}`,
    kind: 'task',
    node: firstNode,
    nodes: [...nodes],
    nodeId: firstNode.id,
    runId: runIdForNode(firstNode),
    isFirstInRun: groupIndex === 0,
    isLastInRun: groupIndex === groupCount - 1,
    groupIndex,
  };
}

function getTimelineNodeContentLength(node: ChatTimelineNode): number {
  if (node.kind === 'message') {
    return (
      node.content.length +
      getChatTimelineErrorDetailSignature(node.errorDetail).length +
      (node.attachments || []).reduce((total, attachment) => total + attachment.name.length, 0)
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
  if (node.kind === 'source') {
    return getChatTimelineSourceContentLength(node);
  }
  if (node.kind === 'artifact') {
    return getChatTimelineArtifactContentLength(node);
  }
  if (node.kind === 'plan') {
    return getChatTimelinePlanContentLength(node);
  }
  if (node.kind === 'task') {
    return getChatTimelineTaskContentLength(node);
  }
  if (node.kind === 'action') {
    return getChatTimelineActionContentLength(node);
  }
  if (node.kind === 'context') {
    return getChatTimelineContextCompactContentLength(node);
  }
  return node.title.length + node.body.length + node.status.length;
}

function getTimelineItemContentLength(item: ChatTimelineDisplayItem): number {
  if (item.kind === 'assistant-reply-footer') {
    return (
      item.footer.copyText.length +
      String(item.footer.timestamp).length +
      String(item.footer.durationMs ?? '').length +
      String(item.footer.errorReason || '').length
    );
  }
  if (item.kind === 'tool-group') {
    return item.nodes.reduce((total, node) => total + getTimelineNodeContentLength(node), 0);
  }
  if (item.kind === 'task') {
    return item.nodes.reduce((total, node) => total + getTimelineNodeContentLength(node), 0);
  }
  if (item.kind === 'plan') {
    return (
      getTimelineNodeContentLength(item.node) +
      item.tasks.reduce((total, task) => total + getTimelineNodeContentLength(task), 0)
    );
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

  if (tail.kind === 'assistant-reply-footer') {
    return {
      key: tail.key,
      contentLength: getTimelineItemContentLength(tail),
      lifecycle: 'complete',
      streaming: false,
      updatedAt: tail.footer.timestamp,
    };
  }

  const groupedNodes =
    tail.kind === 'tool-group' || tail.kind === 'task' ? tail.nodes : null;
  const node = groupedNodes ? groupedNodes[groupedNodes.length - 1] : tail.node;
  const planTasks = tail.kind === 'plan' ? tail.tasks : null;
  return {
    key: tail.key,
    contentLength: getTimelineItemContentLength(tail),
    lifecycle: groupedNodes
      ? groupedNodes.map((item) => item.lifecycle).join('|')
      : planTasks && planTasks.length > 0
        ? [node.lifecycle, ...planTasks.map((task) => task.lifecycle)].join('|')
      : node.lifecycle,
    streaming:
      tail.kind === 'tool-group'
        ? tail.nodes.some((item) => item.streaming)
        : 'streaming' in node
          ? Boolean(node.streaming)
          : false,
    updatedAt: groupedNodes
      ? Math.max(...groupedNodes.map((item) => item.updatedAt))
      : planTasks && planTasks.length > 0
        ? Math.max(node.updatedAt, ...planTasks.map((task) => task.updatedAt))
      : node.updatedAt,
  };
}

function getHiddenRunChange(
  previousNode: ChatTimelineNode | undefined,
  nextNode: ChatTimelineNode | undefined
): HiddenRunChange | null {
  if (previousNode?.kind !== 'run' || nextNode?.kind !== 'run' || previousNode.runId !== nextNode.runId) {
    return null;
  }
  if (
    !nextNode.runId ||
    (previousNode.lifecycle === nextNode.lifecycle &&
      normalizeDurationMs(previousNode.durationMs) === normalizeDurationMs(nextNode.durationMs))
  ) {
    return null;
  }
  return {
    runId: nextNode.runId,
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
  let hiddenRunChange: HiddenRunChange | null = null;
  for (const nodeId of state.orderedNodeIds) {
    const previousNode = previous.nodesById[nodeId];
    const nextNode = state.nodesById[nodeId];
    if (previousNode === nextNode) {
      continue;
    }

    const previousVisible = isVisibleTimelineNode(previousNode);
    const nextVisible = isVisibleTimelineNode(nextNode);
    if (!previousVisible && !nextVisible) {
      const runChange = getHiddenRunChange(previousNode, nextNode);
      if (runChange) {
        if (hiddenRunChange && hiddenRunChange.runId !== runChange.runId) {
          return null;
        }
        hiddenRunChange = runChange;
      }
      continue;
    }
    if (previousVisible !== nextVisible || changedVisibleNodeId) {
      return null;
    }
    changedVisibleNodeId = nodeId;
  }

  if (changedVisibleNodeId && hiddenRunChange) {
    return null;
  }

  return {
    visibleNodeId: changedVisibleNodeId,
    hiddenRunChange,
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

function didAssistantMessageStreamingComplete(
  previousNode: ChatTimelineDisplayNode | undefined,
  nextNode: ChatTimelineDisplayNode
): boolean {
  return (
    previousNode?.kind === 'message' &&
    previousNode.role === 'assistant' &&
    nextNode.kind === 'message' &&
    nextNode.role === 'assistant' &&
    previousNode.streaming &&
    !nextNode.streaming
  );
}

function isPatchableStructuredNode(node: ChatTimelineDisplayNode): boolean {
  return (
    node.kind === 'source' ||
    node.kind === 'artifact' ||
    node.kind === 'plan' ||
    node.kind === 'context'
  );
}

function patchStructuredDisplayItem(
  state: ChatTimelineState,
  previous: ChatTimelineDisplayModel,
  nodeId: string
): ChatTimelineDisplayModel | null {
  const previousNode = previous.nodesById[nodeId];
  const nextNode = state.nodesById[nodeId];
  if (
    !isTimelineDisplayNode(previousNode) ||
    !isTimelineDisplayNode(nextNode) ||
    !isPatchableStructuredNode(previousNode) ||
    previousNode.kind !== nextNode.kind ||
    runIdForNode(previousNode) !== runIdForNode(nextNode) ||
    (nextNode.kind !== 'context' && didRuntimeActivityChange(previousNode, nextNode))
  ) {
    return null;
  }

  const itemIndex = previous.items.findIndex(
    (item) => item.kind !== 'tool-group' && item.kind !== 'assistant-reply-footer' && item.nodeId === nodeId
  );
  const previousItem = previous.items[itemIndex];
  if (
    itemIndex < 0 ||
    !previousItem ||
    previousItem.kind === 'tool-group' ||
    previousItem.kind === 'assistant-reply-footer'
  ) {
    return null;
  }

  const nextKind = displayKindForNode(nextNode);
  if (nextKind !== previousItem.kind) {
    return null;
  }
  const nextItem = {
    ...previousItem,
    node: nextNode,
    runId: runIdForNode(nextNode),
  } as ChatTimelineDisplayItem;
  const items = [...previous.items];
  items[itemIndex] = nextItem;
  return {
    revision: state.revision,
    orderedNodeIds: state.orderedNodeIds,
    nodesById: state.nodesById,
    items,
    tailSignature:
      itemIndex === items.length - 1 ? buildTimelineTailSignature(items) : previous.tailSignature,
  };
}

function updateIncrementalDisplayModel(
  state: ChatTimelineState,
  previous: ChatTimelineDisplayModel
): ChatTimelineDisplayModel | null {
  const change = getTimelineModelChange(state, previous);
  if (!change) {
    return null;
  }
  if (!change.visibleNodeId) {
    if (change.hiddenRunChange) {
      return null;
    }
    return {
      ...previous,
      revision: state.revision,
      nodesById: state.nodesById,
    };
  }

  const structuredUpdate = patchStructuredDisplayItem(
    state,
    previous,
    change.visibleNodeId
  );
  if (structuredUpdate) {
    return structuredUpdate;
  }

  const previousTail = previous.items[previous.items.length - 1];
  if (
    !previousTail ||
    previousTail.kind === 'tool-group' ||
    previousTail.kind === 'task' ||
    previousTail.kind === 'assistant-reply-footer' ||
    previousTail.nodeId !== change.visibleNodeId
  ) {
    return null;
  }

  const nextNode = state.nodesById[change.visibleNodeId];
  if (!isVisibleTimelineNode(nextNode)) {
    return null;
  }

  const previousNode = previous.nodesById[change.visibleNodeId];
  if (
    isVisibleTimelineNode(previousNode) &&
    (didRuntimeActivityChange(previousNode, nextNode) ||
      didAssistantMessageStreamingComplete(previousNode, nextNode))
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
  const { visibleNodes, runStatesById, tasksByPlanNodeId } =
    collectTimelineDisplaySource(state);
  const entries = buildPendingDisplayEntries(visibleNodes);
  const { runCounts } = collectTimelineDisplayMetadata(entries);
  const runIndexes = new Map<string, number>();
  const items: ChatTimelineDisplayItem[] = [];
  let reply = createAssistantReplyAccumulator();

  const flushReply = () => {
    const footer = buildAssistantReplyFooter(reply);
    if (footer) {
      items.push(buildAssistantReplyFooterDisplayItem(reply, footer));
    }
    reply = createAssistantReplyAccumulator();
  };

  entries.forEach((entry) => {
    const runId = runIdForEntry(entry);
    const groupIndex = runIndexes.get(runId) ?? 0;
    const groupCount = runCounts.get(runId) ?? 1;
    runIndexes.set(runId, groupIndex + 1);

    const isUserQuery = isUserQueryEntry(entry);

    if (isUserQuery) {
      flushReply();
    }

    items.push(
      entry.kind === 'tool-group'
        ? buildToolGroupDisplayItem(entry.nodes, groupIndex, groupCount)
        : entry.kind === 'task-group'
          ? buildTaskDisplayItem(entry.nodes, groupIndex, groupCount)
          : buildNodeDisplayItem(
              entry.node,
              groupIndex,
              groupCount,
              tasksByPlanNodeId
            )
    );

    const node = assistantMessageForEntry(entry);
    if (node) {
      addAssistantReplyNode(reply, node, runStatesById);
    } else if (!isUserQuery) {
      addAssistantReplyRuntimeEntry(reply, entry, runStatesById);
    }
  });

  flushReply();
  return items;
}

function sameNodeReferences(
  left: readonly ChatTimelineNode[],
  right: readonly ChatTimelineNode[]
): boolean {
  return (
    left.length === right.length && left.every((node, index) => node === right[index])
  );
}

function hasSameDisplayFrame(
  left: Exclude<ChatTimelineDisplayItem, ChatTimelineAssistantReplyFooterDisplayItem>,
  right: Exclude<ChatTimelineDisplayItem, ChatTimelineAssistantReplyFooterDisplayItem>
): boolean {
  return (
    left.node === right.node &&
    left.nodeId === right.nodeId &&
    left.runId === right.runId &&
    left.isFirstInRun === right.isFirstInRun &&
    left.isLastInRun === right.isLastInRun &&
    left.groupIndex === right.groupIndex
  );
}

function canReuseDisplayItem(
  previous: ChatTimelineDisplayItem,
  next: ChatTimelineDisplayItem
): boolean {
  if (previous.key !== next.key || previous.kind !== next.kind) {
    return false;
  }
  if (previous.kind === 'assistant-reply-footer') {
    return (
      next.kind === 'assistant-reply-footer' &&
      previous.runId === next.runId &&
      previous.footer.copyText === next.footer.copyText &&
      previous.footer.timestamp === next.footer.timestamp &&
      previous.footer.durationMs === next.footer.durationMs &&
      previous.footer.errorReason === next.footer.errorReason
    );
  }
  if (next.kind === 'assistant-reply-footer' || !hasSameDisplayFrame(previous, next)) {
    return false;
  }
  if (previous.kind === 'tool-group') {
    return (
      next.kind === 'tool-group' &&
      previous.toolName === next.toolName &&
      previous.toolLabel === next.toolLabel &&
      previous.count === next.count &&
      sameNodeReferences(previous.nodes, next.nodes)
    );
  }
  if (previous.kind === 'task') {
    return next.kind === 'task' && sameNodeReferences(previous.nodes, next.nodes);
  }
  if (previous.kind === 'plan') {
    return next.kind === 'plan' && sameNodeReferences(previous.tasks, next.tasks);
  }
  return true;
}

function reuseStableDisplayItems(
  items: ChatTimelineDisplayItem[],
  previous: ChatTimelineDisplayModel | null | undefined
): ChatTimelineDisplayItem[] {
  if (!previous || previous.items.length === 0) {
    return items;
  }
  const previousByKey = new Map(previous.items.map((item) => [item.key, item]));
  return items.map((item) => {
    const candidate = previousByKey.get(item.key);
    return candidate && canReuseDisplayItem(candidate, item) ? candidate : item;
  });
}

export function buildChatTimelineDisplayModel(
  state: ChatTimelineState,
  previous?: ChatTimelineDisplayModel | null
): ChatTimelineDisplayModel {
  if (previous && previous.items.length > 0) {
    const updated = updateIncrementalDisplayModel(state, previous);
    if (updated) {
      return updated;
    }
  }

  const items = reuseStableDisplayItems(buildChatTimelineDisplayItems(state), previous);
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
