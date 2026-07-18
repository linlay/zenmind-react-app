import { normalizeProtocolTimestampMs, toText } from '../../core/api/services/chatEventProtocol.ts';
import type {
  ChatTimelineLifecycle,
  ChatTimelineNode,
  ChatTimelinePlanNode,
  ChatTimelinePlanStatus,
  ChatTimelinePlanStep,
} from './types.ts';

type NormalizedChatTimelinePlan = Omit<
  ChatTimelinePlanNode,
  'id' | 'kind' | 'runId' | 'createdAt' | 'updatedAt' | 'order' | 'lifecycle'
> & {
  hasStepsSnapshot: boolean;
};

const TERMINAL_PLAN_STATUSES = new Set<ChatTimelinePlanStatus>([
  'completed',
  'failed',
  'cancelled',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getPlanSources(event: Record<string, unknown>) {
  const payload = isRecord(event.payload) ? event.payload : null;
  const eventPlan = isRecord(event.plan) ? event.plan : null;
  const payloadPlan = payload && isRecord(payload.plan) ? payload.plan : null;
  return [event, eventPlan, payload, payloadPlan] as const;
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
  return toText(readValue(sources, names));
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
  const value = Number(readValue(sources, names));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function parsePlanStatus(value: unknown): ChatTimelinePlanStatus | null {
  const status = toText(value).toLowerCase();
  if (['completed', 'complete', 'done', 'success', 'succeeded', 'ok'].includes(status)) {
    return 'completed';
  }
  if (
    ['running', 'active', 'in_progress', 'in-progress', 'working', 'doing', 'started'].includes(
      status,
    )
  ) {
    return 'running';
  }
  if (['failed', 'fail', 'error', 'errored'].includes(status)) {
    return 'failed';
  }
  if (['cancelled', 'canceled', 'cancel'].includes(status)) {
    return 'cancelled';
  }
  if (['pending', 'queued', 'todo', 'waiting', 'created'].includes(status)) {
    return 'pending';
  }
  return null;
}

export function normalizeChatTimelinePlanStatus(
  value: unknown,
  fallback: ChatTimelinePlanStatus = 'pending',
): ChatTimelinePlanStatus {
  return parsePlanStatus(value) ?? fallback;
}

export function getChatTimelinePlanLifecycle(
  status: ChatTimelinePlanStatus,
): ChatTimelineLifecycle {
  if (status === 'completed') {
    return 'complete';
  }
  if (status === 'failed') {
    return 'error';
  }
  if (status === 'cancelled') {
    return 'cancelled';
  }
  return 'active';
}

function resolveStepSnapshot(
  sources: readonly (Record<string, unknown> | null)[],
): readonly unknown[] | null {
  for (const source of sources) {
    if (!source) {
      continue;
    }
    for (const name of ['plan', 'tasks', 'steps', 'items']) {
      if (Array.isArray(source[name])) {
        return source[name];
      }
    }
  }
  return null;
}

function normalizeStep(
  value: unknown,
  index: number,
  current: ChatTimelinePlanStep | undefined,
  updatedAt: number,
): ChatTimelinePlanStep | null {
  if (!isRecord(value)) {
    const description = toText(value);
    if (!description) {
      return null;
    }
    return {
      taskId: current?.taskId || `step-${index + 1}`,
      description,
      status: current?.status || 'pending',
      startedAt: current?.startedAt ?? null,
      completedAt: current?.completedAt ?? null,
      durationMs: current?.durationMs ?? null,
      errorReason: current?.errorReason || '',
    };
  }

  const taskId =
    readText([value], ['taskId', 'stepId', 'id', 'key']) || current?.taskId || `step-${index + 1}`;
  const description =
    readText([value], ['description', 'title', 'name', 'text', 'summary']) ||
    current?.description ||
    taskId;
  const status =
    parsePlanStatus(readValue([value], ['status', 'state'])) ?? current?.status ?? 'pending';
  const startedAt =
    readTimestamp([value], ['startedAt', 'startTime', 'startAt']) ??
    current?.startedAt ??
    (status === 'running' ? updatedAt : null);
  const completedAt =
    readTimestamp([value], ['completedAt', 'endedAt', 'endTime', 'finishedAt']) ??
    current?.completedAt ??
    (TERMINAL_PLAN_STATUSES.has(status) ? updatedAt : null);
  const explicitDuration = readDuration([value], ['durationMs', 'elapsedMs']);
  const durationMs =
    explicitDuration ??
    current?.durationMs ??
    (startedAt !== null && completedAt !== null ? Math.max(0, completedAt - startedAt) : null);
  const errorReason =
    readText([value], ['errorReason', 'error', 'failureReason', 'reason']) ||
    current?.errorReason ||
    '';

  return {
    taskId,
    description,
    status,
    startedAt,
    completedAt,
    durationMs,
    errorReason: status === 'failed' ? errorReason : '',
  };
}

function normalizeSteps(
  snapshot: readonly unknown[] | null,
  currentSteps: readonly ChatTimelinePlanStep[],
  updatedAt: number,
): ChatTimelinePlanStep[] {
  if (!snapshot) {
    return [...currentSteps];
  }

  const currentById = new Map(currentSteps.map((step) => [step.taskId, step]));
  const steps: ChatTimelinePlanStep[] = [];
  const stepIndexes = new Map<string, number>();
  snapshot.forEach((value, index) => {
    const record = isRecord(value) ? value : null;
    const candidateId = record ? readText([record], ['taskId', 'stepId', 'id', 'key']) : '';
    const step = normalizeStep(
      value,
      index,
      candidateId ? currentById.get(candidateId) : currentSteps[index],
      updatedAt,
    );
    if (!step) {
      return;
    }
    const existingIndex = stepIndexes.get(step.taskId);
    if (existingIndex === undefined) {
      stepIndexes.set(step.taskId, steps.length);
      steps.push(step);
    } else {
      steps[existingIndex] = step;
    }
  });
  return steps;
}

function statusFromEventType(type: string): ChatTimelinePlanStatus | null {
  if (type.endsWith('.complete') || type.endsWith('.completed') || type.endsWith('.done')) {
    return 'completed';
  }
  if (type.endsWith('.fail') || type.endsWith('.failed') || type.endsWith('.error')) {
    return 'failed';
  }
  if (type.endsWith('.cancel') || type.endsWith('.cancelled') || type.endsWith('.canceled')) {
    return 'cancelled';
  }
  return null;
}

function resolvePlanStatus(
  type: string,
  sources: readonly (Record<string, unknown> | null)[],
  steps: readonly ChatTimelinePlanStep[],
  current: ChatTimelinePlanNode | undefined,
): ChatTimelinePlanStatus {
  const explicit = parsePlanStatus(readValue(sources, ['status', 'state']));
  if (explicit) {
    return explicit;
  }
  const terminal = statusFromEventType(type);
  if (terminal) {
    return terminal;
  }
  if (steps.some((step) => step.status === 'failed')) {
    return 'failed';
  }
  if (steps.length > 0 && steps.every((step) => step.status === 'completed')) {
    return 'completed';
  }
  if (steps.some((step) => step.status === 'running')) {
    return 'running';
  }
  if (current && TERMINAL_PLAN_STATUSES.has(current.status)) {
    return current.status;
  }
  if (type === 'plan.create' || type === 'plan.update') {
    return 'running';
  }
  return current?.status ?? 'pending';
}

function finalizeStepForPlan(
  step: ChatTimelinePlanStep,
  status: ChatTimelinePlanStatus,
  updatedAt: number,
  errorReason: string,
): ChatTimelinePlanStep {
  let nextStatus = step.status;
  if (step.status === 'pending' || step.status === 'running') {
    if (status === 'completed') {
      nextStatus = 'completed';
    } else if (status === 'cancelled' && step.status === 'running') {
      nextStatus = 'cancelled';
    } else if (status === 'failed' && step.status === 'running') {
      nextStatus = 'failed';
    }
  }
  const wasTerminal = TERMINAL_PLAN_STATUSES.has(step.status);
  const terminal = TERMINAL_PLAN_STATUSES.has(nextStatus);
  const completedAt = terminal ? (step.completedAt ?? updatedAt) : null;
  const computedDuration =
    step.startedAt !== null && completedAt !== null
      ? Math.max(0, completedAt - step.startedAt)
      : null;
  const durationMs = wasTerminal
    ? (step.durationMs ?? computedDuration)
    : (computedDuration ?? step.durationMs);
  return {
    ...step,
    status: nextStatus,
    completedAt,
    durationMs,
    errorReason: nextStatus === 'failed' ? step.errorReason || errorReason : '',
  };
}

export function normalizeChatTimelinePlanEvent(
  event: Record<string, unknown>,
  updatedAt: number,
  current?: ChatTimelinePlanNode,
): NormalizedChatTimelinePlan {
  const sources = getPlanSources(event);
  const type = toText(event.type).toLowerCase();
  const stepSnapshot = resolveStepSnapshot(sources);
  const normalizedSteps = normalizeSteps(stepSnapshot, current?.steps ?? [], updatedAt);
  const status = resolvePlanStatus(type, sources, normalizedSteps, current);
  const errorReason =
    readText(sources, ['errorReason', 'error', 'failureReason', 'reason']) ||
    (status === 'failed' ? readText(sources, ['message']) : '') ||
    current?.errorReason ||
    '';
  const steps = normalizedSteps.map((step) =>
    finalizeStepForPlan(step, status, updatedAt, errorReason),
  );
  const startedAt =
    readTimestamp(sources, ['startedAt', 'startTime', 'startAt', 'createdAt']) ??
    current?.startedAt ??
    (status === 'running' || type === 'plan.create' ? updatedAt : null);
  const completedAt =
    readTimestamp(sources, ['completedAt', 'endedAt', 'endTime', 'finishedAt']) ??
    (TERMINAL_PLAN_STATUSES.has(status) ? (current?.completedAt ?? updatedAt) : null);
  const explicitDuration = readDuration(sources, ['durationMs', 'elapsedMs']);
  const preservedDuration =
    TERMINAL_PLAN_STATUSES.has(status) && current && TERMINAL_PLAN_STATUSES.has(current.status)
    ? (current?.durationMs ?? null)
    : null;
  const computedDuration =
    startedAt !== null && completedAt !== null ? Math.max(0, completedAt - startedAt) : null;
  const durationMs = explicitDuration ?? preservedDuration ?? computedDuration;

  return {
    planId: readText(sources, ['planId', 'id']) || current?.planId || 'plan',
    title: readText(sources, ['title', 'name']) || current?.title || '',
    summary:
      readText(sources, ['summary', 'text', 'body', 'description']) || current?.summary || '',
    status,
    steps,
    startedAt,
    completedAt,
    durationMs,
    errorReason: status === 'failed' ? errorReason : '',
    hasStepsSnapshot: stepSnapshot !== null,
  };
}

export function resolveChatTimelinePlanId(
  event: Record<string, unknown>,
  fallback = 'plan',
): string {
  return readText(getPlanSources(event), ['planId', 'id']) || fallback;
}

export function createChatTimelinePlanNodeId(conversationId: string, planId: string): string {
  return `plan:${conversationId}:${planId || 'plan'}`;
}

export function chatTimelinePlanNodePayloadEquals(
  left: ChatTimelinePlanNode,
  right: ChatTimelinePlanNode,
): boolean {
  if (
    left.planId !== right.planId ||
    left.title !== right.title ||
    left.summary !== right.summary ||
    left.status !== right.status ||
    left.startedAt !== right.startedAt ||
    left.completedAt !== right.completedAt ||
    left.durationMs !== right.durationMs ||
    left.errorReason !== right.errorReason ||
    left.steps.length !== right.steps.length
  ) {
    return false;
  }
  return left.steps.every((step, index) => {
    const other = right.steps[index];
    return Boolean(
      other &&
      step.taskId === other.taskId &&
      step.description === other.description &&
      step.status === other.status &&
      step.startedAt === other.startedAt &&
      step.completedAt === other.completedAt &&
      step.durationMs === other.durationMs &&
      step.errorReason === other.errorReason,
    );
  });
}

export function getChatTimelinePlanContentLength(node: ChatTimelinePlanNode): number {
  return (
    node.planId.length +
    node.title.length +
    node.summary.length +
    node.status.length +
    node.errorReason.length +
    node.steps.reduce(
      (total, step) =>
        total +
        step.taskId.length +
        step.description.length +
        step.status.length +
        step.errorReason.length,
      0,
    )
  );
}

export function closeChatTimelinePlanNode(
  node: ChatTimelinePlanNode,
  lifecycle: Exclude<ChatTimelineLifecycle, 'active'>,
  updatedAt: number,
): ChatTimelinePlanNode {
  const nextUpdatedAt = Math.max(node.updatedAt, updatedAt);
  const status = TERMINAL_PLAN_STATUSES.has(node.status)
    ? node.status
    : lifecycle === 'complete'
      ? 'completed'
      : lifecycle === 'error'
        ? 'failed'
        : 'cancelled';
  const completedAt = node.completedAt ?? nextUpdatedAt;
  const computedDuration =
    node.startedAt !== null ? Math.max(0, completedAt - node.startedAt) : null;
  return {
    ...node,
    status,
    steps: node.steps.map((step) =>
      finalizeStepForPlan(step, status, nextUpdatedAt, node.errorReason),
    ),
    completedAt,
    durationMs: TERMINAL_PLAN_STATUSES.has(node.status)
      ? (node.durationMs ?? computedDuration)
      : (computedDuration ?? node.durationMs),
    lifecycle: getChatTimelinePlanLifecycle(status),
    updatedAt: nextUpdatedAt,
  };
}

function legacyPlanId(nodeId: string): string {
  return toText(nodeId.split(':').at(-1)) || 'plan';
}

export function migratePersistedChatTimelinePlanNode(
  node: ChatTimelineNode,
  conversationId: string,
): ChatTimelineNode {
  if (node.kind !== 'plan') {
    return node;
  }
  const raw = node as unknown as Record<string, unknown>;
  const updatedAt = Number(node.updatedAt) || Number(node.createdAt) || 0;
  const normalized = normalizeChatTimelinePlanEvent(
    {
      type: 'plan.update',
      planId: toText(raw.planId) || legacyPlanId(node.id),
      title: raw.title,
      summary: raw.summary ?? raw.body,
      status: raw.status,
      steps: raw.steps,
      startedAt: raw.startedAt,
      completedAt: raw.completedAt,
      durationMs: raw.durationMs,
      errorReason: raw.errorReason,
    },
    updatedAt,
  );
  return {
    id: createChatTimelinePlanNodeId(conversationId, normalized.planId),
    kind: 'plan',
    planId: normalized.planId,
    title: normalized.title,
    summary: normalized.summary,
    status: normalized.status,
    steps: normalized.steps,
    startedAt: normalized.startedAt,
    completedAt: normalized.completedAt,
    durationMs: normalized.durationMs,
    errorReason: normalized.errorReason,
    runId: node.runId,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    order: node.order,
    lifecycle: getChatTimelinePlanLifecycle(normalized.status),
  };
}
