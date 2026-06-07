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

const MAX_STRING_LENGTH = 2_000;
const MAX_ARRAY_LENGTH = 50;
const MAX_OBJECT_KEYS = 80;
const MAX_DEPTH = 6;
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
  return typeof body === 'string' ? sanitizeValue(parseMaybeJsonText(body)) : sanitizeValue(body);
}

function buildMeta(input: Pick<HttpLogInput, 'attempt'>) {
  return input.attempt && input.attempt > 1 ? { attempt: input.attempt } : {};
}

export function logHttpRequest(input: HttpRequestLogInput) {
  if (!isDebugLoggingEnabled()) {
    return;
  }

  const method = String(input.method || 'GET').toUpperCase();
  const meta = {
    ...buildMeta(input),
    ...(input.body === undefined ? {} : { body: sanitizeBody(input.body) }),
  };
  console.warn('[api] ->', method, sanitizeUrl(input.url), meta);
}

export function logHttpResponse(input: HttpResponseLogInput) {
  if (!isDebugLoggingEnabled()) {
    return;
  }

  const method = String(input.method || 'GET').toUpperCase();
  console.warn('[api] <-', method, sanitizeUrl(input.url), input.status, `${input.durationMs}ms`, {
    ...buildMeta(input),
    response: sanitizeValue(input.payload),
  });
}

export function logHttpError(input: HttpErrorLogInput) {
  if (!isDebugLoggingEnabled()) {
    return;
  }

  const method = String(input.method || 'GET').toUpperCase();
  const error = input.error instanceof Error ? input.error.message : String(input.error || '');
  console.warn('[api] xx', method, sanitizeUrl(input.url), `${input.durationMs}ms`, {
    ...buildMeta(input),
    error: sanitizeValue(error),
  });
}
