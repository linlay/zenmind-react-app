export interface WebViewAuthTokenMessage {
  type: 'auth_token';
  accessToken: string;
  accessExpireAtMs?: number;
}

export interface WebViewAuthRefreshRequestMessage {
  type: 'auth_refresh_request';
  requestId: string;
  source: string;
}

export interface WebViewAuthRefreshResultMessage {
  type: 'auth_refresh_result';
  requestId: string;
  ok: boolean;
  accessToken?: string;
  error?: string;
}

export interface WebViewAuthRefreshOutcome {
  ok: boolean;
  accessToken?: string;
  error?: string;
}

function createFallbackRequestId() {
  return `wv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function parseWebViewBridgePayload(raw: unknown): Record<string, unknown> | null {
  if (!raw) {
    return null;
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }

  if (typeof raw === 'object') {
    return raw as Record<string, unknown>;
  }

  return null;
}

export function parseWebViewAuthRefreshRequest(raw: unknown): WebViewAuthRefreshRequestMessage | null {
  const payload = parseWebViewBridgePayload(raw);
  if (!payload) {
    return null;
  }

  if (String(payload.type || '') !== 'auth_refresh_request') {
    return null;
  }

  const requestId =
    typeof payload.requestId === 'string' && payload.requestId.trim()
      ? payload.requestId.trim()
      : createFallbackRequestId();
  const source =
    typeof payload.source === 'string' && payload.source.trim()
      ? payload.source.trim()
      : 'webview';

  return {
    type: 'auth_refresh_request',
    requestId,
    source
  };
}

export function createWebViewAuthTokenMessage(
  accessToken: string,
  accessExpireAtMs?: number
): WebViewAuthTokenMessage | null {
  const normalizedToken = String(accessToken || '').trim();
  if (!normalizedToken) {
    return null;
  }
  return {
    type: 'auth_token',
    accessToken: normalizedToken,
    accessExpireAtMs: Number.isFinite(accessExpireAtMs) ? Number(accessExpireAtMs) : undefined
  };
}

export function createWebViewAuthRefreshResultMessage(
  requestId: string,
  outcome: WebViewAuthRefreshOutcome
): WebViewAuthRefreshResultMessage {
  const normalizedRequestId = String(requestId || '').trim() || createFallbackRequestId();
  if (outcome.ok) {
    return {
      type: 'auth_refresh_result',
      requestId: normalizedRequestId,
      ok: true,
      accessToken: String(outcome.accessToken || '')
    };
  }
  return {
    type: 'auth_refresh_result',
    requestId: normalizedRequestId,
    ok: false,
    error: String(outcome.error || 'refresh failed')
  };
}

export function buildWebViewPostMessageScript(payload: Record<string, unknown>): string {
  return `
      try {
        window.postMessage(${JSON.stringify(payload)}, '*');
      } catch (e) {}
      true;
    `;
}

export class WebViewAuthRefreshCoordinator {
  private inFlightRefresh: Promise<WebViewAuthRefreshOutcome> | null = null;
  private readonly hardFailureMessage: string;
  private readonly refreshFn: () => Promise<string | null>;
  private readonly onHardFailure?: () => void;

  constructor(
    refreshFn: () => Promise<string | null>,
    options: {
      hardFailureMessage?: string;
      onHardFailure?: () => void;
    } = {}
  ) {
    this.refreshFn = refreshFn;
    this.onHardFailure = options.onHardFailure;
    this.hardFailureMessage = options.hardFailureMessage || '未登录或设备令牌已失效，请重新登录';
  }

  async refresh(): Promise<WebViewAuthRefreshOutcome> {
    if (this.inFlightRefresh) {
      return this.inFlightRefresh;
    }

    const task = (async () => {
      try {
        const accessToken = await this.refreshFn();
        if (!accessToken) {
          this.onHardFailure?.();
          return {
            ok: false,
            error: this.hardFailureMessage
          } satisfies WebViewAuthRefreshOutcome;
        }
        return {
          ok: true,
          accessToken
        } satisfies WebViewAuthRefreshOutcome;
      } catch (error) {
        this.onHardFailure?.();
        return {
          ok: false,
          error: String((error as Error)?.message || this.hardFailureMessage)
        } satisfies WebViewAuthRefreshOutcome;
      }
    })();

    this.inFlightRefresh = task;
    try {
      return await task;
    } finally {
      if (this.inFlightRefresh === task) {
        this.inFlightRefresh = null;
      }
    }
  }
}
