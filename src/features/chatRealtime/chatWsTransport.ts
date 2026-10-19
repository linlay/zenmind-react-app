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
  chatId?: string | null;
  message: string;
  references?: unknown[];
  agentKey?: string | null;
  planningMode?: boolean;
  editingMode?: boolean;
  accessLevel?: ChatQueryAccessLevel;
  model?: ChatQueryModelOverride;
};

type ChatQueryPayload = {
  requestId: string;
  chatId?: string;
  message: string;
  references?: unknown[];
  agentKey?: string;
  planningMode?: true;
  editingMode?: boolean;
  accessLevel?: Exclude<ChatQueryAccessLevel, 'default'>;
  model?: ChatQueryModelOverride;
  role: 'user';
  stream: true;
};

type ChatAttachPayloadInput = {
  runId: string;
  chatId?: string;
  agentKey?: string;
  lastSeq?: number;
};

type ChatAttachPayload = {
  runId: string;
  chatId?: string;
  agentKey?: string;
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

  return {
    requestId: String(input.requestId || '').trim(),
    chatId: String(input.chatId || '').trim() || undefined,
    message: input.message,
    ...(input.references !== undefined ? { references: input.references } : {}),
    ...owner,
    ...(input.planningMode === true ? { planningMode: true } : {}),
    ...(typeof input.editingMode === 'boolean' ? { editingMode: input.editingMode } : {}),
    ...(accessLevel ? { accessLevel } : {}),
    ...(model ? { model } : {}),
    role: 'user',
    stream: true
  };
}

export function buildChatAttachPayload(input: ChatAttachPayloadInput): ChatAttachPayload {
  return {
    runId: String(input.runId || '').trim(),
    ...(input.chatId ? { chatId: input.chatId.trim() } : {}),
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

let nextChatStreamId = 0;

function startChatProtocolStream(
  options: StreamOptions,
  type: '/api/query' | '/api/attach',
  payload: unknown,
  initialRunId = '',
  agentKey?: string | null
): SharedWsStreamHandle {
  const requestId = `chat-stream-${Date.now().toString(36)}-${++nextChatStreamId}`;
  let runId = initialRunId;
  let ended = false;
  const finish = () => {
    ended = true;
    options.signal?.removeEventListener('abort', abort);
  };
  const handle = sharedWsTransport.startStream<Record<string, unknown>>({
    transport: options,
    type,
    payload,
    requestId,
    namespace: getTransportNamespace(options),
    onEvent: (event) => {
      const normalized = normalizeTransportEvent(event);
      if (
        (!initialRunId || !normalized.runId || normalized.runId === initialRunId) &&
        hasValidRemoteChatStreamTime(normalized) &&
        (normalized.seq === undefined || (Number.isSafeInteger(normalized.seq) && Number(normalized.seq) >= 0))
      ) {
        runId = String(normalized.runId || runId);
        options.onEvent(normalized);
      } else options.onError?.(new Error('Invalid remote chat stream timestamp'));
    },
    onDone: (reason, lastSeq) => {
      finish();
      options.onDone?.(reason, lastSeq);
    },
    onError: (error) => {
      finish();
      options.onError?.(error);
    }
  });
  function abort() {
    if (ended) return;
    finish();
    handle.abort();
    // Desktop releases this connection's consumer; AP releases only this connection's observer.
    if (options.kind === 'desktop-ws' || runId) {
      void requestChatTransport({
        ...options,
        signal: undefined,
        type: '/api/detach',
        payload: {
          ...(runId ? { runId } : {}),
          ...(options.kind === 'desktop-ws' ? { streamRequestId: requestId } : {}),
          ...buildChatRunOwnerPayload({ agentKey }),
          reason: 'surface_inactive'
        }
      }).catch(() => {});
    }
  }
  if (!ended) {
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
  }
  return { abort };
}

export async function streamChatQuery(
  options: StreamOptions & { payload: ChatQueryPayloadInput }
): Promise<SharedWsStreamHandle> {
  return startChatProtocolStream(
    options,
    '/api/query',
    buildChatQueryPayload(options.payload),
    '',
    options.payload.agentKey
  );
}

export async function attachChatRun(
  options: StreamOptions & { payload: ChatAttachPayloadInput }
): Promise<SharedWsStreamHandle> {
  return startChatProtocolStream(
    options,
    '/api/attach',
    buildChatAttachPayload(options.payload),
    options.payload.runId,
    options.payload.agentKey
  );
}
