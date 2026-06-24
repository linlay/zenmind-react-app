type HttpLogInput = {
  url: string;
  method?: string;
  attempt?: number;
};

type HttpRequestLogInput = HttpLogInput & {
  body?: unknown;
};

type HttpResponseLogInput = HttpLogInput & {
  status: number;
  durationMs: number;
  payload: unknown;
};

type HttpErrorLogInput = HttpLogInput & {
  durationMs: number;
  error: unknown;
};

export type HttpDebugDirection = 'request' | 'response' | 'error';

export type HttpDebugRecord = {
  id: number;
  timestamp: number;
  direction: HttpDebugDirection;
  method: string;
  url: string;
  status: number | null;
  durationMs: number | null;
  attempt: number | null;
  payloadBytes: number;
  json: string;
  truncated: boolean;
};

type HttpDebugSnapshot = {
  enabled: boolean;
  records: HttpDebugRecord[];
};

type HttpDebugListener = (snapshot: HttpDebugSnapshot) => void;

const MAX_STRING_LENGTH = 2_000;
const MAX_ARRAY_LENGTH = 50;
const MAX_OBJECT_KEYS = 80;
const MAX_FORM_DATA_FIELDS = 50;
const MAX_DEPTH = 6;
const MAX_RECORDS = 200;
const MAX_JSON_CHARS = 12_000;
const REDACTED = '[redacted]';

function isDebugLoggingEnabled() {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase();
  return (
    normalized.includes('authorization') ||
    normalized.includes('password') ||
    normalized.includes('secret') ||
    normalized.includes('token')
  );
}

