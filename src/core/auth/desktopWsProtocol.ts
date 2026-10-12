export type DesktopWsNamespace = 'd' | 'ap' | 'wa';
export type DesktopWsTokenMode = 'query' | 'subprotocol';

export type DesktopBusinessFrame = {
  ns: DesktopWsNamespace;
  frame: 'request';
  type: string;
  id: string;
  payload: unknown;
};

export type DesktopTokenTransport = {
  url: string;
  tokenMode: DesktopWsTokenMode;
  protocols?: string[];
};

const DESKTOP_WS_PATH = '/ws';

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeDesktopWsTokenMode(value: unknown): DesktopWsTokenMode {
  return value === 'subprotocol' ? 'subprotocol' : 'query';
}

export function normalizeDesktopWsUrlInput(value: unknown, fallback = ''): string {
  const trimmed = readText(value);
  if (!trimmed) {
    return fallback;
  }
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//iu.test(trimmed) ? trimmed : `wss://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    if (url.protocol === 'http:') {
      url.protocol = 'ws:';
    } else if (url.protocol === 'https:') {
      url.protocol = 'wss:';
    }
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
      return fallback;
    }
    url.pathname = DESKTOP_WS_PATH;
    url.hash = '';
    url.search = '';
    return url.toString();
  } catch {
    return fallback;
  }
}

export function applyDesktopTokenToUrl(rawUrl: string, tokenMode: DesktopWsTokenMode, token: string): string {
  const normalized = normalizeDesktopWsUrlInput(rawUrl);
  if (!normalized) {
    return '';
  }
  const url = new URL(normalized);
  const normalizedToken = readText(token);
  url.searchParams.delete('token');
  if (tokenMode === 'query' && normalizedToken) {
    url.searchParams.set('token', normalizedToken);
  }
  return url.toString();
}

export function buildDesktopTokenTransport(
  rawUrl: string,
  tokenModeInput: DesktopWsTokenMode,
  token: string
): DesktopTokenTransport {
  const tokenMode = normalizeDesktopWsTokenMode(tokenModeInput);
  const url = applyDesktopTokenToUrl(rawUrl, tokenMode, token);
  const normalizedToken = readText(token);
  return {
    url,
    tokenMode,
    protocols: tokenMode === 'subprotocol' && normalizedToken ? [`bearer.${normalizedToken}`] : undefined
  };
}

export function buildDesktopBusinessFrame(
  ns: DesktopWsNamespace,
  type: string,
  payload: unknown,
  id: string
): DesktopBusinessFrame {
  return {
    ns,
    frame: 'request',
    type,
    id,
    payload: payload === undefined ? {} : payload
  };
}
