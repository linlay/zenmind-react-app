export const CHAT_CONVERSATION_DIAGNOSTIC_COMMAND = '输出当前会话全部相关数据';

const MAX_DIAGNOSTIC_DEPTH = 8;
const MAX_DIAGNOSTIC_ARRAY_ITEMS = 500;
const MAX_DIAGNOSTIC_OBJECT_KEYS = 240;
const MAX_DIAGNOSTIC_STRING_LENGTH = 20_000;
const MAX_DIAGNOSTIC_SECTION_LENGTH = 160_000;
const REDACTED = '[redacted]';

export type ChatConversationDiagnosticSectionId = 'environment' | 'remote' | 'local' | 'ui';

export type ChatConversationDiagnosticSection = {
  id: ChatConversationDiagnosticSectionId;
  json: string;
  truncated: boolean;
};

export type ChatConversationDiagnosticSource = {
  generatedAt: number;
  environment: unknown;
  remote: unknown;
  local: unknown;
};

export type ChatConversationDiagnosticReport = {
  generatedAt: number;
  sections: ChatConversationDiagnosticSection[];
};

export type ChatConversationDiagnosticState =
  | { status: 'idle'; requestId: number }
  | { status: 'loading'; requestId: number }
  | { status: 'ready'; requestId: number; report: ChatConversationDiagnosticReport }
  | { status: 'error'; requestId: number; errorText: string };

type SanitizeContext = {
  truncated: boolean;
  seen: WeakSet<object>;
};

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/gu, '');
  return (
    normalized.includes('authorization') ||
    normalized.includes('password') ||
    normalized.includes('secret') ||
    normalized.includes('token') ||
    normalized.includes('cookie') ||
    normalized.includes('resourceticket')
  );
}

function sanitizeUrlText(value: string): string {
  if (!/^(?:https?|wss?):\/\//iu.test(value)) {
    return value;
  }
  try {
    const url = new URL(value);
    url.searchParams.forEach((_entryValue, key) => {
      if (isSensitiveKey(key)) {
        url.searchParams.set(key, REDACTED);
      }
    });
    return url.toString();
  } catch {
    return value;
  }
}

function sanitizeDiagnosticValue(value: unknown, context: SanitizeContext, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    const sanitized = sanitizeUrlText(value);
    if (sanitized.length <= MAX_DIAGNOSTIC_STRING_LENGTH) {
      return sanitized;
    }
    context.truncated = true;
    return `${sanitized.slice(0, MAX_DIAGNOSTIC_STRING_LENGTH)}... [truncated ${
      sanitized.length - MAX_DIAGNOSTIC_STRING_LENGTH
    } chars]`;
  }
  if (typeof value !== 'object') {
    return value;
  }
  if (depth >= MAX_DIAGNOSTIC_DEPTH) {
    context.truncated = true;
    return '[max-depth]';
  }
  if (context.seen.has(value)) {
    context.truncated = true;
    return '[circular]';
  }
  context.seen.add(value);

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_DIAGNOSTIC_ARRAY_ITEMS)
      .map((item) => sanitizeDiagnosticValue(item, context, depth + 1));
    if (value.length > MAX_DIAGNOSTIC_ARRAY_ITEMS) {
      context.truncated = true;
      items.push(`[truncated ${value.length - MAX_DIAGNOSTIC_ARRAY_ITEMS} items]`);
    }
    return items;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const sanitized: Record<string, unknown> = {};
  entries.slice(0, MAX_DIAGNOSTIC_OBJECT_KEYS).forEach(([key, entryValue]) => {
    sanitized[key] = isSensitiveKey(key) ? REDACTED : sanitizeDiagnosticValue(entryValue, context, depth + 1);
  });
  if (entries.length > MAX_DIAGNOSTIC_OBJECT_KEYS) {
    context.truncated = true;
    sanitized.__truncatedKeys = entries.length - MAX_DIAGNOSTIC_OBJECT_KEYS;
  }
  return sanitized;
}

function buildDiagnosticSection(
  id: ChatConversationDiagnosticSectionId,
  value: unknown
): ChatConversationDiagnosticSection {
  const context: SanitizeContext = {
    truncated: false,
    seen: new WeakSet<object>()
  };
  let json = JSON.stringify(sanitizeDiagnosticValue(value, context), null, 2) ?? 'null';
  if (json.length > MAX_DIAGNOSTIC_SECTION_LENGTH) {
    context.truncated = true;
    json = `${json.slice(0, MAX_DIAGNOSTIC_SECTION_LENGTH)}\n... [section truncated]`;
  }
  return {
    id,
    json,
    truncated: context.truncated
  };
}

export function isChatConversationDiagnosticCommand(
  content: string,
  attachmentCount: number,
  development: boolean
): boolean {
  return development && attachmentCount === 0 && String(content || '').trim() === CHAT_CONVERSATION_DIAGNOSTIC_COMMAND;
}

export function buildChatConversationDiagnosticReport(
  source: ChatConversationDiagnosticSource,
  ui: unknown
): ChatConversationDiagnosticReport {
  return {
    generatedAt: source.generatedAt,
    sections: [
      buildDiagnosticSection('environment', source.environment),
      buildDiagnosticSection('remote', source.remote),
      buildDiagnosticSection('local', source.local),
      buildDiagnosticSection('ui', ui)
    ]
  };
}
