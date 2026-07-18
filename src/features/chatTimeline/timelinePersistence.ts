import type {
  ChatTimelineAwaitingNode,
  ChatTimelineNode,
  ChatTimelineState,
  ChatTimelineUsageSummary,
} from './types.ts';
import { buildActiveReasoningNodeIdsByRun } from './timelineReasoningIdentity.ts';
import { migratePersistedChatTimelineActionNode } from './timelineAction.ts';
import { migratePersistedChatTimelineContextCompactNode } from './timelineContextCompact.ts';
import { migratePersistedChatTimelinePlanNode } from './timelinePlan.ts';
import { migratePersistedChatTimelineTaskNode } from './timelineTask.ts';

export type SerializedTimelineMeta = {
  conversationId: string;
  activeRunId: string;
  awaitingId: string | null;
  usageLabel: string;
  updatedAt: number;
  revision: number;
  nextOrder: number;
};

export type SerializedTimelineNode = {
  conversationId: string;
  nodeId: string;
  kind: ChatTimelineNode['kind'];
  runId: string;
  orderIndex: number;
  createdAt: number;
  updatedAt: number;
  payloadHash: string;
  payloadJson: string;
};

export type SerializedTimelineState = {
  meta: SerializedTimelineMeta;
  nodes: SerializedTimelineNode[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
  if (!isRecord(value)) {
    if (Array.isArray(value)) {
      return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    return JSON.stringify(value) ?? 'null';
  }

  const body = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',');
  return `{${body}}`;
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isTimelineNode(value: unknown): value is ChatTimelineNode {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === 'string' &&
    typeof value.kind === 'string' &&
    typeof value.runId === 'string' &&
    Number.isFinite(Number(value.createdAt)) &&
    Number.isFinite(Number(value.updatedAt)) &&
    Number.isFinite(Number(value.order)) &&
    typeof value.lifecycle === 'string'
  );
}

function normalizePersistedUsageSummary(value: unknown): ChatTimelineUsageSummary | null {
  if (
    !isRecord(value) ||
    typeof value.label !== 'string' ||
    !isRecord(value.contextWindow) ||
    !isRecord(value.current) ||
    !isRecord(value.run) ||
    !isRecord(value.chat)
  ) {
    return null;
  }

  const summary = value as ChatTimelineUsageSummary;
  return {
    ...summary,
    modelKey: typeof value.modelKey === 'string' ? value.modelKey : '',
    compact: isRecord(value.compact) ? summary.compact : null,
    contextWindow: {
      ...summary.contextWindow,
      reasoningEffort:
        typeof value.contextWindow.reasoningEffort === 'string'
          ? value.contextWindow.reasoningEffort
          : ''
    }
  };
}

function readLatestUsageSummaryFromNodes(
  orderedNodeIds: readonly string[],
  nodesById: Readonly<Record<string, ChatTimelineNode>>
): ChatTimelineUsageSummary | null {
  for (let index = orderedNodeIds.length - 1; index >= 0; index -= 1) {
    const node = nodesById[orderedNodeIds[index]];
    if (node?.kind === 'usage' || node?.kind === 'context') {
      const usageSummary = normalizePersistedUsageSummary(node.usageSummary);
      if (usageSummary) {
        return usageSummary;
      }
    }
  }

  return null;
}

export function serializeChatTimelineState(state: ChatTimelineState): SerializedTimelineState {
  const conversationId = String(state.conversationId || '').trim();
  const nodes = state.orderedNodeIds
    .map((nodeId, orderIndex) => {
      const node = state.nodesById[nodeId];
      if (!node) {
        return null;
      }
      const payloadJson = stableStringify(node);
      return {
        conversationId,
        nodeId: node.id,
        kind: node.kind,
        runId: node.runId,
        orderIndex,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        payloadHash: hashText(payloadJson),
        payloadJson,
      };
    })
    .filter((node): node is SerializedTimelineNode => Boolean(node));

  return {
    meta: {
      conversationId,
      activeRunId: state.activeRunId,
      awaitingId: state.awaiting?.id ?? null,
      usageLabel: state.usageLabel,
      updatedAt: state.updatedAt,
      revision: state.revision,
      nextOrder: state.nextOrder,
    },
    nodes,
  };
}

export function deserializeChatTimelineState(
  meta: SerializedTimelineMeta,
  rows: readonly SerializedTimelineNode[]
): ChatTimelineState | null {
  const conversationId = String(meta.conversationId || '').trim();
  if (!conversationId) {
    return null;
  }

  const orderedRows = [...rows].sort((left, right) => left.orderIndex - right.orderIndex);
  const nodesById: Record<string, ChatTimelineNode> = {};
  const orderedNodeIds: string[] = [];
  const orderedNodeIdSet = new Set<string>();

  for (const row of orderedRows) {
    if (row.conversationId !== conversationId || !row.nodeId || !row.payloadJson) {
      return null;
    }
    if (row.payloadHash && hashText(row.payloadJson) !== row.payloadHash) {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(row.payloadJson);
    } catch {
      return null;
    }

    if (!isTimelineNode(parsed) || parsed.id !== row.nodeId || parsed.kind !== row.kind) {
      return null;
    }

    const node = migratePersistedChatTimelineContextCompactNode(
      migratePersistedChatTimelineActionNode(
        migratePersistedChatTimelineTaskNode(
          migratePersistedChatTimelinePlanNode(parsed, conversationId),
          conversationId
        ),
        conversationId
      ),
      conversationId
    );
    const current = nodesById[node.id];
    if (!current || node.updatedAt >= current.updatedAt) {
      nodesById[node.id] = node;
    }
    if (!orderedNodeIdSet.has(node.id)) {
      orderedNodeIdSet.add(node.id);
      orderedNodeIds.push(node.id);
    }
  }

  const awaitingNode =
    meta.awaitingId && nodesById[meta.awaitingId]?.kind === 'awaiting'
      ? (nodesById[meta.awaitingId] as ChatTimelineAwaitingNode)
      : null;
  const metaUsageLabel = String(meta.usageLabel || '');
  const updatedAt = toFiniteNumber(meta.updatedAt, 0);
  const usageSummary = readLatestUsageSummaryFromNodes(orderedNodeIds, nodesById);
  const usageLabel = metaUsageLabel || usageSummary?.label || '';

  return {
    conversationId,
    orderedNodeIds,
    nodesById,
    activeRunId: String(meta.activeRunId || ''),
    activeReasoningNodeIdsByRun: buildActiveReasoningNodeIdsByRun(orderedNodeIds, nodesById),
    awaiting: awaitingNode
      ? {
          id: awaitingNode.id,
          awaitingId: awaitingNode.awaitingId || awaitingNode.id,
          runId: awaitingNode.runId,
          createdAt: awaitingNode.createdAt,
          prompt: awaitingNode.prompt,
          answer: awaitingNode.answer,
          payloadText: awaitingNode.payloadText,
          mode: awaitingNode.mode,
          status: awaitingNode.status,
          interactive: awaitingNode.interactive ?? null,
          answerSummary: awaitingNode.answerSummary ?? null,
          updatedAt: awaitingNode.updatedAt,
        }
      : null,
    usageLabel,
    usageSummary,
    updatedAt,
    revision: toFiniteNumber(meta.revision, 0),
    nextOrder: toFiniteNumber(meta.nextOrder, orderedNodeIds.length),
  };
}

export const timelinePersistenceInternals = {
  hashText,
  stableStringify,
};