function truncateText(value: string) {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_STRING_LENGTH)}... [truncated ${value.length - MAX_STRING_LENGTH} chars]`;
}

function getUtf8ByteLength(value: string) {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function truncateJson(json: string) {
  if (json.length <= MAX_JSON_CHARS) {
    return {
      json,
      truncated: false,
    };
  }

  return {
    json: `${json.slice(0, MAX_JSON_CHARS)}\n... [truncated]`,
    truncated: true,
  };
}

function sanitizeUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    url.searchParams.forEach((_value, key) => {
      if (isSensitiveKey(key)) {
        url.searchParams.set(key, REDACTED);
      }
    });
    return url.toString();
  } catch {
    return truncateText(String(rawUrl || ''));
  }
}

function parseMaybeJsonText(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeFormDataFieldName(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : 'field';
}

function isFormDataLike(value: Record<string, unknown>): boolean {
  if (typeof FormData !== 'undefined' && value instanceof FormData) {
    return true;
  }

  if (Object.prototype.toString.call(value) === '[object FormData]') {
    return true;
  }

  return Array.isArray(value._parts);
}

function extractFormDataParts(value: unknown): [string, unknown][] | null {
  if (!isObjectRecord(value)) {
    return null;
  }
  if (!isFormDataLike(value)) {
    return null;
  }

  const entries = value.entries;
  if (typeof entries === 'function') {
    try {
      return Array.from((entries as () => Iterable<[unknown, unknown]>).call(value)).map(([key, entryValue]) => [
        normalizeFormDataFieldName(key),
        entryValue
      ]);
    } catch {
      // Some React Native FormData polyfills expose entries but throw; fall back to _parts below.
    }
  }

  const parts = value._parts;
  if (!Array.isArray(parts)) {
    return null;
  }

  return parts
    .filter((part): part is [unknown, unknown] => Array.isArray(part) && part.length >= 2)
    .map(([key, entryValue]) => [normalizeFormDataFieldName(key), entryValue]);
}

function isBlobLike(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

function isFormDataFilePart(value: unknown): boolean {
  if (isBlobLike(value)) {
    return true;
  }
  if (!isObjectRecord(value)) {
    return false;
  }

  const hasFileName = typeof value.name === 'string' && value.name.trim().length > 0;
  const hasMimeType = typeof value.type === 'string' && value.type.trim().length > 0;
  const hasBytesProvider = typeof value.bytes === 'function';
  const hasUri = typeof value.uri === 'string' && value.uri.trim().length > 0;
  return (hasFileName && (hasMimeType || hasBytesProvider || hasUri)) || hasBytesProvider || hasUri;
}

function readFilePartNumber(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : undefined;
}

function sanitizeFormDataFilePart(value: unknown): Record<string, unknown> {
  const file: Record<string, unknown> = { content: '[omitted]' };

  if (isBlobLike(value)) {
    const name = typeof File !== 'undefined' && value instanceof File ? value.name : '';
    if (name) {
      file.name = truncateText(name);
    }
    if (value.type) {
      file.type = truncateText(value.type);
    }
    file.sizeBytes = value.size;
    return file;
  }

  if (!isObjectRecord(value)) {
    return file;
  }

  if (typeof value.name === 'string' && value.name.trim()) {
    file.name = truncateText(value.name.trim());
  }
  if (typeof value.type === 'string' && value.type.trim()) {
    file.type = truncateText(value.type.trim());
  }

  const sizeBytes = readFilePartNumber(value.size ?? value.sizeBytes);
  if (sizeBytes !== undefined) {
    file.sizeBytes = sizeBytes;
  }

  return file;
}

function sanitizeFormData(body: unknown): unknown {
  const parts = extractFormDataParts(body);
  if (!parts) {
    return '[form-data]';
  }

  const fields = parts.slice(0, MAX_FORM_DATA_FIELDS).map(([field, value]) => {
    if (isSensitiveKey(field)) {
      return { field, value: REDACTED };
    }
    if (isFormDataFilePart(value)) {
      return { field, file: sanitizeFormDataFilePart(value) };
    }
    return { field, value: sanitizeValue(value) };
  });

  if (parts.length > MAX_FORM_DATA_FIELDS) {
    fields.push({ field: '__truncatedFields', value: parts.length - MAX_FORM_DATA_FIELDS });
  }

  return {
    type: 'FormData',
    fields
  };
}

function sanitizeValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return truncateText(value);
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (depth >= MAX_DEPTH) {
    return '[max-depth]';
  }

  if (seen.has(value)) {
    return '[circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) => sanitizeValue(item, depth + 1, seen));
    if (value.length > MAX_ARRAY_LENGTH) {
      items.push(`[truncated ${value.length - MAX_ARRAY_LENGTH} items]`);
    }
    return items;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const limitedEntries = entries.slice(0, MAX_OBJECT_KEYS);
  const sanitized: Record<string, unknown> = {};
  limitedEntries.forEach(([key, entryValue]) => {
    sanitized[key] = isSensitiveKey(key) ? REDACTED : sanitizeValue(entryValue, depth + 1, seen);
  });

  if (entries.length > MAX_OBJECT_KEYS) {
    sanitized.__truncatedKeys = entries.length - MAX_OBJECT_KEYS;
  }

  return sanitized;
}

function sanitizeBody(body: unknown): unknown {
  if (extractFormDataParts(body)) {
    return sanitizeFormData(body);
  }
  return typeof body === 'string' ? sanitizeValue(parseMaybeJsonText(body)) : sanitizeValue(body);
}

function buildMeta(input: Pick<HttpLogInput, 'attempt'>) {
  return input.attempt && input.attempt > 1 ? { attempt: input.attempt } : {};
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return JSON.stringify({ error: 'Unable to stringify HTTP debug payload' }, null, 2);
  }
}

class HttpDebugRecorder {
  private enabled = isDebugLoggingEnabled();
  private nextRecordId = 1;
  private readonly records: HttpDebugRecord[] = [];
  private readonly listeners = new Set<HttpDebugListener>();

  getSnapshot(): HttpDebugSnapshot {
    return {
      enabled: this.enabled,
      records: [...this.records],
    };
  }

  subscribe(listener: HttpDebugListener) {
    listener(this.getSnapshot());
    if (!isDebugLoggingEnabled()) {
      return () => {};
    }

    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setEnabled(enabled: boolean) {
    if (!isDebugLoggingEnabled() || this.enabled === enabled) {
      return;
    }

    this.enabled = enabled;
    this.notify();
  }

  clear() {
    if (!isDebugLoggingEnabled() || this.records.length <= 0) {
      return;
    }

    this.records.splice(0, this.records.length);
    this.notify();
  }

  record(input: {
    direction: HttpDebugDirection;
    method: string;
    url: string;
    status?: number | null;
    durationMs?: number | null;
    attempt?: number | null;
    payload: unknown;
  }) {
    if (!isDebugLoggingEnabled() || !this.enabled) {
      return;
    }

    const json = safeStringify(input.payload);
    const truncated = truncateJson(json);
    const record: HttpDebugRecord = {
      id: this.nextRecordId,
      timestamp: Date.now(),
      direction: input.direction,
      method: input.method,
      url: input.url,
      status: input.status ?? null,
      durationMs: input.durationMs ?? null,
      attempt: input.attempt ?? null,
      payloadBytes: getUtf8ByteLength(json),
      json: truncated.json,
      truncated: truncated.truncated,
    };

    this.nextRecordId += 1;
    this.records.push(record);
    if (this.records.length > MAX_RECORDS) {
      this.records.splice(0, this.records.length - MAX_RECORDS);
    }
    this.notify();
  }

  private notify() {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export const httpDebugRecorder = new HttpDebugRecorder();

export function logHttpRequest(input: HttpRequestLogInput) {
  if (!isDebugLoggingEnabled()) {
    return;
  }

  const method = String(input.method || 'GET').toUpperCase();
  const url = sanitizeUrl(input.url);
  const meta = {
    ...buildMeta(input),
    ...(input.body === undefined ? {} : { body: sanitizeBody(input.body) }),
  };
  httpDebugRecorder.record({
    direction: 'request',
    method,
    url,
    attempt: input.attempt ?? null,
    payload: meta,
  });
  console.warn('[api] ->', method, url, meta);
}

export function logHttpResponse(input: HttpResponseLogInput) {
  if (!isDebugLoggingEnabled()) {
    return;
  }

  const method = String(input.method || 'GET').toUpperCase();
  const url = sanitizeUrl(input.url);
  const meta = {
    ...buildMeta(input),
    response: sanitizeValue(input.payload),
  };
  httpDebugRecorder.record({
    direction: 'response',
    method,
    url,
    status: input.status,
    durationMs: input.durationMs,
    attempt: input.attempt ?? null,
    payload: meta,
  });
  console.warn('[api] <-', method, url, input.status, `${input.durationMs}ms`, meta);
}

export function logHttpError(input: HttpErrorLogInput) {
  if (!isDebugLoggingEnabled()) {
    return;
  }

  const method = String(input.method || 'GET').toUpperCase();
  const url = sanitizeUrl(input.url);
  const error = input.error instanceof Error ? input.error.message : String(input.error || '');
  const meta = {
    ...buildMeta(input),
    error: sanitizeValue(error),
  };
  httpDebugRecorder.record({
    direction: 'error',
    method,
    url,
    durationMs: input.durationMs,
    attempt: input.attempt ?? null,
    payload: meta,
  });
  console.warn('[api] xx', method, url, `${input.durationMs}ms`, meta);
}
