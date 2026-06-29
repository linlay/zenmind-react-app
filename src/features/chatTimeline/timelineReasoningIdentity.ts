import type { ChatTimelineNode, ChatTimelineState, ChatTimelineTextNode } from './types.ts';

const RUNLESS_REASONING_KEY = '__runless__';

function isReasoningNode(node: ChatTimelineNode | undefined): node is ChatTimelineTextNode {
  return node?.kind === 'reasoning';
}

function isActiveReasoningIdentityNode(node: ChatTimelineNode | undefined): node is ChatTimelineTextNode {
  return Boolean(
    node?.kind === 'reasoning' &&
      (node.lifecycle === 'active' || Boolean(node.streaming))
  );
}

function canUseReasoningIdentityNode(node: ChatTimelineNode | undefined): node is ChatTimelineTextNode {
  return Boolean(
    isReasoningNode(node) &&
      node.lifecycle !== 'cancelled' &&
      node.lifecycle !== 'error'
  );
}

function isReasoningContinuationBoundary(node: ChatTimelineNode | undefined): boolean {
  return Boolean(node && node.kind !== 'reasoning' && node.kind !== 'run');
}

export function activeReasoningRunKey(runId: string): string {
  return runId || RUNLESS_REASONING_KEY;
}

export function buildActiveReasoningNodeIdsByRun(
  orderedNodeIds: readonly string[],
  nodesById: Readonly<Record<string, ChatTimelineNode>>
): Record<string, string> {
  const activeReasoningNodeIdsByRun: Record<string, string> = {};
  const latestReasoningNodeIdsByRun: Record<string, string> = {};
  for (const nodeId of orderedNodeIds) {
    const node = nodesById[nodeId];
    const runKey = activeReasoningRunKey(node?.runId || '');
    if (isActiveReasoningIdentityNode(node)) {
      activeReasoningNodeIdsByRun[runKey] = nodeId;
      latestReasoningNodeIdsByRun[runKey] = nodeId;
      continue;
    }
    if (isReasoningNode(node)) {
      latestReasoningNodeIdsByRun[runKey] = nodeId;
      continue;
    }
    if (node?.kind === 'run' && node.lifecycle !== 'active') {
      delete activeReasoningNodeIdsByRun[runKey];
      delete latestReasoningNodeIdsByRun[runKey];
      continue;
    }
    if (isReasoningContinuationBoundary(node) && latestReasoningNodeIdsByRun[runKey]) {
      activeReasoningNodeIdsByRun[runKey] = latestReasoningNodeIdsByRun[runKey];
    }
  }
  return activeReasoningNodeIdsByRun;
}

export function getActiveReasoningNodeIdForRun(state: ChatTimelineState, runId: string): string {
  const nodeId = state.activeReasoningNodeIdsByRun?.[activeReasoningRunKey(runId)] || '';
  return isReasoningNode(state.nodesById[nodeId]) ? nodeId : '';
}

export function setActiveReasoningNodeIdForRun(
  state: ChatTimelineState,
  runId: string,
  nodeId: string
): ChatTimelineState {
  const key = activeReasoningRunKey(runId);
  let nextActiveReasoningNodeIdsByRun: Record<string, string> | null = null;

  Object.keys(state.activeReasoningNodeIdsByRun).forEach((activeKey) => {
    if (activeKey !== key && state.activeReasoningNodeIdsByRun[activeKey] === nodeId) {
      nextActiveReasoningNodeIdsByRun ??= { ...state.activeReasoningNodeIdsByRun };
      delete nextActiveReasoningNodeIdsByRun[activeKey];
    }
  });

  const activeReasoningNodeIdsByRun =
    nextActiveReasoningNodeIdsByRun ?? state.activeReasoningNodeIdsByRun;
  if (activeReasoningNodeIdsByRun[key] === nodeId && !nextActiveReasoningNodeIdsByRun) {
    return state;
  }

  nextActiveReasoningNodeIdsByRun ??= { ...state.activeReasoningNodeIdsByRun };
  nextActiveReasoningNodeIdsByRun[key] = nodeId;
  return {
    ...state,
    activeReasoningNodeIdsByRun: nextActiveReasoningNodeIdsByRun,
    revision: state.revision + 1,
  };
}

export function clearActiveReasoningNodeIdForRun(
  state: ChatTimelineState,
  runId: string
): ChatTimelineState {
  const key = activeReasoningRunKey(runId);
  const nodeId = state.activeReasoningNodeIdsByRun?.[key] || '';
  if (!nodeId) {
    return state;
  }

  const nextActiveReasoningNodeIdsByRun = { ...state.activeReasoningNodeIdsByRun };
  Object.keys(nextActiveReasoningNodeIdsByRun).forEach((activeKey) => {
    if (activeKey === key || nextActiveReasoningNodeIdsByRun[activeKey] === nodeId) {
      delete nextActiveReasoningNodeIdsByRun[activeKey];
    }
  });
  return {
    ...state,
    activeReasoningNodeIdsByRun: nextActiveReasoningNodeIdsByRun,
    revision: state.revision + 1,
  };
}

export function copyActiveReasoningNodeIdsByRun(
  target: Record<string, string>,
  source: Readonly<Record<string, string>> | null | undefined,
  nodesById: Readonly<Record<string, ChatTimelineNode>>
): void {
  if (!source) {
    return;
  }

  for (const runKey of Object.keys(source)) {
    const nodeId = source[runKey];
    if (nodeId && canUseReasoningIdentityNode(nodesById[nodeId])) {
      target[runKey] = nodeId;
    }
  }
}

export function copyPreservedReasoningNodeIdsByRun(
  target: Record<string, string>,
  source: Readonly<Record<string, string>> | null | undefined,
  sourceNodesById: Readonly<Record<string, ChatTimelineNode>>,
  nodesById: Readonly<Record<string, ChatTimelineNode>>
): void {
  if (!source) {
    return;
  }

  for (const runKey of Object.keys(source)) {
    const nodeId = source[runKey];
    const sourceNode = sourceNodesById[nodeId];
    if (canUseReasoningIdentityNode(sourceNode) && nodesById[nodeId] === sourceNode) {
      target[runKey] = nodeId;
    }
  }
}
