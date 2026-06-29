import type { ChatTimelineErrorDetail } from './types.ts';

type ChatTimelinePlatformErrorDisplay = {
  message: string;
  code: string;
  category: string;
  scope: string;
  status: number | null;
  retryable: boolean | null;
  retryHint: string;
  technicalText: string;
  error: ChatTimelineErrorDetail;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function readRecordPath(input: unknown, path: readonly string[]): Record<string, unknown> | null {
  let current: unknown = input;
  for (const key of path) {
    if (!isObjectRecord(current)) {
      return null;
    }
    current = current[key];
  }
  return isObjectRecord(current) ? current : null;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }
  return null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }
  return null;
}

function isStructuredErrorRecord(value: unknown): value is Record<string, unknown> {
  if (!isObjectRecord(value)) {
    return false;
  }
  return [
    'category',
    'code',
    'scope',
    'status',
    'retryable',
    'message',
    'diagnostics',
    'userSafeMessageKey',
  ].some((key) => key in value);
}

function pickStructuredError(input: unknown): Record<string, unknown> | null {
  const platformError = readRecordPath(input, ['platformError']);
  if (platformError) {
    return platformError;
  }

  const candidates: unknown[] = [
    readRecordPath(input, ['data', 'error']),
    readRecordPath(input, ['payload', 'error']),
    isObjectRecord(input) ? input.error : null,
    input,
  ];

  for (const candidate of candidates) {
    if (isStructuredErrorRecord(candidate)) {
      return candidate;
    }
  }

  return null;
}

function readFallbackMessage(input: unknown, structured: unknown): string {
  if (isObjectRecord(structured)) {
    const message = readString(structured.message);
    if (message) {
      return message;
    }
  }
  if (typeof structured === 'string') {
    const message = structured.trim();
    if (message) {
      return message;
    }
  }
  if (isObjectRecord(input)) {
    const message =
      readString(input.msg) ||
      readString(input.message) ||
      (typeof input.error === 'string' ? input.error.trim() : '');
    if (message) {
      return message;
    }
  }
  if (input instanceof Error) {
    return readString(input.message);
  }
  return '';
}

function readFallbackCode(
  input: unknown,
  structured: Record<string, unknown> | null
): string {
  const structuredCode = readString(structured?.code);
  if (structuredCode) {
    return structuredCode;
  }
  const userSafeMessageKey = readString(structured?.userSafeMessageKey);
  if (userSafeMessageKey) {
    return userSafeMessageKey;
  }
  if (!isObjectRecord(input)) {
    return '';
  }
  return readString(input.type) || readString(input.code);
}

function buildTechnicalText(error: Omit<ChatTimelineErrorDetail, 'technicalText'>): string {
  const payload: Record<string, unknown> = {};
  if (error.code) {
    payload.code = error.code;
  }
  if (error.category) {
    payload.category = error.category;
  }
  if (error.scope) {
    payload.scope = error.scope;
  }
  if (error.status !== null) {
    payload.status = error.status;
  }
  if (error.retryable !== null) {
    payload.retryable = error.retryable;
  }
  if (error.message) {
    payload.message = error.message;
  }
  if (error.diagnostics != null) {
    payload.diagnostics = error.diagnostics;
  }
  if (error.raw != null) {
    payload.raw = error.raw;
  }
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(error.message || error.code || '');
  }
}

function normalizeChatTimelinePlatformError(input: unknown): ChatTimelineErrorDetail {
  const structured = pickStructuredError(input);
  const record = isObjectRecord(input) ? input : null;
  const errorWithoutTechnicalText = {
    code: readFallbackCode(input, structured),
    category: readString(structured?.category),
    scope: readString(structured?.scope),
    status:
      readNumber(structured?.status) ??
      readNumber(record?.status) ??
      readNumber(record?.code),
    retryable: readBoolean(structured?.retryable),
    message: readFallbackMessage(input, structured),
    diagnostics: structured?.diagnostics,
    raw: structured ?? input,
  };

  return {
    ...errorWithoutTechnicalText,
    technicalText: buildTechnicalText(errorWithoutTechnicalText),
  };
}

export function formatChatTimelinePlatformErrorForDisplay(input: unknown): ChatTimelinePlatformErrorDisplay {
  const error = normalizeChatTimelinePlatformError(input);
  const message = error.message || error.code || error.category || '';

  return {
    message,
    code: error.code,
    category: error.category,
    scope: error.scope,
    status: error.status,
    retryable: error.retryable,
    retryHint: '',
    technicalText: error.technicalText,
    error,
  };
}

function formatChatTimelineErrorDetailValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function getChatTimelineErrorDetailSignature(
  errorDetail?: ChatTimelineErrorDetail | null
): string {
  if (!errorDetail) {
    return '';
  }
  return (
    errorDetail.technicalText ||
    [
      errorDetail.code,
      errorDetail.category,
      errorDetail.scope,
      errorDetail.status ?? '',
      errorDetail.retryable ?? '',
      errorDetail.message,
      formatChatTimelineErrorDetailValue(errorDetail.diagnostics),
    ].join('\n')
  );
}
