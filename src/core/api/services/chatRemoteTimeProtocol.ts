import { normalizeEventType } from './chatEventProtocol.ts';
const REMOTE_TIME_FIELDS = [
  'createdAt',
  'updatedAt',
  'startedAt',
  'finishedAt',
  'completedAt',
  'timestamp',
  'expiresAt',
  'readAt',
  'answeredAt',
  'pushedAt',
  'lastRunAt',
  'archivedAt',
  'lastRunCompletedAt',
  'feedbackAt'
] as const;

export function isRemoteEpochMillis(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1_000_000_000_000;
}

export function hasValidRemoteChatTimes(value: Record<string, unknown>): boolean {
  return REMOTE_TIME_FIELDS.every((field) => value[field] === undefined || isRemoteEpochMillis(value[field]));
}

export function hasValidRemoteChatStreamTime(event: Record<string, unknown>): boolean {
  return isRemoteEpochMillis(event.timestamp) && hasValidRemoteChatTimes(event);
}

// Push instants describe the business action, not the transport envelope.
const PUSH_REQUIRED_TIMES: Record<string, string> = {
  heartbeat: 'timestamp',
  'auth.expiring': 'expiresAt',
  'run.start': 'startedAt',
  'run.complete': 'finishedAt',
  'chat.created': 'createdAt',
  'chat.updated': 'updatedAt',
  'chat.unread': 'createdAt',
  'chat.read': 'readAt',
  'awaiting.ask': 'createdAt',
  'awaiting.answer': 'answeredAt',
  'resource.pushed': 'pushedAt',
  'chats.order.changed': 'updatedAt',
  'catalog.updated': 'updatedAt'
};

const PUSH_WITHOUT_TIMES = new Set([
  'connected',
  'chat.read_all',
  'chat.deleted',
  'chat.renamed',
  'chat.archived',
  'archive.deleted',
  'archive.restored'
]);

function hasValidNestedPushTimes(value: unknown, allowTimestamp: boolean): boolean {
  if (!value || typeof value !== 'object') return true;
  if (Array.isArray(value)) return value.every((item) => hasValidNestedPushTimes(item, allowTimestamp));
  const record = value as Record<string, unknown>;
  if (!hasValidRemoteChatTimes(record) || (!allowTimestamp && 'timestamp' in record)) return false;
  return Object.values(record).every((item) => hasValidNestedPushTimes(item, allowTimestamp));
}

export function hasValidRemoteChatPushTime(event: Record<string, unknown>, frame?: unknown): boolean {
  const type = normalizeEventType(event.type);
  if (
    !type ||
    type === 'chat.restored' ||
    !hasValidNestedPushTimes(event, type === 'heartbeat') ||
    (frame && !hasValidNestedPushTimes(frame, type === 'heartbeat'))
  )
    return false;
  const field = PUSH_REQUIRED_TIMES[type];
  if (field && !isRemoteEpochMillis(event[field])) return false;
  if (
    (field || PUSH_WITHOUT_TIMES.has(type)) &&
    REMOTE_TIME_FIELDS.some((key) => event[key] !== undefined && key !== field)
  )
    return false;
  if (type === 'archive.restored') {
    const summary = event.summary;
    return (
      !!summary &&
      typeof summary === 'object' &&
      ['createdAt', 'updatedAt', 'lastRunAt', 'archivedAt'].every((key) =>
        isRemoteEpochMillis((summary as Record<string, unknown>)[key])
      ) &&
      REMOTE_TIME_FIELDS.every(
        (key) =>
          (summary as Record<string, unknown>)[key] === undefined ||
          ['createdAt', 'updatedAt', 'lastRunAt', 'archivedAt', 'readAt'].includes(key)
      )
    );
  }
  return true;
}

// Convert a validated business instant into the internal replay envelope.
// This is an explicit push adapter, never a repair of malformed wire data.
export function withRemoteChatPushInstant(event: Record<string, unknown>): Record<string, unknown> {
  const field = PUSH_REQUIRED_TIMES[normalizeEventType(event.type)];
  const instant = field ? event[field] : (event.createdAt ?? event.updatedAt ?? event.finishedAt);
  return isRemoteEpochMillis(instant) ? { ...event, timestamp: instant } : event;
}

export function assertRemoteChatDetailTimes(detail: Record<string, unknown>): void {
  const events = Array.isArray(detail.events) ? detail.events : [];
  const runs = Array.isArray(detail.runs) ? detail.runs : [];
  const messages = Array.isArray(detail.messages) ? detail.messages : [];
  const artifactItems =
    detail.artifact && typeof detail.artifact === 'object'
      ? (detail.artifact as Record<string, unknown>).items
      : undefined;
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
  if (
    !hasValidRemoteChatTimes(detail) ||
    !events.every((event) => isRecord(event) && hasValidRemoteChatStreamTime(event)) ||
    !runs.every((run) => isRecord(run) && hasValidRemoteChatTimes(run)) ||
    !messages.every((message) => isRecord(message) && hasValidRemoteChatTimes(message)) ||
    (Array.isArray(artifactItems) && !artifactItems.every((item) => isRecord(item) && hasValidRemoteChatTimes(item))) ||
    (isRecord(detail.activeRun) && !hasValidRemoteChatTimes(detail.activeRun)) ||
    (isRecord(detail.awaiting) && !hasValidRemoteChatTimes(detail.awaiting)) ||
    (isRecord(detail.read) && !hasValidRemoteChatTimes(detail.read))
  ) {
    throw new Error('Invalid remote chat time: expected safe integer epoch milliseconds');
  }
}
