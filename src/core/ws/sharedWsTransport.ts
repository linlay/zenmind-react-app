import { WsClient, type WsPushFrame, type WsSocketStatus } from './wsClient.ts';
import type { WsTransportConfig, WsTransportNamespace } from './wsTransportConfig.ts';

export type SharedWsRequestOptions = {
  transport: WsTransportConfig;
  namespace?: WsTransportNamespace;
  type: string;
  payload?: unknown;
  signal?: AbortSignal;
};

export type SharedWsSubscription = () => void;

export type SharedWsStreamOptions<T> = SharedWsRequestOptions & {
  onEvent: (event: T) => void;
  onDone?: (reason: string, lastSeq: number) => void;
  onError?: (error: Error) => void;
  requestId?: string;
};

export type SharedWsStreamHandle = {
  abort: () => void;
};

type SharedWsPushListener = (frame: unknown) => void;
type SharedWsStatusListener = (status: WsSocketStatus) => void;
type ClientEntry = {
  client: WsClient;
  endpointKey: string;
  transport: WsTransportConfig;
};

type StreamQueueItem<T> = { kind: 'event'; value: T } | { kind: 'done' } | { kind: 'error'; error: Error };

function normalizeBackendUrl(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/\/+$/, '');
}

function normalizeDesktopEndpointUrl(raw: string): string {
  const value = String(raw || '').trim();
  if (!value) {
    return '';
  }

  try {
    const url = new URL(value);
    url.hash = '';
    url.searchParams.delete('token');
    return url.toString();
  } catch {
    return value;
  }
}

function normalizeConnectionKey(raw: string | undefined): string {
  return String(raw || '').trim();
}

function normalizeTransport(transport: WsTransportConfig): WsTransportConfig {
  const accessToken = String(transport.accessToken || '').trim();
  if (transport.kind === 'desktop-ws') {
    return {
      kind: 'desktop-ws',
      wsUrl: normalizeDesktopEndpointUrl(transport.wsUrl),
      tokenMode: transport.tokenMode,
      accessToken,
      namespace: transport.namespace,
      connectionKey: normalizeConnectionKey(transport.connectionKey)
    };
  }

  return {
    kind: 'agent-platform',
    backendUrl: normalizeBackendUrl(transport.backendUrl),
    wsUrl: normalizeDesktopEndpointUrl(transport.wsUrl || ''),
    accessToken,
    connectionKey: normalizeConnectionKey(transport.connectionKey)
  };
}

function getEndpointKey(transport: WsTransportConfig): string {
  if (transport.kind === 'desktop-ws') {
    return `desktop-ws:${normalizeDesktopEndpointUrl(transport.wsUrl)}:${transport.tokenMode}`;
  }
  return `agent-platform:${normalizeDesktopEndpointUrl(
    transport.wsUrl || ''
  )}:${normalizeBackendUrl(transport.backendUrl)}`;
}

function getClientKey(transport: WsTransportConfig): string {
  const connectionKey = normalizeConnectionKey(transport.connectionKey);
  return connectionKey ? `${connectionKey}:${getEndpointKey(transport)}` : getEndpointKey(transport);
}

function createAbortError(message = 'The operation was aborted.'): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function toError(error: unknown, fallback = 'WebSocket stream failed'): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error || fallback));
}

