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
  chatId?: string | null;
  message: string;
  references?: unknown[];
  agentKey?: string | null;
  teamId?: string | null;
  planningMode?: boolean;
  accessLevel?: ChatQueryAccessLevel;
  model?: ChatQueryModelOverride;
};

type ChatQueryPayload = {
  requestId: string;
  chatId?: string;
  message: string;
  references?: unknown[];
  agentKey?: string;
  teamId?: string;
  planningMode?: true;
  accessLevel?: Exclude<ChatQueryAccessLevel, 'default'>;
  model?: ChatQueryModelOverride;
  role: 'user';
  stream: true;
};

type ChatAttachPayloadInput = {
  runId: string;
  agentKey: string;
  lastSeq?: number;
};

type ChatAttachPayload = {
  runId: string;
  agentKey: string;
  lastSeq: number;
};

let unsubscribePush: SharedWsSubscription | null = null;
let unsubscribeStatus: SharedWsSubscription | null = null;

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
  const teamId = String(input.teamId || '').trim();
  const agentKey = teamId ? '' : String(input.agentKey || '').trim();
  const accessLevel = normalizeQueryAccessLevel(input.accessLevel);
  const model = compactQueryModelOverride(input.model);

  return {
    requestId: String(input.requestId || '').trim(),
    chatId: String(input.chatId || '').trim() || undefined,
    message: input.message,
    ...(input.references !== undefined ? { references: input.references } : {}),
    ...(teamId ? { teamId } : {}),
    ...(agentKey ? { agentKey } : {}),
    ...(input.planningMode === true ? { planningMode: true } : {}),
    ...(accessLevel ? { accessLevel } : {}),
    ...(model ? { model } : {}),
    role: 'user',
    stream: true
  };
}

export function buildChatAttachPayload(input: ChatAttachPayloadInput): ChatAttachPayload {
  return {
    runId: String(input.runId || '').trim(),
    agentKey: String(input.agentKey || '').trim(),
    lastSeq: Number.isFinite(Number(input.lastSeq)) ? Number(input.lastSeq) : 0
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

function clearChatSubscriptions() {
  unsubscribePush?.();
  unsubscribeStatus?.();
  unsubscribePush = null;
  unsubscribeStatus = null;
}

export function getChatTransportStatus(): ChatSocketStatus {
  return sharedWsTransport.getStatus();
}

export function updateChatTransportAuth(configInput: ChatTransportConfig): boolean {
  return sharedWsTransport.updateTransport(configInput);
}

export async function startChatPushTransport(
  config: ChatTransportConfig,
  callbacks: ChatTransportCallbacks = {}
): Promise<void> {
  clearChatSubscriptions();
  if (callbacks.onPush) {
    unsubscribePush = sharedWsTransport.subscribePush((frame) => {
      callbacks.onPush?.(toWsPushEvent(frame as WsPushFrame));
    });
  }
  if (callbacks.onStatusChange) {
    unsubscribeStatus = sharedWsTransport.subscribeStatus(callbacks.onStatusChange);
  }
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

export function stopChatPushTransport() {
  clearChatSubscriptions();
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
    onEvent: (event) => options.onEvent(normalizeTransportEvent(event)),
    onDone: options.onDone,
    onError: options.onError
  });
}

export async function attachChatRun(
  options: StreamOptions & { payload: { runId: string; agentKey: string; lastSeq?: number } }
): Promise<SharedWsStreamHandle> {
  return sharedWsTransport.startStream<Record<string, unknown>>({
    transport: options,
    type: '/api/attach',
    payload: buildChatAttachPayload(options.payload),
    signal: options.signal,
    namespace: getTransportNamespace(options),
    onEvent: (event) => options.onEvent(normalizeTransportEvent(event)),
    onDone: options.onDone,
    onError: options.onError
  });
}
