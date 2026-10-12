import { normalizeRequiredSkills } from '../../core/api/services/chatSkillsProtocol.ts';
import {
  hasValidRemoteChatStreamTime,
  hasValidRemoteChatPushTime,
  withRemoteChatPushInstant
} from '../../core/api/services/chatRemoteTimeProtocol.ts';
import { buildChatRunOwnerPayload } from '../../core/api/services/chatRunOwner.ts';
import type { ChatSocketStatus } from './types.ts';
import { normalizeEventType } from '../../core/api/services/chatEventProtocol.ts';
import {
  normalizeModelOptionReasoningEffort,
  normalizeModelOptionServiceTier
} from '../../core/api/services/modelOptionsProtocol.ts';
import {
  sharedWsTransport,
  type SharedWsStreamHandle,
  type SharedWsSubscription
} from '../../core/ws/sharedWsTransport.ts';
import type { WsPushFrame } from '../../core/ws/wsClient.ts';
import type { WsTransportConfig, WsTransportNamespace } from '../../core/ws/wsTransportConfig.ts';

export type ChatTransportConfig = WsTransportConfig;

type ChatTransportCallbacks = {
  onPush?: (event: Record<string, unknown>) => void;
  onProtocolError?: (event: Record<string, unknown>, error: Error) => void;
  onStatusChange?: (status: ChatSocketStatus) => void;
};

type StreamOptions = {
  signal?: AbortSignal;
  onEvent: (event: Record<string, unknown>) => void;
  onDone?: (reason: string, lastSeq: number) => void;
  onError?: (error: Error) => void;
} & ChatTransportConfig;

type RequestOptions = {
  type: string;
  payload?: unknown;
  signal?: AbortSignal;
} & ChatTransportConfig;

export type ChatQueryAccessLevel = 'default' | 'auto_approve' | 'full_access';
export type ChatQueryReasoningEffort = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH' | 'MAX';
export type ChatQueryServiceTier = string;

export type ChatQueryModelOverride = {
  key?: string;
  reasoningEffort?: ChatQueryReasoningEffort;
  serviceTier?: ChatQueryServiceTier;
};

type ChatQueryPayloadInput = {
  requestId: string;
  operationId?: string;
  chatId?: string | null;
  message: string;
  references?: unknown[];
  agentKey?: string | null;
  teamId?: string | null;
  planningMode?: boolean;
  editingMode?: boolean;
  mustUseSkills?: readonly string[];
  accessLevel?: ChatQueryAccessLevel;
  model?: ChatQueryModelOverride;
};

type ChatQueryPayload = {
  requestId: string;
  operationId?: string;
  chatId?: string;
  message: string;
  references?: unknown[];
  agentKey?: string;
  teamId?: string;
  planningMode?: true;
  editingMode?: true;
  mustUseSkills?: string[];
  accessLevel?: Exclude<ChatQueryAccessLevel, 'default'>;
  model?: ChatQueryModelOverride;
  role: 'user';
  stream: true;
};

type ChatAttachPayloadInput = {
  runId: string;
  agentKey?: string;
  teamId?: string;
  lastSeq?: number;
};

type ChatAttachPayload = {
  runId: string;
  agentKey?: string;
  teamId?: string;
  lastSeq: number;
};

const subscriptions = new Map<
  string,
  {
    unsubscribePush: SharedWsSubscription | null;
    unsubscribeStatus: SharedWsSubscription | null;
  }
>();

function getSubscriptionKey(config: ChatTransportConfig): string {
  if (config.connectionKey) {
    return config.connectionKey;
  }
  return config.kind === 'desktop-ws'
    ? `desktop-ws:${config.wsUrl}:${config.tokenMode}`
    : `agent-platform:${config.wsUrl || ''}:${config.backendUrl}`;
}

function getTransportNamespace(config: ChatTransportConfig): WsTransportNamespace | undefined {
  return config.kind === 'desktop-ws' ? config.namespace : undefined;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function normalizeTransportEvent(input: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    ...input,
    type: normalizeEventType(input.type)
  };

  if (isObjectRecord(normalized.payload)) {
    return {
      ...normalized.payload,
      ...normalized,
      type: normalizeEventType(normalized.type || normalized.payload.type)
    };
  }

  return normalized;
}

function normalizeQueryAccessLevel(value: unknown): Exclude<ChatQueryAccessLevel, 'default'> | undefined {
  const text = String(value || '').trim();
  return text === 'auto_approve' || text === 'full_access' ? text : undefined;
}

function normalizeQueryServiceTier(value: unknown): ChatQueryServiceTier | undefined {
  const tier = normalizeModelOptionServiceTier(value);
  return tier === 'STANDARD' ? undefined : tier;
}

