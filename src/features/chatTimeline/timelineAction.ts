import { toText } from '../../core/api/services/chatEventProtocol.ts';
import type {
  ChatTimelineActionExecutorKind,
  ChatTimelineActionNode,
  ChatTimelineActionPolicy,
  ChatTimelineActionStatus,
  ChatTimelineLifecycle,
  ChatTimelineNode
} from './types.ts';

export type ConversationActionDefinition = {
  actionName: string;
  executorKind: ChatTimelineActionExecutorKind | null;
  policy: ChatTimelineActionPolicy;
  policyReason: string;
};

export type NormalizedChatTimelineAction = Omit<
  ChatTimelineActionNode,
  'id' | 'kind' | 'runId' | 'createdAt' | 'updatedAt' | 'order' | 'lifecycle'
>;

const ACTION_DEFINITIONS: Readonly<Record<string, ConversationActionDefinition>> = Object.freeze({
  switch_theme: Object.freeze({
    actionName: 'switch_theme',
    executorKind: 'theme',
    policy: 'allowed',
    policyReason: 'mobile_whitelist'
  }),
  launch_fireworks: Object.freeze({
    actionName: 'launch_fireworks',
    executorKind: null,
    policy: 'unsupported',
    policyReason: 'unsupported_on_mobile'
  })
});

const UNKNOWN_ACTION_DEFINITION: ConversationActionDefinition = Object.freeze({
  actionName: '',
  executorKind: null,
  policy: 'unknown',
  policyReason: 'not_in_mobile_whitelist'
});

