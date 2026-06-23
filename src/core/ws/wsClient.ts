import { readPublicEnv } from '../config/runtimeEnv.ts';
import { wsDebugRecorder } from '../debug/wsDebugRecorder.ts';
import type { WsTransportConfig, WsTransportNamespace } from './wsTransportConfig.ts';

export type WsSocketStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

type WsRequestFrame = {
  ns?: WsTransportNamespace;
  frame: 'request';
  type: string;
  id: string;
  payload?: unknown;
};

type WsResponseFrame = {
  ns?: string;
  frame: 'response';
  id?: string;
  code?: number | string;
  status?: number;
  msg?: string;
  data?: unknown;
};

type WsStreamEventFrame = {
  type?: string;
  seq?: number;
  payload?: unknown;
  [key: string]: unknown;
};

type WsStreamFrame = {
  ns?: string;
  frame: 'stream';
  id?: string;
  event?: WsStreamEventFrame;
  reason?: string;
  lastSeq?: number;
};

export type WsPushFrame = {
  ns?: string;
  frame: 'push';
  type?: string;
  payload?: unknown;
  data?: unknown;
  [key: string]: unknown;
};

type WsErrorFrame = {
  ns?: string;
  frame: 'error';
  id?: string;
  code?: number | string;
  status?: number;
  msg?: string;
  error?: string;
  data?: unknown;
};

type WsInboundFrame = WsResponseFrame | WsStreamFrame | WsPushFrame | WsErrorFrame;

type WebSocketLikeMessageEvent = {
  data?: unknown;
};

type WebSocketLikeCloseEvent = {
  code?: number;
  reason?: string;
};

type WebSocketLike = {
  readyState: number;
  send: (payload: string) => void;
  close: (code?: number, reason?: string) => void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: WebSocketLikeMessageEvent) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: WebSocketLikeCloseEvent) => void) | null;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
  abortHandler?: () => void;
};

type ActiveStream = {
  onEvent: (event: Record<string, unknown>) => void;
  onDone?: (reason: string, lastSeq: number) => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
  abortHandler?: () => void;
};

type WsClientOptions = {
  transport: WsTransportConfig;
  onPush?: (frame: WsPushFrame) => void;
  onStatusChange?: (status: WsSocketStatus) => void;
  createWebSocket?: (url: string, protocols?: string | string[]) => WebSocketLike;
  heartbeatTimeoutMs?: number;
  healthCheckIntervalMs?: number;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  requestTimeoutMs?: number;
};

type ResolvedWsConnection = {
  url: string;
  protocols?: string | string[];
};

export class WsClientDisconnectedError extends Error {
  constructor(message = 'WebSocket transport disconnected') {
    super(message);
    this.name = 'WsClientDisconnectedError';
  }
}

export class WsClientRequestTimeoutError extends Error {
  constructor(message = 'WebSocket request timeout') {
    super(message);
    this.name = 'WsClientRequestTimeoutError';
  }
}

function createAbortError(message = 'The operation was aborted.'): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function toError(error: unknown, fallback = 'WebSocket transport failed'): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error || fallback));
}

function normalizeBackendUrl(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/\/+$/, '');
}

function resolveAgentPlatformWsConnection(
  backendUrlInput: string,
  accessTokenInput: string
): ResolvedWsConnection | null {
  const backendUrl = normalizeBackendUrl(backendUrlInput);
  const explicitDevUrl =
    typeof __DEV__ !== 'undefined' && __DEV__ ? String(readPublicEnv('EXPO_PUBLIC_CHAT_WS_URL') || '').trim() : '';
  const baseUrl = explicitDevUrl || backendUrl;
  if (!baseUrl) {
    return null;
  }

  try {
    const url = new URL(baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.hash = '';
    if (!explicitDevUrl) {
      url.pathname = '/ap/ws';
      url.search = '';
    }
    const accessToken = String(accessTokenInput || '').trim();
    if (accessToken) {
      url.searchParams.set('token', accessToken);
    }
    return { url: url.toString() };
  } catch {
    return null;
  }
}

function resolveDesktopWsConnection(
  config: Extract<WsTransportConfig, { kind: 'desktop-ws' }>
): ResolvedWsConnection | null {
  const accessToken = String(config.accessToken || '').trim();
  if (!accessToken) {
    return null;
  }

  try {
    const url = new URL(String(config.wsUrl || '').trim());
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
      return null;
    }
    url.hash = '';
    url.searchParams.delete('token');
    if (config.tokenMode === 'query') {
      url.searchParams.set('token', accessToken);
    }
    return {
      url: url.toString(),
      protocols: config.tokenMode === 'subprotocol' ? [`bearer.${accessToken}`] : undefined
    };
  } catch {
    return null;
  }
}

