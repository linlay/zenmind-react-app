import type { ChatSocketStatus } from './types.ts';
import { WsClient, type WsPushFrame } from './wsClient.ts';
import { normalizeEventType } from '../../core/api/services/chatEventProtocol.ts';

type ChatTransportConfig = {
  backendUrl: string;
  accessToken: string;
};

type ChatTransportCallbacks = {
  onPush?: (event: Record<string, unknown>) => void;
  onStatusChange?: (status: ChatSocketStatus) => void;
};

type StreamOptions = {
  backendUrl: string;
  accessToken: string;
  signal?: AbortSignal;
  onEvent: (event: Record<string, unknown>) => void;
  onDone?: (reason: string, lastSeq: number) => void;
  onError?: (error: Error) => void;
};

type RequestOptions = {
  backendUrl: string;
  accessToken: string;
  type: string;
  payload?: unknown;
  signal?: AbortSignal;
};

type ChatQueryPayloadInput = {
  requestId: string;
  chatId?: string | null;
  message: string;
  references?: unknown[];
  agentKey?: string | null;
  teamId?: string | null;
};

type ChatQueryPayload = {
  requestId: string;
  chatId?: string;
  message: string;
  references?: unknown[];
  agentKey?: string;
  teamId?: string;
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

let client: WsClient | null = null;
let clientBackendUrl = '';
let clientAccessToken = '';
let pushCallbacks: ChatTransportCallbacks = {};

function normalizeConfig(config: ChatTransportConfig): ChatTransportConfig {
  return {
    backendUrl: String(config.backendUrl || '')
      .trim()
      .replace(/\/+$/, ''),
    accessToken: String(config.accessToken || '').trim(),
  };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function normalizeTransportEvent(input: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    ...input,
    type: normalizeEventType(input.type),
  };

  if (isObjectRecord(normalized.payload)) {
    return {
      ...normalized.payload,
      ...normalized,
      type: normalizeEventType(normalized.type || normalized.payload.type),
    };
  }

  return normalized;
}

export function buildChatQueryPayload(input: ChatQueryPayloadInput): ChatQueryPayload {
  const teamId = String(input.teamId || '').trim();
  const agentKey = teamId ? '' : String(input.agentKey || '').trim();

  return {
    requestId: String(input.requestId || '').trim(),
    chatId: String(input.chatId || '').trim() || undefined,
    message: input.message,
    ...(input.references !== undefined ? { references: input.references } : {}),
    ...(teamId ? { teamId } : {}),
    ...(agentKey ? { agentKey } : {}),
    role: 'user',
    stream: true,
  };
}

export function buildChatAttachPayload(input: ChatAttachPayloadInput): ChatAttachPayload {
  return {
    runId: String(input.runId || '').trim(),
    agentKey: String(input.agentKey || '').trim(),
    lastSeq: Number.isFinite(Number(input.lastSeq)) ? Number(input.lastSeq) : 0,
  };
}

export function toWsPushEvent(frame: WsPushFrame): Record<string, unknown> {
  const nestedRecord = isObjectRecord(frame.payload)
    ? frame.payload
    : isObjectRecord(frame.data)
      ? frame.data
      : {};
  const topLevel: Record<string, unknown> = { ...frame };
  delete topLevel.frame;
  delete topLevel.payload;
  delete topLevel.data;
  return normalizeTransportEvent({
    ...nestedRecord,
    ...topLevel,
    type: frame.type || nestedRecord.type,
  });
}

function ensureClient(configInput: ChatTransportConfig): WsClient {
  const config = normalizeConfig(configInput);
  if (
    client &&
    clientBackendUrl === config.backendUrl &&
    clientAccessToken === config.accessToken
  ) {
    client.updateOptions({
      onPush: pushCallbacks.onPush
        ? (frame) => {
            pushCallbacks.onPush?.(toWsPushEvent(frame));
          }
        : undefined,
      onStatusChange: pushCallbacks.onStatusChange,
    });
    return client;
  }

  if (client) {
    client.disconnect();
  }

  client = new WsClient({
    backendUrl: config.backendUrl,
    accessToken: config.accessToken,
    onPush: (frame) => {
      pushCallbacks.onPush?.(toWsPushEvent(frame));
    },
    onStatusChange: (status) => {
      pushCallbacks.onStatusChange?.(status);
    },
  });
  clientBackendUrl = config.backendUrl;
  clientAccessToken = config.accessToken;
  return client;
}

export function getChatTransportStatus(): ChatSocketStatus {
  return client?.getStatus() ?? 'idle';
}

export function updateChatTransportAuth(configInput: ChatTransportConfig): boolean {
  const config = normalizeConfig(configInput);
  if (!client || clientBackendUrl !== config.backendUrl) {
    return false;
  }

  clientAccessToken = config.accessToken;
  client.updateOptions({ accessToken: config.accessToken });
  return true;
}

export async function startChatPushTransport(
  config: ChatTransportConfig,
  callbacks: ChatTransportCallbacks = {}
): Promise<void> {
  pushCallbacks = callbacks;
  const nextClient = ensureClient(config);
  await nextClient.connect();
}

export async function requestChatTransport<T>(options: RequestOptions): Promise<T> {
  const nextClient = ensureClient(options);
  return nextClient.request<T>({
    type: options.type,
    payload: options.payload,
    signal: options.signal,
  });
}

export function stopChatPushTransport() {
  pushCallbacks = {};
  if (!client) {
    return;
  }
  client.disconnect();
  client = null;
  clientBackendUrl = '';
  clientAccessToken = '';
}

export async function streamChatQuery(
  options: StreamOptions & {
    payload: ChatQueryPayloadInput;
  }
) {
  const nextClient = ensureClient(options);
  await nextClient.connect(options.signal);
  return nextClient.stream({
    type: '/api/query',
    payload: buildChatQueryPayload(options.payload),
    signal: options.signal,
    onEvent: (event) => options.onEvent(normalizeTransportEvent(event)),
    onDone: options.onDone,
    onError: options.onError,
  });
}

export async function attachChatRun(
  options: StreamOptions & { payload: { runId: string; agentKey: string; lastSeq?: number } }
) {
  const nextClient = ensureClient(options);
  await nextClient.connect(options.signal);
  return nextClient.stream({
    type: '/api/attach',
    payload: buildChatAttachPayload(options.payload),
    signal: options.signal,
    onEvent: (event) => options.onEvent(normalizeTransportEvent(event)),
    onDone: options.onDone,
    onError: options.onError,
  });
}