const MOBILE_ACTION_WHITELIST = Object.freeze(
  Object.values(ACTION_DEFINITIONS).filter((definition) => definition.policy === 'allowed')
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (!isRecord(value)) {
    return JSON.stringify(value) ?? String(value ?? '');
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

function displayStringify(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function getActionSources(event: Record<string, unknown>) {
  const payload = isRecord(event.payload) ? event.payload : null;
  const action = isRecord(event.action) ? event.action : null;
  const payloadAction = payload && isRecord(payload.action) ? payload.action : null;
  return [event, action, payload, payloadAction] as const;
}

function readValue(sources: readonly (Record<string, unknown> | null)[], names: readonly string[]): unknown {
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

function parseObject(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) {
    return value;
  }
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeConversationActionName(value: unknown): string {
  return toText(value).trim().toLowerCase();
}

export function resolveConversationActionDefinition(actionNameInput: unknown): ConversationActionDefinition {
  const actionName = normalizeConversationActionName(actionNameInput);
  return ACTION_DEFINITIONS[actionName] ?? { ...UNKNOWN_ACTION_DEFINITION, actionName };
}

export function getConversationActionWhitelist(): readonly ConversationActionDefinition[] {
  return MOBILE_ACTION_WHITELIST;
}

export function normalizeConversationActionArguments(
  actionNameInput: unknown,
  rawArgs: Record<string, unknown>
): Record<string, unknown> {
  const actionName = normalizeConversationActionName(actionNameInput);
  if (actionName === 'switch_theme') {
    return { theme: normalizeConversationActionName(rawArgs.theme) === 'dark' ? 'dark' : 'light' };
  }
  if (actionName === 'launch_fireworks') {
    const numeric = Number(rawArgs.durationMs);
    const durationMs = Number.isFinite(numeric) ? clamp(Math.round(numeric), 1_000, 30_000) : 8_000;
    return { durationMs };
  }
  return rawArgs;
}

export function readConversationActionEventArguments(event: Record<string, unknown>): Record<string, unknown> | null {
  return parseObject(readValue(getActionSources(event), ['arguments', 'actionParams', 'args', 'input']));
}

export function resolveConversationActionEventName(event: Record<string, unknown>, fallback = ''): string {
  return (
    normalizeConversationActionName(readValue(getActionSources(event), ['actionName', 'name'])) ||
    normalizeConversationActionName(fallback)
  );
}

export function resolveChatTimelineActionId(event: Record<string, unknown>, fallback = ''): string {
  const sources = getActionSources(event);
  return toText(readValue(sources, ['actionId', 'id'])).trim() || fallback;
}

export function createChatTimelineActionNodeId(conversationId: string, actionId: string): string {
  return `action:${conversationId}:${actionId || 'action'}`;
}

export function getChatTimelineActionEventSequence(event: Record<string, unknown>): number | null {
  const numeric = Number(readValue(getActionSources(event), ['seq', 'sequence']));
  return Number.isFinite(numeric) ? numeric : null;
}

export function getChatTimelineActionEventSignature(event: Record<string, unknown>): string {
  const sources = getActionSources(event);
  return hashText(
    stableStringify({
      type: normalizeConversationActionName(event.type),
      actionId: resolveChatTimelineActionId(event),
      actionName: normalizeConversationActionName(readValue(sources, ['actionName', 'name'])),
      delta: toText(event.delta),
      arguments: readValue(sources, ['arguments', 'actionParams', 'args', 'input']),
      result: readValue(sources, ['result', 'output']),
      error: readValue(sources, ['error', 'errorReason', 'reason']),
      seq: getChatTimelineActionEventSequence(event),
      timestamp: readValue(sources, ['timestamp', 'ts', 'time', 'updatedAt'])
    })
  );
}

function resolveActionStatus(
  type: string,
  policy: ChatTimelineActionPolicy,
  current: ChatTimelineActionNode | undefined
): ChatTimelineActionStatus {
  if (type.endsWith('.error') || type.endsWith('.fail') || type.endsWith('.failed')) {
    return 'failed';
  }
  if (type.endsWith('.result') || type.endsWith('.complete') || type.endsWith('.completed')) {
    return 'completed';
  }
  if (current && ['completed', 'failed', 'blocked'].includes(current.status)) {
    return current.status;
  }
  if (type.endsWith('.end') || type.endsWith('.snapshot')) {
    return policy === 'allowed' ? 'ready' : 'blocked';
  }
  return 'collecting';
}

function targetForAction(
  actionName: string,
  args: Record<string, unknown> | null,
  sources: readonly (Record<string, unknown> | null)[],
  current: ChatTimelineActionNode | undefined
): string {
  const explicit = toText(readValue(sources, ['target', 'destination', 'resource', 'path'])).trim();
  if (explicit) {
    return explicit;
  }
  if (actionName === 'switch_theme') {
    return toText(args?.theme) || current?.target || '';
  }
  if (actionName === 'launch_fireworks') {
    const durationMs = Number(args?.durationMs);
    return Number.isFinite(durationMs) ? `${durationMs} ms` : current?.target || '';
  }
  return (
    toText(args?.target || args?.destination || args?.resource || args?.path || args?.url) || current?.target || ''
  );
}

export function normalizeChatTimelineActionEvent(
  event: Record<string, unknown>,
  current?: ChatTimelineActionNode
): NormalizedChatTimelineAction {
  const type = normalizeConversationActionName(event.type);
  const sources = getActionSources(event);
  const actionId = resolveChatTimelineActionId(event, current?.actionId || 'action');
  const actionName = resolveConversationActionEventName(event, current?.actionName) || 'unknown';
  const definition = resolveConversationActionDefinition(actionName);
  const directArgs = readConversationActionEventArguments(event);
  const delta = type.endsWith('.args') ? toText(event.delta) : '';
  const rawArgsText = directArgs
    ? displayStringify(directArgs)
    : delta
      ? `${current?.argsText || ''}${delta}`
      : current?.argsText || '';
  const parsedArgs = directArgs ?? parseObject(rawArgsText) ?? current?.args ?? null;
  const args = parsedArgs ? normalizeConversationActionArguments(actionName, parsedArgs) : null;
  const argsText = args && (directArgs || parseObject(rawArgsText)) ? displayStringify(args) : rawArgsText;
  const result = readValue(sources, ['result', 'output']);
  const resultValue = result !== undefined ? result : (current?.result ?? null);
  const resultText = result !== undefined ? displayStringify(result) : current?.resultText || '';
  const status = resolveActionStatus(type, definition.policy, current);
  const errorReason =
    status === 'failed'
      ? toText(readValue(sources, ['errorReason', 'error', 'reason', 'message'])) || current?.errorReason || ''
      : '';

  return {
    actionId,
    actionName,
    target: targetForAction(actionName, args, sources, current),
    status,
    policy: definition.policy,
    policyReason: definition.policyReason,
    executorKind: definition.executorKind,
    args,
    argsText,
    result: resultValue,
    resultText,
    errorReason,
    lastSequence: getChatTimelineActionEventSequence(event) ?? current?.lastSequence ?? null,
    lastEventSignature: getChatTimelineActionEventSignature(event)
  };
}

export function getChatTimelineActionLifecycle(status: ChatTimelineActionStatus): ChatTimelineLifecycle {
  if (status === 'collecting') {
    return 'active';
  }
  if (status === 'failed') {
    return 'error';
  }
  return 'complete';
}

export function closeChatTimelineActionNode(
  node: ChatTimelineActionNode,
  lifecycle: Exclude<ChatTimelineLifecycle, 'active'>,
  updatedAt: number
): ChatTimelineActionNode {
  const status: ChatTimelineActionStatus =
    lifecycle === 'error'
      ? 'failed'
      : node.status === 'collecting'
        ? node.policy === 'allowed'
          ? 'ready'
          : 'blocked'
        : node.status;
  return {
    ...node,
    status,
    lifecycle: status === 'failed' ? 'error' : 'complete',
    updatedAt: Math.max(node.updatedAt, updatedAt)
  };
}

export function chatTimelineActionNodePayloadEquals(
  left: ChatTimelineActionNode,
  right: ChatTimelineActionNode
): boolean {
  return (
    left.actionId === right.actionId &&
    left.actionName === right.actionName &&
    left.target === right.target &&
    left.status === right.status &&
    left.policy === right.policy &&
    left.policyReason === right.policyReason &&
    left.executorKind === right.executorKind &&
    stableStringify(left.args) === stableStringify(right.args) &&
    left.argsText === right.argsText &&
    stableStringify(left.result) === stableStringify(right.result) &&
    left.resultText === right.resultText &&
    left.errorReason === right.errorReason &&
    left.lastSequence === right.lastSequence &&
    left.lastEventSignature === right.lastEventSignature
  );
}

export function getChatTimelineActionContentLength(node: ChatTimelineActionNode): number {
  return (
    node.actionId.length +
    node.actionName.length +
    node.target.length +
    node.argsText.length +
    node.resultText.length +
    node.errorReason.length +
    node.policyReason.length
  );
}

function legacyActionId(nodeId: string): string {
  return nodeId.split(':').at(-1) || 'action';
}

function legacyActionStatus(raw: Record<string, unknown>): ChatTimelineActionStatus {
  const status = normalizeConversationActionName(raw.status);
  if (['error', 'failed'].includes(status) || raw.lifecycle === 'error') {
    return 'failed';
  }
  if (raw.lifecycle === 'active' || ['generating', 'updating', 'running'].includes(status)) {
    return 'collecting';
  }
  return 'ready';
}

export function migratePersistedChatTimelineActionNode(
  node: ChatTimelineNode,
  conversationId: string
): ChatTimelineNode {
  if (node.kind !== 'action') {
    return node;
  }
  const raw = node as unknown as Record<string, unknown>;
  if (typeof raw.actionId === 'string' && typeof raw.policy === 'string') {
    return node;
  }
  const actionId = toText(raw.actionId) || legacyActionId(node.id);
  const legacyTitle = normalizeConversationActionName(raw.title);
  const actionName = legacyTitle && legacyTitle !== 'action' ? legacyTitle : actionId;
  const definition = resolveConversationActionDefinition(actionName);
  const argsText = toText(raw.argsText || raw.body);
  const args = parseObject(argsText);
  const status = legacyActionStatus(raw);
  return {
    id: createChatTimelineActionNodeId(conversationId, actionId),
    kind: 'action',
    actionId,
    actionName,
    target: targetForAction(actionName, args, [raw], undefined),
    status: status === 'ready' && definition.policy !== 'allowed' ? 'blocked' : status,
    policy: definition.policy,
    policyReason: definition.policyReason,
    executorKind: definition.executorKind,
    args,
    argsText,
    result: null,
    resultText: '',
    errorReason: status === 'failed' ? toText(raw.errorReason || raw.body) : '',
    lastSequence: null,
    lastEventSignature: '',
    runId: node.runId,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    order: node.order,
    lifecycle: getChatTimelineActionLifecycle(status)
  };
}