function compactQueryModelOverride(model: ChatQueryModelOverride | undefined): ChatQueryModelOverride | undefined {
  const key = String(model?.key || '').trim();
  const reasoningEffort = normalizeModelOptionReasoningEffort(model?.reasoningEffort);
  const serviceTier = normalizeQueryServiceTier(model?.serviceTier);
  const next: ChatQueryModelOverride = {
    ...(key ? { key } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
    ...(serviceTier ? { serviceTier } : {})
  };
  return next.key || next.reasoningEffort || next.serviceTier ? next : undefined;
}

export function buildChatQueryPayload(input: ChatQueryPayloadInput): ChatQueryPayload {
  const accessLevel = normalizeQueryAccessLevel(input.accessLevel);
  const model = compactQueryModelOverride(input.model);
  const owner = buildChatRunOwnerPayload(input);
  const mustUseSkills = normalizeRequiredSkills(input.mustUseSkills);
  if (input.editingMode === true && input.planningMode === true)
    throw new Error('Editing and Planning cannot be combined');

  return {
    requestId: String(input.requestId || '').trim(),
    ...(String(input.operationId || '').trim() ? { operationId: String(input.operationId || '').trim() } : {}),
    chatId: String(input.chatId || '').trim() || undefined,
    message: input.message,
    ...(input.references !== undefined ? { references: input.references } : {}),
    ...owner,
    ...(input.planningMode === true ? { planningMode: true } : {}),
    ...(input.editingMode === true && !owner.teamId ? { editingMode: true } : {}),
    ...(mustUseSkills.length && !owner.teamId ? { mustUseSkills } : {}),
    ...(accessLevel ? { accessLevel } : {}),
    ...(model ? { model } : {}),
    role: 'user',
    stream: true
  };
}

export function buildChatAttachPayload(input: ChatAttachPayloadInput): ChatAttachPayload {
  return {
    runId: String(input.runId || '').trim(),
    ...buildChatRunOwnerPayload(input),
    lastSeq: Number.isSafeInteger(input.lastSeq) && Number(input.lastSeq) >= 0 ? Number(input.lastSeq) : 0
  };
}

export function toWsPushEvent(frame: WsPushFrame): Record<string, unknown> {
  const nestedRecord = isObjectRecord(frame.payload) ? frame.payload : isObjectRecord(frame.data) ? frame.data : {};
  const topLevel: Record<string, unknown> = { ...frame };
  delete topLevel.frame;
  delete topLevel.payload;
  delete topLevel.data;
  return normalizeTransportEvent({
    ...nestedRecord,
    ...topLevel,
    type: frame.type || nestedRecord.type
  });
}

function clearChatSubscriptions(config?: ChatTransportConfig) {
  const keys = config ? [getSubscriptionKey(config)] : [...subscriptions.keys()];
  keys.forEach((key) => {
    const subscription = subscriptions.get(key);
    subscription?.unsubscribePush?.();
    subscription?.unsubscribeStatus?.();
    subscriptions.delete(key);
  });
}

export function getChatTransportStatus(config?: ChatTransportConfig): ChatSocketStatus {
  return sharedWsTransport.getStatus(config);
}

export function updateChatTransportAuth(configInput: ChatTransportConfig): boolean {
  return sharedWsTransport.updateTransport(configInput);
}

export async function startChatPushTransport(
  config: ChatTransportConfig,
  callbacks: ChatTransportCallbacks = {}
): Promise<void> {
  clearChatSubscriptions(config);
  const subscription = {
    unsubscribePush: null as SharedWsSubscription | null,
    unsubscribeStatus: null as SharedWsSubscription | null
  };
  if (callbacks.onPush) {
    subscription.unsubscribePush = sharedWsTransport.subscribePush((frame) => {
      const event = toWsPushEvent(frame as WsPushFrame);
      if (hasValidRemoteChatPushTime(event, frame)) callbacks.onPush?.(withRemoteChatPushInstant(event));
      else callbacks.onProtocolError?.(event, new Error('Invalid remote chat push timestamp'));
    }, config);
  }
  if (callbacks.onStatusChange) {
    subscription.unsubscribeStatus = sharedWsTransport.subscribeStatus(callbacks.onStatusChange, config);
  }
  subscriptions.set(getSubscriptionKey(config), subscription);
  await sharedWsTransport.connect(config);
}

export async function requestChatTransport<T>(options: RequestOptions): Promise<T> {
  return sharedWsTransport.request<T>({
    transport: options,
    type: options.type,
    payload: options.payload,
    signal: options.signal,
    namespace: getTransportNamespace(options)
  });
}

export function stopChatPushTransport(config?: ChatTransportConfig, releaseConnection = false) {
  clearChatSubscriptions(config);
  if (releaseConnection && config) sharedWsTransport.releaseIfIdle(config);
}

export async function streamChatQuery(
  options: StreamOptions & {
    payload: ChatQueryPayloadInput;
  }
): Promise<SharedWsStreamHandle> {
  return sharedWsTransport.startStream<Record<string, unknown>>({
    transport: options,
    type: '/api/query',
    payload: buildChatQueryPayload(options.payload),
    signal: options.signal,
    namespace: getTransportNamespace(options),
    onEvent: (event) => {
      const normalized = normalizeTransportEvent(event);
      if (
        hasValidRemoteChatStreamTime(normalized) &&
        (normalized.seq === undefined || (Number.isSafeInteger(normalized.seq) && Number(normalized.seq) >= 0))
      )
        options.onEvent(normalized);
      else options.onError?.(new Error('Invalid remote chat stream timestamp'));
    },
    onDone: options.onDone,
    onError: options.onError
  });
}

export async function attachChatRun(
  options: StreamOptions & { payload: ChatAttachPayloadInput }
): Promise<SharedWsStreamHandle> {
  return sharedWsTransport.startStream<Record<string, unknown>>({
    transport: options,
    type: '/api/attach',
    payload: buildChatAttachPayload(options.payload),
    signal: options.signal,
    namespace: getTransportNamespace(options),
    onEvent: (event) => {
      const normalized = normalizeTransportEvent(event);
      if (
        (!normalized.runId || normalized.runId === options.payload.runId) &&
        hasValidRemoteChatStreamTime(normalized) &&
        (normalized.seq === undefined || (Number.isSafeInteger(normalized.seq) && Number(normalized.seq) >= 0))
      )
        options.onEvent(normalized);
      else options.onError?.(new Error('Invalid remote chat stream timestamp'));
    },
    onDone: options.onDone,
    onError: options.onError
  });
}