function resolveWsConnection(config: WsTransportConfig): ResolvedWsConnection | null {
  if (config.kind === 'desktop-ws') {
    return resolveDesktopWsConnection(config);
  }
  return resolveAgentPlatformWsConnection(config.backendUrl, config.accessToken);
}

function createFrameId(kind: 'request' | 'stream'): string {
  return `${kind === 'request' ? 'wsr' : 'wss'}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function normalizeFrameCode(frame: WsResponseFrame | WsErrorFrame): number {
  if (typeof frame.code === 'number' && Number.isFinite(frame.code)) {
    return frame.code;
  }
  const numeric = Number(frame.code);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toFrameError(frame: WsResponseFrame | WsErrorFrame): Error {
  const message = String(frame.msg || ('error' in frame ? frame.error : '') || '').trim();
  const error = new Error(
    message || (frame.status ? `WebSocket request failed (${frame.status})` : 'WebSocket request failed')
  ) as Error & {
    status?: number;
    code?: number | string;
    data?: unknown;
  };
  if (typeof frame.status === 'number') {
    error.status = frame.status;
  }
  if (frame.code != null) {
    error.code = frame.code;
  }
  if ('data' in frame) {
    error.data = frame.data;
  }
  return error;
}

function toStreamEvent(frameEvent: WsStreamEventFrame): Record<string, unknown> {
  const payload = isObjectRecord(frameEvent.payload) ? frameEvent.payload : {};
  const rest: Record<string, unknown> = { ...frameEvent };
  delete rest.payload;
  return {
    ...payload,
    ...rest,
    type: String(frameEvent.type || payload.type || ''),
    seq:
      typeof frameEvent.seq === 'number'
        ? frameEvent.seq
        : Number.isFinite(Number(payload.seq))
          ? Number(payload.seq)
          : undefined
  };
}

export class WsClient {
  private transport: WsTransportConfig;
  private readonly createWebSocket: (url: string, protocols?: string | string[]) => WebSocketLike;
  private socket: WebSocketLike | null = null;
  private connectPromise: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly activeStreams = new Map<string, ActiveStream>();
  private expectedClose = false;
  private reconnectAttempt = 0;
  private lastSeenAt = 0;
  private status: WsSocketStatus = 'idle';
  private onPush?: (frame: WsPushFrame) => void;
  private onStatusChange?: (status: WsSocketStatus) => void;
  private readonly heartbeatTimeoutMs: number;
  private readonly healthCheckIntervalMs: number;
  private readonly reconnectBaseDelayMs: number;
  private readonly reconnectMaxDelayMs: number;
  private readonly requestTimeoutMs: number;

  constructor(options: WsClientOptions) {
    this.transport = options.transport;
    this.createWebSocket =
      options.createWebSocket ||
      ((url, protocols) =>
        protocols
          ? (new WebSocket(url, protocols) as unknown as WebSocketLike)
          : (new WebSocket(url) as unknown as WebSocketLike));
    this.onPush = options.onPush;
    this.onStatusChange = options.onStatusChange;
    this.heartbeatTimeoutMs = Math.max(1_000, options.heartbeatTimeoutMs ?? 45_000);
    this.healthCheckIntervalMs = Math.max(1_000, options.healthCheckIntervalMs ?? 5_000);
    this.reconnectBaseDelayMs = Math.max(100, options.reconnectBaseDelayMs ?? 1_000);
    this.reconnectMaxDelayMs = Math.max(this.reconnectBaseDelayMs, options.reconnectMaxDelayMs ?? 30_000);
    this.requestTimeoutMs = Math.max(1, options.requestTimeoutMs ?? 30_000);
  }

  updateOptions(options: Partial<Pick<WsClientOptions, 'transport' | 'onPush' | 'onStatusChange'>>) {
    if ('transport' in options && options.transport) {
      this.transport = options.transport;
    }
    if ('onPush' in options) {
      this.onPush = options.onPush;
    }
    if ('onStatusChange' in options) {
      this.onStatusChange = options.onStatusChange;
    }
  }

  getStatus() {
    return this.status;
  }

  connect(signal?: AbortSignal) {
    return this.ensureConnected(signal);
  }

  disconnect() {
    this.expectedClose = true;
    this.clearReconnectTimer();
    this.clearHealthCheckTimer();
    this.cleanupPending(new WsClientDisconnectedError());

    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      try {
        if (this.socket.readyState <= 1) {
          this.socket.close(1000, 'ws transport disconnect');
        }
      } catch {
        // Ignore half-open close failures.
      }
    }

    this.socket = null;
    this.connectPromise = null;
    this.reconnectAttempt = 0;
    this.setStatus('disconnected');
  }

  async request<T>(opts: {
    type: string;
    payload?: unknown;
    signal?: AbortSignal;
    namespace?: WsTransportNamespace;
  }): Promise<T> {
    await this.ensureConnected(opts.signal);
    const id = createFrameId('request');

    return new Promise<T>((resolve, reject) => {
      const cleanup = () => {
        const current = this.pendingRequests.get(id);
        if (current?.timer) {
          clearTimeout(current.timer);
        }
        if (current?.abortHandler && opts.signal) {
          opts.signal.removeEventListener('abort', current.abortHandler);
        }
        this.pendingRequests.delete(id);
      };

      const abortHandler = () => {
        cleanup();
        reject(createAbortError());
      };

      if (opts.signal?.aborted) {
        abortHandler();
        return;
      }

      if (opts.signal) {
        opts.signal.addEventListener('abort', abortHandler, { once: true });
      }

      this.pendingRequests.set(id, {
        resolve: (value) => {
          cleanup();
          resolve(value as T);
        },
        reject: (reason) => {
          cleanup();
          reject(reason);
        },
        abortHandler,
        timer: setTimeout(() => {
          cleanup();
          reject(new WsClientRequestTimeoutError(`WebSocket request timeout: ${opts.type}`));
        }, this.requestTimeoutMs)
      });

      try {
        this.sendFrame(
          {
            frame: 'request',
            type: opts.type,
            id,
            payload: opts.payload
          },
          opts.namespace
        );
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }

  stream(opts: {
    type: string;
    payload?: unknown;
    signal?: AbortSignal;
    onEvent: (event: Record<string, unknown>) => void;
    onDone?: (reason: string, lastSeq: number) => void;
    onError?: (error: Error) => void;
    requestId?: string;
    namespace?: WsTransportNamespace;
  }) {
    const id = opts.requestId || createFrameId('stream');
    let aborted = false;

    const abort = () => {
      if (aborted) {
        return;
      }
      aborted = true;
      this.cleanupStream(id, opts.signal);
    };

    const abortHandler = () => {
      abort();
      opts.onError?.(createAbortError());
    };

    if (opts.signal?.aborted) {
      abortHandler();
      return { abort };
    }

    this.activeStreams.set(id, {
      onEvent: opts.onEvent,
      onDone: opts.onDone,
      onError: opts.onError,
      signal: opts.signal,
      abortHandler
    });

    if (opts.signal) {
      opts.signal.addEventListener('abort', abortHandler, { once: true });
    }

    void this.ensureConnected(opts.signal)
      .then(() => {
        if (aborted || !this.activeStreams.has(id)) {
          return;
        }
        try {
          this.sendFrame(
            {
              frame: 'request',
              type: opts.type,
              id,
              payload: opts.payload
            },
            opts.namespace
          );
        } catch (error) {
          this.cleanupStream(id, opts.signal);
          opts.onError?.(toError(error));
        }
      })
      .catch((error) => {
        abort();
        opts.onError?.(toError(error));
      });

    return { abort };
  }

  private async ensureConnected(signal?: AbortSignal): Promise<void> {
    if (this.socket?.readyState === 1) {
      return;
    }

    if (signal?.aborted) {
      throw createAbortError();
    }

    if (this.connectPromise) {
      return this.waitForConnection(signal);
    }

    const connection = resolveWsConnection(this.transport);
    if (!connection) {
      this.setStatus('disconnected');
      throw new WsClientDisconnectedError('WebSocket transport is not initialized');
    }

    this.expectedClose = false;
    this.lastSeenAt = Date.now();
    this.setStatus(this.status === 'reconnecting' ? 'reconnecting' : 'connecting');

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const socket = this.createWebSocket(connection.url, connection.protocols);
      this.socket = socket;
      let opened = false;

      socket.onopen = () => {
        opened = true;
        this.lastSeenAt = Date.now();
        this.reconnectAttempt = 0;
        this.startHealthCheck();
        this.setStatus('connected');
        socket.onmessage = this.handleMessage;
        socket.onclose = (event) => {
          this.handleClose(event);
        };
        socket.onerror = () => {
          this.handleSocketError();
        };
        resolve();
      };

      socket.onerror = () => {
        if (opened) {
          this.handleSocketError();
          return;
        }
        this.socket = null;
        this.setStatus('error');
        this.scheduleReconnect();
        reject(new WsClientDisconnectedError('WebSocket connection failed'));
      };

      socket.onclose = (event) => {
        if (opened) {
          this.handleClose(event);
          return;
        }
        this.socket = null;
        if (!this.expectedClose) {
          this.setStatus('error');
          this.scheduleReconnect();
        } else {
          this.expectedClose = false;
          this.setStatus('disconnected');
        }
        reject(new WsClientDisconnectedError('WebSocket transport disconnected'));
      };
    }).finally(() => {
      this.connectPromise = null;
    });

    return this.waitForConnection(signal);
  }

  private waitForConnection(signal?: AbortSignal): Promise<void> {
    if (!this.connectPromise) {
      return Promise.resolve();
    }
    if (!signal) {
      return this.connectPromise;
    }

    return new Promise<void>((resolve, reject) => {
      const abortHandler = () => {
        signal.removeEventListener('abort', abortHandler);
        reject(createAbortError());
      };

      if (signal.aborted) {
        abortHandler();
        return;
      }

      signal.addEventListener('abort', abortHandler, { once: true });
      this.connectPromise!.then(() => {
        signal.removeEventListener('abort', abortHandler);
        resolve();
      }).catch((error) => {
        signal.removeEventListener('abort', abortHandler);
        reject(error);
      });
    });
  }

  private readonly handleMessage = (event: WebSocketLikeMessageEvent) => {
    this.lastSeenAt = Date.now();
    const raw = typeof event.data === 'string' ? event.data : String(event.data || '');
    let frame: WsInboundFrame;

    try {
      frame = JSON.parse(raw) as WsInboundFrame;
    } catch {
      wsDebugRecorder.recordParseError(raw);
      return;
    }

    wsDebugRecorder.recordIncomingFrame(frame, raw);

    if (frame.frame === 'response') {
      const pending = frame.id ? this.pendingRequests.get(frame.id) : null;
      if (!pending || !frame.id) {
        return;
      }
      if (normalizeFrameCode(frame) !== 0) {
        pending.reject(toFrameError(frame));
        return;
      }
      pending.resolve(frame.data);
      return;
    }

    if (frame.frame === 'stream') {
      const stream = frame.id ? this.activeStreams.get(frame.id) : null;
      if (!stream || !frame.id) {
        return;
      }
      if (frame.event) {
        stream.onEvent(toStreamEvent(frame.event));
      }
      if (frame.reason) {
        stream.onDone?.(frame.reason, typeof frame.lastSeq === 'number' ? frame.lastSeq : 0);
        this.cleanupStream(frame.id);
      }
      return;
    }

    if (frame.frame === 'push') {
      this.onPush?.(frame);
      return;
    }

    if (frame.frame === 'error') {
      const error = toFrameError(frame);
      if (frame.id) {
        const pending = this.pendingRequests.get(frame.id);
        if (pending) {
          pending.reject(error);
          return;
        }
        const stream = this.activeStreams.get(frame.id);
        if (stream) {
          stream.onError?.(error);
          this.cleanupStream(frame.id);
          return;
        }
      }
      this.setStatus('error');
    }
  };

  private readonly handleClose = (event?: WebSocketLikeCloseEvent) => {
    this.clearHealthCheckTimer();
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
    }
    this.socket = null;
    this.connectPromise = null;

    if (this.expectedClose) {
      this.expectedClose = false;
      this.setStatus('disconnected');
      return;
    }

    this.setStatus('error');
    this.cleanupPending(new WsClientDisconnectedError());
    this.scheduleReconnect(event);
  };

  private readonly handleSocketError = () => {
    if (this.status === 'connecting') {
      return;
    }
    this.setStatus('error');
  };

  private getDefaultNamespace(): WsTransportNamespace | undefined {
    return this.transport.kind === 'desktop-ws' ? this.transport.namespace : undefined;
  }

  private sendFrame(frame: WsRequestFrame, namespace?: WsTransportNamespace) {
    if (!this.socket || this.socket.readyState !== 1) {
      throw new WsClientDisconnectedError('WebSocket transport is not connected');
    }
    const resolvedNamespace = namespace || this.getDefaultNamespace();
    const outgoingFrame = resolvedNamespace ? { ...frame, ns: resolvedNamespace } : frame;
    const payload = JSON.stringify(outgoingFrame);
    wsDebugRecorder.recordOutgoingFrame(outgoingFrame, payload);
    this.socket.send(payload);
  }

  private setStatus(status: WsSocketStatus) {
    if (this.status === status) {
      return;
    }
    this.status = status;
    wsDebugRecorder.recordStatus(status);
    this.onStatusChange?.(status);
  }

  private cleanupPending(error: Error) {
    for (const [id, pending] of this.pendingRequests.entries()) {
      pending.reject(error);
      this.pendingRequests.delete(id);
    }
    for (const [id, stream] of this.activeStreams.entries()) {
      stream.onError?.(error);
      this.activeStreams.delete(id);
    }
  }

  private cleanupStream(id: string, signal?: AbortSignal) {
    const stream = this.activeStreams.get(id);
    if (!stream) {
      return;
    }
    const activeSignal = signal || stream.signal;
    if (stream.abortHandler && activeSignal) {
      activeSignal.removeEventListener('abort', stream.abortHandler);
    }
    this.activeStreams.delete(id);
  }

  private scheduleReconnect(_event?: WebSocketLikeCloseEvent) {
    if (this.reconnectTimer || this.expectedClose) {
      return;
    }

    const delay = Math.min(this.reconnectBaseDelayMs * 2 ** this.reconnectAttempt, this.reconnectMaxDelayMs);
    this.reconnectAttempt += 1;
    this.setStatus('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect().catch(() => {
        // Keep retrying via the built-in reconnect schedule.
      });
    }, delay);
  }

  private clearReconnectTimer() {
    if (!this.reconnectTimer) {
      return;
    }
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private startHealthCheck() {
    this.clearHealthCheckTimer();
    this.healthCheckTimer = setInterval(() => {
      if (!this.socket || this.socket.readyState !== 1) {
        return;
      }
      if (Date.now() - this.lastSeenAt <= this.heartbeatTimeoutMs) {
        return;
      }
      try {
        this.socket.close(4000, 'heartbeat timeout');
      } catch {
        // Ignore close failures and let the socket tear down naturally.
      }
    }, this.healthCheckIntervalMs);
  }

  private clearHealthCheckTimer() {
    if (!this.healthCheckTimer) {
      return;
    }
    clearInterval(this.healthCheckTimer);
    this.healthCheckTimer = null;
  }
}
