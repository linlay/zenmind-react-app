export const RUNTIME_STRUCTURED_MAX_PARSE_CHARS = 64 * 1024;
export const RUNTIME_STRUCTURED_MAX_DEPTH = 7;
export const RUNTIME_STRUCTURED_MAX_NODES = 240;
export const RUNTIME_STRUCTURED_MAX_CHILDREN = 48;
export const RUNTIME_STRUCTURED_LEAF_INITIAL_CHARS = 2_000;
export const RUNTIME_STRUCTURED_MAX_LEAF_RENDER_CHARS = 24_000;
export const RUNTIME_STRUCTURED_MAX_TOTAL_LEAF_CHARS = 64 * 1024;
export const RUNTIME_TEXT_INITIAL_CHARS = 3_000;
export const RUNTIME_TEXT_PAGE_CHARS = 6_000;
export const RUNTIME_TEXT_MAX_RENDER_CHARS = 24_000;

export type RuntimeStructuredPayloadTone = 'neutral' | 'code' | 'patch' | 'error';
export type RuntimeStructuredLeafTone = 'string' | 'number' | 'boolean' | 'null' | 'redacted' | 'notice';
export type RuntimeStructuredNotice = 'circular' | 'max_depth' | 'max_nodes' | 'more_children';

export type RuntimeStructuredPayloadNode =
  | {
      id: string;
      kind: 'branch';
      label: string;
      containerKind: 'array' | 'object';
      childCount: number;
      children: RuntimeStructuredPayloadNode[];
      truncated: boolean;
    }
  | {
      id: string;
      kind: 'leaf';
      label: string;
      tone: RuntimeStructuredLeafTone;
      valueText: string;
      truncated: boolean;
      notice?: RuntimeStructuredNotice;
      hiddenCount?: number;
    };

export type RuntimeStructuredPayloadView =
  | {
      kind: 'tree';
      root: RuntimeStructuredPayloadNode;
      tone: RuntimeStructuredPayloadTone;
      truncated: boolean;
    }
  | {
      kind: 'text';
      text: string;
      tone: RuntimeStructuredPayloadTone;
      structuredTooLarge: boolean;
      truncated: boolean;
    };

type RuntimeStructuredPayloadOptions = {
  role: 'args' | 'result';
  status?: string;
};

type ProjectionContext = {
  ancestors: WeakSet<object>;
  nodes: number;
  leafChars: number;
  truncated: boolean;
};

const REDACTED_TEXT = '[redacted]';
const TRUNCATED_TEXT = '[truncated]';
const SENSITIVE_KEY_FRAGMENT_PATTERN = /(?:authorization|password|passwd|secret|token|cookie|resourceticket)/;
const SENSITIVE_KEY_EXACT_PATTERN = /^(?:apikey|accesskey|privatekey|credential|credentials)$/;
const SENSITIVE_JSON_KEY_PATTERN =
  /("[^"\r\n]*(?:authorization|password|passwd|secret|token|cookie|resource[_-]?ticket)[^"\r\n]*"\s*:\s*)("(?:\\.|[^"\\])*"|[^,}\]\r\n]+)|("(?:api|access|private)[_-]?key"\s*:\s*)("(?:\\.|[^"\\])*"|[^,}\]\r\n]+)/gi;
