import type {
  ChatTimelineContextCompactNode,
  ChatTimelineContextCompactStatus,
  ChatTimelineLifecycle,
  ChatTimelineNode,
  ChatTimelineUsageSummary
} from './types.ts';

export type NormalizedChatTimelineContextCompact = {
  compactId: string;
  requestId: string;
  status: ChatTimelineContextCompactStatus;
  preCompactTokens: number | null;
  postCompactTokens: number | null;
  savedTokens: number | null;
  savedPercent: number | null;
  errorReason: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = toText(value);
    if (text) {
      return text;
    }
  }
  return '';
}

function readNonNegativeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const numeric = readNonNegativeNumber(value);
    if (numeric !== null) {
      return numeric;
    }
  }
  return null;
}

function resolveStatus(type: string): ChatTimelineContextCompactStatus {
  if (type.endsWith('.failed') || type.endsWith('.fail') || type.endsWith('.error')) {
    return 'failed';
  }
  if (type.endsWith('.complete') || type.endsWith('.completed') || type.endsWith('.done') || type.endsWith('.end')) {
    return 'completed';
  }
  return 'running';
}

function errorText(value: unknown): string {
  if (isRecord(value)) {
    return firstText(value.message, value.detail, value.reason, value.code);
  }
  return toText(value);
}

function deriveSavings(
  preCompactTokens: number | null,
  postCompactTokens: number | null,
  savedTokensInput: number | null,
  savedPercentInput: number | null
): { savedTokens: number | null; savedPercent: number | null } {
  const savedTokens =
    savedTokensInput ??
    (preCompactTokens !== null && postCompactTokens !== null
      ? Math.max(0, preCompactTokens - postCompactTokens)
      : null);
  const savedPercent =
    savedPercentInput ??
    (savedTokens !== null && preCompactTokens !== null && preCompactTokens > 0
      ? Math.round((savedTokens / preCompactTokens) * 100)
      : null);
  return { savedTokens, savedPercent };
}

export function normalizeChatTimelineContextCompactEvent(
  event: Record<string, unknown>
): NormalizedChatTimelineContextCompact {
  const payload = isRecord(event.payload) ? event.payload : {};
  const type = firstText(event.type, payload.type).toLowerCase();
  const preCompactTokens = firstNumber(
    event.preCompactEstimatedTokens,
    event.preCompactTokens,
    event.beforeTokens,
    payload.preCompactEstimatedTokens,
    payload.preCompactTokens,
    payload.beforeTokens
  );
  const postCompactTokens = firstNumber(
    event.postCompactEstimatedTokens,
    event.postCompactTokens,
    event.afterTokens,
    payload.postCompactEstimatedTokens,
    payload.postCompactTokens,
    payload.afterTokens
  );
  const savings = deriveSavings(
    preCompactTokens,
    postCompactTokens,
    firstNumber(event.savedTokens, event.tokensSaved, payload.savedTokens, payload.tokensSaved),
    firstNumber(event.savedPercent, event.savingsPercent, payload.savedPercent, payload.savingsPercent)
  );

  return {
    compactId: firstText(event.compactId, event.compact_id, payload.compactId, payload.compact_id),
    requestId: firstText(event.requestId, event.request_id, payload.requestId, payload.request_id),
    status: resolveStatus(type),
    preCompactTokens,
    postCompactTokens,
    ...savings,
    errorReason: firstText(
      errorText(event.error),
      event.detail,
      event.reason,
      event.message,
      errorText(payload.error),
      payload.detail,
      payload.reason,
      payload.message
    )
  };
}

export function createChatTimelineContextCompactNodeId(
  conversationId: string,
  normalized: Pick<NormalizedChatTimelineContextCompact, 'compactId' | 'requestId'>,
  fallback: string
): string {
  const stableId = normalized.requestId || normalized.compactId || String(fallback || 'compact');
  return `context:${String(conversationId || '').trim()}:compact:${stableId}`;
}

