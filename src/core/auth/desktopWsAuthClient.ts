import { wsDebugRecorder } from '../debug/wsDebugRecorder.ts';
import { WsClient, WsClientDisconnectedError, WsClientRequestTimeoutError } from '../ws/wsClient.ts';
import type { DesktopWsProfileTransport } from './deviceProfiles.ts';

const DESKTOP_WS_NAMESPACE = 'd';
const DESKTOP_WS_CONNECT_TIMEOUT_MS = 8_000;
const DESKTOP_WS_REQUEST_TIMEOUT_MS = 8_000;

export type DesktopWsAuthErrorCode = 'connect_timeout' | 'request_timeout' | 'connection_failed';

export class DesktopWsTransportError extends Error {
  constructor(
    readonly code: DesktopWsAuthErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'DesktopWsTransportError';
  }
}

export function isDesktopWsTransportError(error: unknown): error is DesktopWsTransportError {
  return error instanceof DesktopWsTransportError;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function getDesktopWsAuthErrorCode(error: unknown): DesktopWsAuthErrorCode | null {
  return isDesktopWsTransportError(error) ? error.code : null;
}

function createAbortError(): Error {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function getSafeEndpointLabel(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return 'invalid-endpoint';
  }
}

function mapTransportError(error: unknown): Error {
  if (isAbortError(error) || isDesktopWsTransportError(error)) {
    return error as Error;
  }
  if (error instanceof WsClientRequestTimeoutError) {
    return new DesktopWsTransportError('request_timeout', error.message);
  }
  if (error instanceof WsClientDisconnectedError) {
    return new DesktopWsTransportError('connection_failed', 'Desktop WS 连接失败');
  }
  return error instanceof Error ? error : new DesktopWsTransportError('connection_failed', 'Desktop WS 连接失败');
}

export class DesktopWsAuthClient {
  private readonly client: WsClient;
  private readonly endpointLabel: string;

  constructor(transport: DesktopWsProfileTransport) {
    this.endpointLabel = getSafeEndpointLabel(transport.wsUrl);
    this.client = new WsClient({
      transport: {
        kind: 'desktop-ws',
        wsUrl: transport.wsUrl,
        tokenMode: transport.tokenMode,
        accessToken: transport.accessToken,
        namespace: DESKTOP_WS_NAMESPACE,
        connectionKey: 'auth:desktop-ws'
      },
      requestTimeoutMs: DESKTOP_WS_REQUEST_TIMEOUT_MS
    });
  }

  async connect(signal?: AbortSignal): Promise<void> {
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort();
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, DESKTOP_WS_CONNECT_TIMEOUT_MS);

    if (signal?.aborted) {
      controller.abort();
    } else {
      signal?.addEventListener('abort', abortFromCaller, { once: true });
    }

    wsDebugRecorder.recordStatus(`auth.connecting:${this.endpointLabel}`);
    try {
      await this.client.connect(controller.signal);
      wsDebugRecorder.recordStatus(`auth.connected:${this.endpointLabel}`);
    } catch (error) {
      if (signal?.aborted) {
        wsDebugRecorder.recordStatus('auth.cancelled');
        throw createAbortError();
      }
      if (timedOut) {
        wsDebugRecorder.recordStatus(`auth.connect_timeout:${this.endpointLabel}`);
        throw new DesktopWsTransportError('connect_timeout', 'Desktop WS 连接超时');
      }
      wsDebugRecorder.recordStatus(`auth.connect_error:${this.endpointLabel}`);
      throw mapTransportError(error);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  async request<T>(type: string, payload: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
    try {
      return await this.client.request<T>({
        type,
        payload,
        signal,
        namespace: DESKTOP_WS_NAMESPACE
      });
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) {
        wsDebugRecorder.recordStatus(`auth.request_cancelled:${type}`);
        throw createAbortError();
      }
      if (error instanceof WsClientRequestTimeoutError) {
        wsDebugRecorder.recordStatus(`auth.request_timeout:${type}`);
        throw new DesktopWsTransportError('request_timeout', `Desktop WS 请求超时: ${type}`);
      }
      throw mapTransportError(error);
    }
  }

  close() {
    this.client.disconnect();
  }
}
