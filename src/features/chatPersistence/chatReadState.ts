import type { ChatReadState } from './types';

export type ChatReadStateInput =
  | {
      isRead?: unknown;
      read?: unknown;
      readAt?: unknown;
      readRunId?: unknown;
      runId?: unknown;
      unreadRunCount?: unknown;
      unreadCount?: unknown;
      readStatus?: unknown;
    }
  | boolean
  | number
  | string
  | null
  | undefined;

export type PersistedConversationReadStateInput = {
  unreadCount?: unknown;
  isRead?: unknown;
  readAt?: unknown;
  readRunId?: unknown;
};

const READ_STATE_KEYS = ['isRead', 'read', 'unreadRunCount', 'unreadCount', 'readStatus'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseTimestamp(value: unknown): number | null {
  const numeric = toFiniteNumber(value);
  if (numeric !== null && numeric > 0) {
    return numeric >= 1_000_000_000_000 ? numeric : numeric * 1000;
  }

  const text = String(value || '').trim();
  if (!text) {
    return null;
  }

  const parsed = Date.parse(text);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toOptionalBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === null || value === undefined || value === '') {
    return null;
  }

  const text = String(value).trim().toLowerCase();
  if (text === 'true' || text === '1') {
    return true;
  }
  if (text === 'false' || text === '0') {
    return false;
  }

  return null;
}

function normalizeReadRunId(value: unknown): string | null {
  const text = String(value || '').trim();
  return text || null;
}

function readStateFromIsRead(
  isRead: boolean,
  readAt?: unknown,
  readRunId?: unknown
): ChatReadState {
  return {
    isRead,
    readAt: parseTimestamp(readAt),
    readRunId: normalizeReadRunId(readRunId),
  };
}

export function hasChatReadStateInput(input: ChatReadStateInput): boolean {
  if (input === null || input === undefined || input === '') {
    return false;
  }

  if (typeof input === 'boolean' || typeof input === 'number' || typeof input === 'string') {
    return true;
  }

  if (!isRecord(input)) {
    return false;
  }

  if (
    READ_STATE_KEYS.some((key) => {
      const value = input[key];
      return value !== undefined && value !== null && value !== '';
    })
  ) {
    return true;
  }

  return false;
}

export function normalizeChatReadState(input: ChatReadStateInput): ChatReadState {
  if (typeof input === 'boolean') {
    return readStateFromIsRead(input);
  }

  if (typeof input === 'number' || typeof input === 'string') {
    return readStateFromIsRead(!(toFiniteNumber(input) !== null && Number(input) > 0));
  }

  if (!isRecord(input)) {
    return readStateFromIsRead(true);
  }

  const readObject = isRecord(input.read) ? input.read : null;
  const readBoolean = !readObject ? toOptionalBoolean(input.read) : null;
  const explicitIsRead = toOptionalBoolean(readObject?.isRead ?? input.isRead);
  const readAt = readObject?.readAt ?? input.readAt;
  const readRunId = readObject?.readRunId ?? input.readRunId ?? input.runId;

  if (explicitIsRead !== null) {
    return readStateFromIsRead(explicitIsRead, readAt, readRunId);
  }

  if (readObject) {
    return readStateFromIsRead(true, readAt, readRunId);
  }

  if (readBoolean !== null) {
    return readStateFromIsRead(readBoolean, readAt, readRunId);
  }

  const readStatus = toFiniteNumber(input.readStatus);
  if (readStatus !== null) {
    return readStateFromIsRead(readStatus !== 0, readAt, readRunId);
  }

  const unreadRunCount = toFiniteNumber(input.unreadRunCount);
  if (unreadRunCount !== null) {
    return readStateFromIsRead(unreadRunCount <= 0, readAt, readRunId);
  }

  const unreadCount = toFiniteNumber(input.unreadCount);
  if (unreadCount !== null) {
    return readStateFromIsRead(unreadCount <= 0, readAt, readRunId);
  }

  return readStateFromIsRead(true, readAt, readRunId);
}

export function normalizePersistedConversationReadState(
  input: PersistedConversationReadStateInput
): ChatReadState {
  const hasPersistedIsRead =
    input.isRead !== undefined && input.isRead !== null && input.isRead !== '';

  return normalizeChatReadState({
    isRead: hasPersistedIsRead ? input.isRead : undefined,
    readAt: input.readAt ?? null,
    readRunId: input.readRunId ?? null,
    unreadCount: hasPersistedIsRead ? undefined : input.unreadCount,
  });
}

export function normalizeChatReadPatch(input: ChatReadStateInput): ChatReadState | undefined {
  return hasChatReadStateInput(input) ? normalizeChatReadState(input) : undefined;
}

export function mergeChatReadState(
  current: ChatReadStateInput,
  patch: ChatReadStateInput
): ChatReadState {
  const currentState = normalizeChatReadState(current);
  if (!hasChatReadStateInput(patch)) {
    return currentState;
  }

  const nextState = normalizeChatReadState(patch);
  if (!isRecord(patch)) {
    return nextState;
  }

  const readObject = isRecord(patch.read) ? patch.read : null;
  const hasReadAt = (readObject && 'readAt' in readObject) || 'readAt' in patch;
  const hasReadRunId =
    (readObject && 'readRunId' in readObject) || 'readRunId' in patch || 'runId' in patch;

  return {
    ...nextState,
    readAt: hasReadAt ? nextState.readAt : currentState.readAt,
    readRunId: hasReadRunId ? nextState.readRunId : currentState.readRunId,
  };
}

export function isChatUnread(input: ChatReadStateInput): boolean {
  return !normalizeChatReadState(input).isRead;
}

export function readStateToUnreadBit(input: ChatReadStateInput): 0 | 1 {
  return isChatUnread(input) ? 1 : 0;
}

export function normalizeConversationUnreadCount(input: ChatReadStateInput): number {
  return readStateToUnreadBit(input);
}
