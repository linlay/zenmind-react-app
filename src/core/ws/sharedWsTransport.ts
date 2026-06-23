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

function normalizeTransport(transport: WsTransportConfig): WsTransportConfig {
  const accessToken = String(transport.accessToken || '').trim();
  if (transport.kind === 'desktop-ws') {
    return {
      kind: 'desktop-ws',
      wsUrl: normalizeDesktopEndpointUrl(transport.wsUrl),
      tokenMode: transport.tokenMode,
      accessToken,
      namespace: transport.namespace
    };
  }

  return {
    kind: 'agent-platform',
    backendUrl: normalizeBackendUrl(transport.backendUrl),
    accessToken
  };
}

function getEndpointKey(transport: WsTransportConfig): string {
  if (transport.kind === 'desktop-ws') {
    return `desktop-ws:${normalizeDesktopEndpointUrl(transport.wsUrl)}:${transport.tokenMode}`;
  }
  return `agent-platform:${normalizeBackendUrl(transport.backendUrl)}`;
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
  let client: WsClient | null = null;
  let endpointKey = '';
  const pushListeners = new Set<SharedWsPushListener>();
  const statusListeners = new Set<SharedWsStatusListener>();

  const dispatchPush = (frame: WsPushFrame) => {
    pushListeners.forEach((listener) => listener(frame));
  };

  const dispatchStatus = (status: WsSocketStatus) => {
    statusListeners.forEach((listener) => listener(status));
  };

  const ensureClient = (transportInput: WsTransportConfig): WsClient => {
    const transport = normalizeTransport(transportInput);
    const nextEndpointKey = getEndpointKey(transport);
    if (client && endpointKey === nextEndpointKey) {
      client.updateOptions({
        transport,
        onPush: dispatchPush,
        onStatusChange: dispatchStatus
      });
      return client;
    }

    if (client) {
      client.disconnect();
    }

    client = new WsClient({
      transport,
      onPush: dispatchPush,
      onStatusChange: dispatchStatus
    });
    endpointKey = nextEndpointKey;
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
    if (!client) {
      return false;
    }

    const transport = normalizeTransport(transportInput);
    if (endpointKey !== getEndpointKey(transport)) {
      return false;
    }

    client.updateOptions({ transport });
    return true;
  };

  const subscribePush = (listener: SharedWsPushListener): SharedWsSubscription => {
    pushListeners.add(listener);
    return () => {
      pushListeners.delete(listener);
    };
  };

  const subscribeStatus = (listener: SharedWsStatusListener): SharedWsSubscription => {
    statusListeners.add(listener);
    listener(client?.getStatus() ?? 'idle');
    return () => {
      statusListeners.delete(listener);
    };
  };

  const stop = () => {
    if (client) {
      client.disconnect();
    }
    client = null;
    endpointKey = '';
    pushListeners.clear();
    statusListeners.clear();
  };

  return {
    request,
    connect,
    startStream,
    stream,
    updateTransport,
    subscribePush,
    subscribeStatus,
    getStatus: (): WsSocketStatus => client?.getStatus() ?? 'idle',
    stop
  };
}

export const sharedWsTransport = createSharedWsTransport();
