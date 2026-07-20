import { normalizeProtocolTimestampMs, toText } from '../../core/api/services/chatEventProtocol.ts';
import { getChatTimelinePlanLifecycle, parseChatTimelinePlanStatus } from './timelinePlan.ts';
import type {
  ChatTimelineLifecycle,
  ChatTimelineNode,
  ChatTimelinePlanStep,
  ChatTimelineTaskNode,
  ChatTimelineTaskStatus,
} from './types.ts';

export type ChatTimelineTaskViewItem = {
  taskId: string;
  taskName: string;
  status: ChatTimelineTaskStatus;
  parentTaskId: string;
  parentTaskName: string;
  taskGroupId: string;
  agentKey: string;
  subAgentKey: string;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
  errorReason: string;
  depth: number;
  parallelCount: number;
  parallelIndex: number;
};

export type ChatTimelineTaskFallback = {
  agentKey?: string;
  parentTaskId?: string;
  planId?: string;
  runId?: string;
  subAgentKey?: string;
  taskGroupId?: string;
  taskName?: string;
};

export type NormalizedChatTimelineTask = Omit<
  ChatTimelineTaskNode,
  'id' | 'kind' | 'createdAt' | 'updatedAt' | 'order' | 'lifecycle'
>;

const TERMINAL_TASK_STATUSES = new Set<ChatTimelineTaskStatus>([
  'completed',
  'failed',
  'cancelled',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getTaskSources(event: Record<string, unknown>) {
  const payload = isRecord(event.payload) ? event.payload : null;
  const eventTask = isRecord(event.task) ? event.task : null;
  const payloadTask = payload && isRecord(payload.task) ? payload.task : null;
  return [event, eventTask, payload, payloadTask] as const;
}

function readValue(
  sources: readonly (Record<string, unknown> | null)[],
  names: readonly string[],
): unknown {
  for (const name of names) {
    for (const source of sources) {
      if (!source) {
        continue;
      }
      const value = source[name];
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
    }
  }
  return undefined;
}

function readText(
  sources: readonly (Record<string, unknown> | null)[],
  names: readonly string[],
): string {
  return toText(readValue(sources, names)).trim();
}

function readTimestamp(
  sources: readonly (Record<string, unknown> | null)[],
  names: readonly string[],
): number | null {
  const value = readValue(sources, names);
  if (value === undefined) {
    return null;
  }
  const timestamp = normalizeProtocolTimestampMs(value, 0);
  return timestamp > 0 ? timestamp : null;
}

function readDuration(
  sources: readonly (Record<string, unknown> | null)[],
  names: readonly string[],
): number | null {
  const duration = Number(readValue(sources, names));
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

function statusFromEventType(type: string): ChatTimelineTaskStatus | null {
  if (type.endsWith('.complete') || type.endsWith('.completed') || type.endsWith('.done')) {
    return 'completed';
  }
  if (type.endsWith('.fail') || type.endsWith('.failed') || type.endsWith('.error')) {
    return 'failed';
  }
  if (type.endsWith('.cancel') || type.endsWith('.cancelled') || type.endsWith('.canceled')) {
    return 'cancelled';
  }
  if (type.endsWith('.start') || type.endsWith('.started')) {
    return 'running';
  }
  return null;
}

function resolveTaskStatus(
  type: string,
  sources: readonly (Record<string, unknown> | null)[],
  current: ChatTimelineTaskNode | undefined,
): ChatTimelineTaskStatus {
  return (
    parseChatTimelinePlanStatus(readValue(sources, ['status', 'state'])) ??
    statusFromEventType(type) ??
    current?.status ??
    'pending'
  );
}

export function resolveChatTimelineTaskId(
  event: Record<string, unknown>,
  fallback = '',
): string {
  const [eventSource, eventTask, payload, payloadTask] = getTaskSources(event);
  return (
    readText([eventSource, eventTask, payload, payloadTask], ['taskId']) ||
    readText([eventTask, payloadTask, payload, eventSource], ['id']) ||
    fallback
  );
}

export function createChatTimelineTaskNodeId(conversationId: string, taskId: string): string {
  return `task:${conversationId}:${taskId || 'task'}`;
}

export function normalizeChatTimelineTaskEvent(
  event: Record<string, unknown>,
  updatedAt: number,
  current?: ChatTimelineTaskNode,
  fallback: ChatTimelineTaskFallback = {},
): NormalizedChatTimelineTask {
  const sources = getTaskSources(event);
  const type = toText(event.type).toLowerCase();
  const taskId = resolveChatTimelineTaskId(event, current?.taskId || 'task');
  const status = resolveTaskStatus(type, sources, current);
  const terminal = TERMINAL_TASK_STATUSES.has(status);
  const startedAt =
    readTimestamp(sources, ['startedAt', 'startTime', 'startAt']) ??
    current?.startedAt ??
    (status === 'running' ? updatedAt : null);
  const completedAt = terminal
    ? (readTimestamp(sources, ['completedAt', 'endedAt', 'endTime', 'finishedAt']) ??
      (current && TERMINAL_TASK_STATUSES.has(current.status) ? current.completedAt : null) ??
      updatedAt)
    : null;
  const explicitDuration = readDuration(sources, ['durationMs', 'elapsedMs']);
  const computedDuration =
    startedAt !== null && completedAt !== null ? Math.max(0, completedAt - startedAt) : null;
  const preservedDuration =
    current && TERMINAL_TASK_STATUSES.has(current.status) ? current.durationMs : null;
  const errorReason =
    readText(sources, ['errorReason', 'error', 'failureReason', 'reason']) ||
    (status === 'failed' ? readText(sources, ['message']) : '') ||
    current?.errorReason ||
    '';

  return {
    taskId,
    planId: readText(sources, ['planId']) || current?.planId || fallback.planId || '',
    parentTaskId:
      readText(sources, ['parentTaskId', 'parentId']) ||
      current?.parentTaskId ||
      fallback.parentTaskId ||
      '',
    taskGroupId:
      readText(sources, ['groupId', 'taskGroupId', 'parallelGroupId']) ||
      current?.taskGroupId ||
      fallback.taskGroupId ||
      `task_group_${taskId}`,
    taskName:
      readText(sources, ['taskName', 'title', 'name', 'description']) ||
      current?.taskName ||
      fallback.taskName ||
      taskId,
    agentKey:
      readText(sources, ['agentKey', 'assigneeAgentKey', 'ownerAgentKey']) ||
      current?.agentKey ||
      fallback.agentKey ||
      '',
    subAgentKey:
      readText(sources, ['subAgentKey']) ||
      current?.subAgentKey ||
      fallback.subAgentKey ||
      '',
    status,
    startedAt,
    completedAt,
    durationMs: explicitDuration ?? preservedDuration ?? computedDuration,
    errorReason: status === 'failed' ? errorReason : '',
    runId: readText(sources, ['runId']) || current?.runId || fallback.runId || '',
  };
}

export function chatTimelineTaskNodePayloadEquals(
  left: ChatTimelineTaskNode,
  right: ChatTimelineTaskNode,
): boolean {
  return (
    left.taskId === right.taskId &&
    left.planId === right.planId &&
    left.parentTaskId === right.parentTaskId &&
    left.taskGroupId === right.taskGroupId &&
    left.taskName === right.taskName &&
    left.agentKey === right.agentKey &&
    left.subAgentKey === right.subAgentKey &&
    left.status === right.status &&
    left.startedAt === right.startedAt &&
    left.completedAt === right.completedAt &&
    left.durationMs === right.durationMs &&
    left.errorReason === right.errorReason
  );
}

export function getChatTimelineTaskContentLength(node: ChatTimelineTaskNode): number {
  return (
    node.taskId.length +
    node.planId.length +
    node.parentTaskId.length +
    node.taskGroupId.length +
    node.taskName.length +
    node.agentKey.length +
    node.subAgentKey.length +
    node.status.length +
    node.errorReason.length
  );
}

export function buildChatTimelineTaskView(
  steps: readonly ChatTimelinePlanStep[],
  tasks: readonly ChatTimelineTaskNode[],
): ChatTimelineTaskViewItem[] {
  const taskById = new Map(tasks.map((task) => [task.taskId, task]));
  const seenTaskIds = new Set<string>();
  const items = steps.map((step) => {
    seenTaskIds.add(step.taskId);
    const task = taskById.get(step.taskId);
    return {
      taskId: step.taskId,
      taskName: step.description || task?.taskName || step.taskId,
      status: task?.status ?? step.status,
      parentTaskId: task?.parentTaskId || '',
      parentTaskName: '',
      taskGroupId: task?.taskGroupId || `task_group_${step.taskId}`,
      agentKey: task?.agentKey || '',
      subAgentKey: task?.subAgentKey || '',
      startedAt: task?.startedAt ?? step.startedAt,
      completedAt: task?.completedAt ?? step.completedAt,
      durationMs: task?.durationMs ?? step.durationMs,
      errorReason: task?.errorReason || step.errorReason,
      depth: 0,
      parallelCount: 1,
      parallelIndex: 0,
    } satisfies ChatTimelineTaskViewItem;
  });
  tasks.forEach((task) => {
    if (seenTaskIds.has(task.taskId)) {
      return;
    }
    items.push({
      taskId: task.taskId,
      taskName: task.taskName || task.taskId,
      status: task.status,
      parentTaskId: task.parentTaskId,
      parentTaskName: '',
      taskGroupId: task.taskGroupId || `task_group_${task.taskId}`,
      agentKey: task.agentKey,
      subAgentKey: task.subAgentKey,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      durationMs: task.durationMs,
      errorReason: task.errorReason,
      depth: 0,
      parallelCount: 1,
      parallelIndex: 0,
    });
  });

  const itemById = new Map(items.map((item) => [item.taskId, item]));
  const childrenByParentId = new Map<string, ChatTimelineTaskViewItem[]>();
  items.forEach((item) => {
    if (!item.parentTaskId || item.parentTaskId === item.taskId || !itemById.has(item.parentTaskId)) {
      return;
    }
    const children = childrenByParentId.get(item.parentTaskId);
    if (children) {
      children.push(item);
    } else {
      childrenByParentId.set(item.parentTaskId, [item]);
    }
  });

  const ordered: ChatTimelineTaskViewItem[] = [];
  const visited = new Set<string>();
  const visit = (item: ChatTimelineTaskViewItem, depth: number) => {
    if (visited.has(item.taskId)) {
      return;
    }
    visited.add(item.taskId);
    ordered.push({
      ...item,
      parentTaskName: item.parentTaskId ? itemById.get(item.parentTaskId)?.taskName || '' : '',
      depth: Math.min(depth, 4),
    });
    childrenByParentId.get(item.taskId)?.forEach((child) => visit(child, depth + 1));
  };
  items
    .filter(
      (item) =>
        !item.parentTaskId ||
        item.parentTaskId === item.taskId ||
        !itemById.has(item.parentTaskId),
    )
    .forEach((item) => visit(item, 0));
  items.forEach((item) => visit(item, 0));

  const groups = new Map<string, ChatTimelineTaskViewItem[]>();
  ordered.forEach((item) => {
    const key = JSON.stringify([item.parentTaskId, item.taskGroupId || item.taskId]);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  });
  const groupInfoByTaskId = new Map<string, { count: number; index: number }>();
  groups.forEach((group) => {
    group.forEach((item, index) => {
      groupInfoByTaskId.set(item.taskId, { count: group.length, index });
    });
  });
  return ordered.map((item) => {
    const group = groupInfoByTaskId.get(item.taskId) ?? { count: 1, index: 0 };
    return {
      ...item,
      parallelCount: group.count,
      parallelIndex: group.index,
    };
  });
}

export function closeChatTimelineTaskNode(
  node: ChatTimelineTaskNode,
  lifecycle: Exclude<ChatTimelineLifecycle, 'active'>,
  updatedAt: number,
): ChatTimelineTaskNode {
  if (TERMINAL_TASK_STATUSES.has(node.status)) {
    return node.updatedAt >= updatedAt ? node : { ...node, updatedAt };
  }
  const nextUpdatedAt = Math.max(node.updatedAt, updatedAt);
  const status =
    lifecycle === 'complete' ? 'completed' : lifecycle === 'error' ? 'failed' : 'cancelled';
  const completedAt = nextUpdatedAt;
  return {
    ...node,
    status,
    completedAt,
    durationMs:
      node.startedAt === null ? node.durationMs : Math.max(0, completedAt - node.startedAt),
    lifecycle: getChatTimelinePlanLifecycle(status),
    updatedAt: nextUpdatedAt,
  };
}

function legacyTaskId(nodeId: string): string {
  return toText(nodeId.split(':').at(-1)) || 'task';
}

export function migratePersistedChatTimelineTaskNode(
  node: ChatTimelineNode,
  conversationId: string,
): ChatTimelineNode {
  if (node.kind !== 'task') {
    return node;
  }
  const raw = node as unknown as Record<string, unknown>;
  const updatedAt = Number(node.updatedAt) || Number(node.createdAt) || 0;
  const normalized = normalizeChatTimelineTaskEvent(
    {
      type: 'task.update',
      taskId: toText(raw.taskId) || legacyTaskId(node.id),
      planId: raw.planId,
      parentTaskId: raw.parentTaskId ?? raw.parentId,
      taskGroupId: raw.taskGroupId ?? raw.groupId,
      taskName: raw.taskName ?? raw.title,
      agentKey: raw.agentKey,
      subAgentKey: raw.subAgentKey,
      status: raw.status,
      startedAt: raw.startedAt,
      completedAt: raw.completedAt ?? raw.endedAt,
      durationMs: raw.durationMs,
      errorReason: raw.errorReason ?? raw.error ?? raw.body,
      runId: raw.runId,
    },
    updatedAt,
  );
  return {
    id: createChatTimelineTaskNodeId(conversationId, normalized.taskId),
    kind: 'task',
    ...normalized,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    order: node.order,
    lifecycle: getChatTimelinePlanLifecycle(normalized.status),
  };
}