export function mergeChatTimelineContextCompactValues(
  current: ChatTimelineContextCompactNode | null | undefined,
  incoming: NormalizedChatTimelineContextCompact
): NormalizedChatTimelineContextCompact {
  const preCompactTokens = incoming.preCompactTokens ?? current?.preCompactTokens ?? null;
  const postCompactTokens = incoming.postCompactTokens ?? current?.postCompactTokens ?? null;
  const canDeriveSavings = preCompactTokens !== null && postCompactTokens !== null;
  const savings = deriveSavings(
    preCompactTokens,
    postCompactTokens,
    incoming.savedTokens ?? (canDeriveSavings ? null : (current?.savedTokens ?? null)),
    incoming.savedPercent ?? (canDeriveSavings ? null : (current?.savedPercent ?? null))
  );

  return {
    compactId: incoming.compactId || current?.compactId || '',
    requestId: incoming.requestId || current?.requestId || '',
    status: incoming.status,
    preCompactTokens,
    postCompactTokens,
    ...savings,
    errorReason: incoming.status === 'failed' ? incoming.errorReason || current?.errorReason || '' : ''
  };
}

export function chatTimelineContextCompactNodePayloadEquals(
  left: ChatTimelineContextCompactNode,
  right: ChatTimelineContextCompactNode
): boolean {
  return (
    left.compactId === right.compactId &&
    left.requestId === right.requestId &&
    left.status === right.status &&
    left.preCompactTokens === right.preCompactTokens &&
    left.postCompactTokens === right.postCompactTokens &&
    left.savedTokens === right.savedTokens &&
    left.savedPercent === right.savedPercent &&
    left.errorReason === right.errorReason
  );
}

export function getChatTimelineContextCompactContentLength(node: ChatTimelineContextCompactNode): number {
  return [
    node.compactId,
    node.requestId,
    node.status,
    node.preCompactTokens,
    node.postCompactTokens,
    node.savedTokens,
    node.savedPercent,
    node.errorReason
  ].join(':').length;
}

export function closeChatTimelineContextCompactNode(
  node: ChatTimelineContextCompactNode,
  lifecycle: Exclude<ChatTimelineLifecycle, 'active'>,
  updatedAt: number
): ChatTimelineContextCompactNode {
  return {
    ...node,
    status: lifecycle === 'complete' ? 'completed' : 'failed',
    lifecycle,
    updatedAt: Math.max(node.updatedAt, updatedAt)
  };
}

export function migratePersistedChatTimelineContextCompactNode(
  node: ChatTimelineNode,
  conversationId: string
): ChatTimelineNode {
  if (node.kind !== 'context') {
    return node;
  }

  const record = node as unknown as Record<string, unknown>;
  const legacyBody = toText(record.body);
  let legacyPayload: Record<string, unknown> = {};
  if (legacyBody.startsWith('{')) {
    try {
      const parsed = JSON.parse(legacyBody);
      legacyPayload = isRecord(parsed) ? parsed : {};
    } catch {
      legacyPayload = {};
    }
  }
  const legacyStatus = firstText(record.status).toLowerCase();
  const type =
    legacyStatus.includes('error') || legacyStatus.includes('fail')
      ? 'context.compact.failed'
      : legacyStatus.includes('complete') || node.lifecycle === 'complete'
        ? 'context.compact.complete'
        : 'context.compact.start';
  const normalized = normalizeChatTimelineContextCompactEvent({
    ...legacyPayload,
    ...record,
    type,
    error: firstText(record.errorReason, legacyStatus.includes('error') ? legacyBody : '')
  });
  const fallback = firstText(record.id).split(':').at(-1) || String(node.order);

  return {
    id: firstText(record.id) || createChatTimelineContextCompactNodeId(conversationId, normalized, fallback),
    kind: 'context',
    compactId: normalized.compactId,
    requestId: normalized.requestId,
    status: normalized.status,
    preCompactTokens: normalized.preCompactTokens,
    postCompactTokens: normalized.postCompactTokens,
    savedTokens: normalized.savedTokens,
    savedPercent: normalized.savedPercent,
    errorReason: normalized.errorReason,
    usageSummary: isRecord(record.usageSummary) ? (record.usageSummary as ChatTimelineUsageSummary) : null,
    runId: firstText(record.runId),
    createdAt: Number(record.createdAt) || 0,
    updatedAt: Number(record.updatedAt) || 0,
    order: Number(record.order) || 0,
    lifecycle: node.lifecycle
  };
}