export function createSharedWsTransport() {
  const clients = new Map<string, ClientEntry>();
  const pushListeners = new Map<
    SharedWsPushListener,
    { clientKey: string | null }
  >();
  const statusListeners = new Map<
    SharedWsStatusListener,
    { clientKey: string | null }
  >();

  const dispatchPush = (clientKey: string, frame: WsPushFrame) => {
    pushListeners.forEach((subscription, listener) => {
      if (!subscription.clientKey || subscription.clientKey === clientKey) {
        listener(frame);
      }
    });
  };

  const dispatchStatus = (clientKey: string, status: WsSocketStatus) => {
    statusListeners.forEach((subscription, listener) => {
      if (!subscription.clientKey || subscription.clientKey === clientKey) {
        listener(status);
      }
    });
  };

  const ensureClient = (transportInput: WsTransportConfig): WsClient => {
    const transport = normalizeTransport(transportInput);
    const clientKey = getClientKey(transport);
    const existing = clients.get(clientKey);
    if (existing) {
      existing.transport = transport;
      existing.client.updateOptions({
        transport,
        onPush: (frame) => dispatchPush(clientKey, frame),
        onStatusChange: (status) => dispatchStatus(clientKey, status)
      });
      return existing.client;
    }

    const client = new WsClient({
      transport,
      onPush: (frame) => dispatchPush(clientKey, frame),
      onStatusChange: (status) => dispatchStatus(clientKey, status)
    });
    clients.set(clientKey, {
      client,
      endpointKey: getEndpointKey(transport),
      transport
    });
    return client;
  };

  const request = <T>(options: SharedWsRequestOptions): Promise<T> =>
    ensureClient(options.transport).request<T>({
      type: options.type,
      payload: options.payload,
      signal: options.signal,
      namespace: options.namespace
    });

  const connect = (transport: WsTransportConfig, signal?: AbortSignal): Promise<void> =>
    ensureClient(transport).connect(signal);

  const startStream = <T>(options: SharedWsStreamOptions<T>): SharedWsStreamHandle =>
    ensureClient(options.transport).stream({
      type: options.type,
      payload: options.payload,
      signal: options.signal,
      namespace: options.namespace,
      requestId: options.requestId,
      onEvent: (event) => options.onEvent(event as T),
      onDone: options.onDone,
      onError: options.onError
    });

  const stream = <T>(options: SharedWsRequestOptions): AsyncIterable<T> => {
    let started = false;
    let finished = false;
    let streamHandle: { abort: () => void } | null = null;
    const queue: StreamQueueItem<T>[] = [];
    const waiters = new Set<() => void>();

    const notify = () => {
      waiters.forEach((resolve) => resolve());
      waiters.clear();
    };

    const enqueue = (item: StreamQueueItem<T>) => {
      if (finished) {
        return;
      }
      if (item.kind !== 'event') {
        finished = true;
      }
      queue.push(item);
      notify();
    };

    const start = () => {
      if (started) {
        return;
      }
      started = true;
      if (options.signal?.aborted) {
        enqueue({ kind: 'error', error: createAbortError() });
        return;
      }
      streamHandle = ensureClient(options.transport).stream({
        type: options.type,
        payload: options.payload,
        signal: options.signal,
        namespace: options.namespace,
        onEvent: (event) => enqueue({ kind: 'event', value: event as T }),
        onDone: () => enqueue({ kind: 'done' }),
        onError: (error) => enqueue({ kind: 'error', error })
      });
    };

    const iterator: AsyncIterator<T> = {
      async next() {
        start();
        while (queue.length <= 0) {
          if (finished) {
            return { done: true, value: undefined as T };
          }
          await new Promise<void>((resolve) => {
            waiters.add(resolve);
          });
        }

        const item = queue.shift();
        if (!item || item.kind === 'done') {
          return { done: true, value: undefined as T };
        }
        if (item.kind === 'error') {
          throw item.error;
        }
        return { done: false, value: item.value };
      },
      async return() {
        finished = true;
        streamHandle?.abort();
        notify();
        return { done: true, value: undefined as T };
      },
      async throw(error) {
        finished = true;
        streamHandle?.abort();
        notify();
        throw toError(error);
      }
    };

    return {
      [Symbol.asyncIterator]() {
        return iterator;
      }
    };
  };

  const updateTransport = (transportInput: WsTransportConfig): boolean => {
    const transport = normalizeTransport(transportInput);
    const clientKey = getClientKey(transport);
    const entry = clients.get(clientKey);
    if (!entry || entry.endpointKey !== getEndpointKey(transport)) {
      return false;
    }

    entry.transport = transport;
    entry.client.updateOptions({ transport });
    return true;
  };

  const subscribePush = (
    listener: SharedWsPushListener,
    transport?: WsTransportConfig
  ): SharedWsSubscription => {
    pushListeners.set(listener, {
      clientKey: transport ? getClientKey(normalizeTransport(transport)) : null
    });
    return () => {
      pushListeners.delete(listener);
    };
  };

  const subscribeStatus = (
    listener: SharedWsStatusListener,
    transport?: WsTransportConfig
  ): SharedWsSubscription => {
    const clientKey = transport ? getClientKey(normalizeTransport(transport)) : null;
    statusListeners.set(listener, { clientKey });
    listener(clientKey ? clients.get(clientKey)?.client.getStatus() ?? 'idle' : getAggregateStatus());
    return () => {
      statusListeners.delete(listener);
    };
  };

  const getAggregateStatus = (): WsSocketStatus => {
    const statuses = [...clients.values()].map((entry) => entry.client.getStatus());
    if (statuses.includes('connected')) {
      return 'connected';
    }
    if (statuses.includes('connecting')) {
      return 'connecting';
    }
    if (statuses.includes('reconnecting')) {
      return 'reconnecting';
    }
    if (statuses.includes('error')) {
      return 'error';
    }
    if (statuses.includes('disconnected')) {
      return 'disconnected';
    }
    return 'idle';
  };

  const getStatus = (transport?: WsTransportConfig): WsSocketStatus => {
    if (!transport) {
      return getAggregateStatus();
    }
    const clientKey = getClientKey(normalizeTransport(transport));
    return clients.get(clientKey)?.client.getStatus() ?? 'idle';
  };

  const stop = (transport?: WsTransportConfig) => {
    if (transport) {
      const clientKey = getClientKey(normalizeTransport(transport));
      clients.get(clientKey)?.client.disconnect();
      clients.delete(clientKey);
      dispatchStatus(clientKey, 'idle');
      return;
    }

    const clientKeys = [...clients.keys()];
    clients.forEach((entry) => entry.client.disconnect());
    clients.clear();
    clientKeys.forEach((clientKey) => dispatchStatus(clientKey, 'idle'));
  };

  return {
    request,
    connect,
    startStream,
    stream,
    updateTransport,
    subscribePush,
    subscribeStatus,
    getStatus,
    stop
  };
}

export const sharedWsTransport = createSharedWsTransport();