const SENSITIVE_QUERY_PATTERN =
  /([?&][^?&=\s]*(?:authorization|password|passwd|secret|token|api_?key|access_?key|private_?key|credentials?|cookie|resource_?ticket)[^?&=\s]*=)[^&#\s]*/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z\d._~+/=-]+/gi;
const PATCH_PATTERN = /^(?:diff --git |Index: |@@ |--- |\+\+\+ )/m;
const CODE_PATTERN = /^(?:```|~~~)|\b(?:function|class|interface|const|let|var|return|import|export)\b[^\n]*[;{]/m;

function normalizeSensitiveKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z\d]/g, '');
}

export function isRuntimeStructuredSensitiveKey(key: string): boolean {
  const normalized = normalizeSensitiveKey(key);
  return SENSITIVE_KEY_FRAGMENT_PATTERN.test(normalized) || SENSITIVE_KEY_EXACT_PATTERN.test(normalized);
}

function sanitizeStringValue(value: string): string {
  return value
    .replace(SENSITIVE_QUERY_PATTERN, '$1[redacted]')
    .replace(BEARER_PATTERN, 'Bearer [redacted]')
    .replace(
      SENSITIVE_JSON_KEY_PATTERN,
      (_match, prefix: string | undefined, _value, keyPrefix: string | undefined) =>
        `${prefix || keyPrefix || ''}"${REDACTED_TEXT}"`
    );
}

function classifyTone(text: string, options: RuntimeStructuredPayloadOptions): RuntimeStructuredPayloadTone {
  if (options.role === 'result' && /(?:error|failed)/i.test(String(options.status || ''))) {
    return 'error';
  }
  const sample = text.slice(0, 8_192);
  if (PATCH_PATTERN.test(sample)) {
    return 'patch';
  }
  if (CODE_PATTERN.test(sample)) {
    return 'code';
  }
  return 'neutral';
}

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return value !== null && typeof value === 'object';
}

function projectLeafText(value: string, context: ProjectionContext): { text: string; truncated: boolean } {
  const remainingChars = Math.max(0, RUNTIME_STRUCTURED_MAX_TOTAL_LEAF_CHARS - context.leafChars);
  const visibleChars = Math.min(value.length, remainingChars, RUNTIME_STRUCTURED_MAX_LEAF_RENDER_CHARS);
  const visibleText = value.slice(0, visibleChars);
  context.leafChars += visibleChars;
  return {
    text: sanitizeStringValue(visibleText),
    truncated: visibleChars < value.length
  };
}

function createNoticeNode(
  id: string,
  notice: RuntimeStructuredNotice,
  hiddenCount = 0,
  label = ''
): RuntimeStructuredPayloadNode {
  return {
    id,
    kind: 'leaf',
    label,
    tone: 'notice',
    valueText: '',
    truncated: true,
    notice,
    hiddenCount
  };
}

function projectNode(
  value: unknown,
  label: string,
  id: string,
  depth: number,
  context: ProjectionContext,
  sensitive = false
): RuntimeStructuredPayloadNode | null {
  // Keep one slot available for a single truncation marker when the projection
  // exhausts its node budget.
  if (context.nodes >= RUNTIME_STRUCTURED_MAX_NODES - 1) {
    context.truncated = true;
    return null;
  }
  context.nodes += 1;

  if (sensitive) {
    return {
      id,
      kind: 'leaf',
      label,
      tone: 'redacted',
      valueText: '',
      truncated: false
    };
  }
  if (!isContainer(value)) {
    if (value === null) {
      return { id, kind: 'leaf', label, tone: 'null', valueText: 'null', truncated: false };
    }
    const valueType = typeof value;
    if (valueType === 'string') {
      const leaf = projectLeafText(value as string, context);
      context.truncated ||= leaf.truncated;
      return { id, kind: 'leaf', label, tone: 'string', valueText: leaf.text, truncated: leaf.truncated };
    }
    if (valueType === 'number' || valueType === 'bigint') {
      return { id, kind: 'leaf', label, tone: 'number', valueText: String(value), truncated: false };
    }
    if (valueType === 'boolean') {
      return { id, kind: 'leaf', label, tone: 'boolean', valueText: String(value), truncated: false };
    }
    return { id, kind: 'leaf', label, tone: 'string', valueText: String(value), truncated: false };
  }
  if (context.ancestors.has(value)) {
    context.truncated = true;
    return createNoticeNode(id, 'circular', 0, label);
  }

  const containerKind = Array.isArray(value) ? 'array' : 'object';
  const keys = Array.isArray(value)
    ? Array.from({ length: value.length }, (_, index) => String(index))
    : Object.keys(value);
  if (depth >= RUNTIME_STRUCTURED_MAX_DEPTH) {
    context.truncated = true;
    return createNoticeNode(id, 'max_depth', keys.length, label);
  }

  context.ancestors.add(value);
  const children: RuntimeStructuredPayloadNode[] = [];
  const visibleKeys = keys.slice(0, RUNTIME_STRUCTURED_MAX_CHILDREN);
  for (let index = 0; index < visibleKeys.length; index += 1) {
    const key = visibleKeys[index];
    const child = projectNode(
      (value as Record<string, unknown>)[key],
      containerKind === 'array' ? `[${key}]` : key,
      `${id}:${index}`,
      depth + 1,
      context,
      containerKind === 'object' && isRuntimeStructuredSensitiveKey(key)
    );
    if (!child) {
      break;
    }
    children.push(child);
  }
  context.ancestors.delete(value);

  const hiddenByChildrenLimit = Math.max(0, keys.length - visibleKeys.length);
  const hiddenByNodeLimit = Math.max(0, visibleKeys.length - children.length);
  const hiddenCount = hiddenByChildrenLimit + hiddenByNodeLimit;
  if (hiddenCount > 0) {
    context.truncated = true;
    if (context.nodes < RUNTIME_STRUCTURED_MAX_NODES) {
      context.nodes += 1;
      children.push(createNoticeNode(`${id}:more`, hiddenByNodeLimit > 0 ? 'max_nodes' : 'more_children', hiddenCount));
    }
  }

  return {
    id,
    kind: 'branch',
    label,
    containerKind,
    childCount: keys.length,
    children,
    truncated: hiddenCount > 0 || children.some((child) => child.truncated)
  };
}

export function buildRuntimeStructuredPayloadValue(
  value: unknown,
  tone: RuntimeStructuredPayloadTone = 'neutral'
): RuntimeStructuredPayloadView {
  const context: ProjectionContext = {
    ancestors: new WeakSet<object>(),
    nodes: 0,
    leafChars: 0,
    truncated: false
  };
  const root = projectNode(value, '', 'root', 0, context) || createNoticeNode('root:limit', 'max_nodes');
  return { kind: 'tree', root, tone, truncated: context.truncated || root.truncated };
}

export function buildRuntimeStructuredPayload(
  sourceText: string,
  options: RuntimeStructuredPayloadOptions
): RuntimeStructuredPayloadView {
  const text = String(sourceText || '').trim();
  const tone = classifyTone(text, options);
  if (text.length <= RUNTIME_STRUCTURED_MAX_PARSE_CHARS) {
    const parsed = tryParseJson(text);
    if (parsed.ok && isContainer(parsed.value)) {
      return buildRuntimeStructuredPayloadValue(parsed.value, tone);
    }
  }
  const visibleText = text.slice(0, RUNTIME_TEXT_MAX_RENDER_CHARS);
  return {
    kind: 'text',
    text: sanitizeStringValue(visibleText),
    tone,
    structuredTooLarge: text.length > RUNTIME_STRUCTURED_MAX_PARSE_CHARS && /^[\[{]/.test(text),
    truncated: text.length > visibleText.length
  };
}

type CopySanitizeContext = {
  ancestors: WeakSet<object>;
  nodes: number;
};

function sanitizeCopyValue(value: unknown, key: string, depth: number, context: CopySanitizeContext): unknown {
  if (isRuntimeStructuredSensitiveKey(key)) {
    return REDACTED_TEXT;
  }
  if (typeof value === 'string') {
    return sanitizeStringValue(value);
  }
  if (!isContainer(value)) {
    return value;
  }
  if (depth >= 24 || context.nodes >= 10_000 || context.ancestors.has(value)) {
    return TRUNCATED_TEXT;
  }
  context.nodes += 1;
  context.ancestors.add(value);
  let result: unknown;
  if (Array.isArray(value)) {
    const output: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (context.nodes >= 10_000) {
        output.push(TRUNCATED_TEXT);
        break;
      }
      output.push(sanitizeCopyValue(value[index], String(index), depth + 1, context));
    }
    result = output;
  } else {
    const output: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      if (context.nodes >= 10_000) {
        output.__truncated__ = TRUNCATED_TEXT;
        break;
      }
      output[entryKey] = sanitizeCopyValue(entryValue, entryKey, depth + 1, context);
    }
    result = output;
  }
  context.ancestors.delete(value);
  return result;
}

export function sanitizeRuntimeStructuredPayloadForCopy(sourceText: string): string {
  const text = String(sourceText || '').trim();
  if (!text) {
    return '';
  }
  if (text.length <= RUNTIME_STRUCTURED_MAX_PARSE_CHARS * 2) {
    const parsed = tryParseJson(text);
    if (parsed.ok) {
      const sanitized = sanitizeCopyValue(parsed.value, '', 0, {
        ancestors: new WeakSet<object>(),
        nodes: 0
      });
      try {
        return JSON.stringify(sanitized, null, 2) ?? '';
      } catch {
        return TRUNCATED_TEXT;
      }
    }
  }
  return sanitizeStringValue(text);
}
