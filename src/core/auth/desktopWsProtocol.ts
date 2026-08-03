import { normalizeApiBaseUrl } from '../config/endpoint.ts';

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

export type DesktopWsPairingPayload = {
  v: 2;
  kind: 'desktop-ws';
  apiBaseUrl: string;
  wsUrl: string;
  tokenMode: DesktopWsTokenMode;
  token: string;
  expiresAtMs: number;
  desktopDeviceId: string;
};

export type ParsedPairingPayload = {
  transportKind: 'desktop-ws';
  payload: DesktopWsPairingPayload;
};

const DESKTOP_WS_PAIRING_PREFIX = 'zmpair:v2:';
const DESKTOP_WS_PATH = '/ws';
const INVALID_PAIRING_MESSAGE = '二维码内容格式不正确';
const MISSING_DESKTOP_WS_PAIRING_MESSAGE = '二维码缺少必要 Desktop WS 配对字段或已过期';

type BufferCtor = {
  from(input: string, encoding?: string): { toString(encoding?: string): string };
};

function bufferCtor(): BufferCtor | null {
  const candidate = (globalThis as { Buffer?: BufferCtor }).Buffer;
  return candidate && typeof candidate.from === 'function' ? candidate : null;
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeHttpBaseUrl(value: unknown): string {
  return normalizeApiBaseUrl(readText(value));
}

function encodeBase64Url(text: string): string {
  const buffer = bufferCtor();
  if (buffer) {
    return buffer.from(text, 'utf8').toString('base64url');
  }

  const bytes = new TextEncoder().encode(text);
  const chunks: string[] = [];
  for (let index = 0; index < bytes.length; index += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + 0x8000)));
  }
  return btoa(chunks.join('')).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

function decodeBase64UrlToText(value: string): string {
  const normalized = readText(value).replace(/-/gu, '+').replace(/_/gu, '/');
  const padded = `${normalized}${'='.repeat((4 - (normalized.length % 4)) % 4)}`;
  const buffer = bufferCtor();
  if (buffer) {
    return buffer.from(padded, 'base64').toString('utf8');
  }

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
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

export function deriveDesktopApiBaseUrlFromWsUrl(value: unknown): string {
  const normalizedWsUrl = normalizeDesktopWsUrlInput(value);
  if (!normalizedWsUrl) {
    return '';
  }

  try {
    const url = new URL(normalizedWsUrl);
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/u, '');
  } catch {
    return '';
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
    protocols: tokenMode === 'subprotocol' && normalizedToken ? [`bearer.${normalizedToken}`] : undefined,
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
    payload: payload === undefined ? {} : payload,
  };
}

export function encodePairingPayloadV2(payload: DesktopWsPairingPayload): string {
  return `${DESKTOP_WS_PAIRING_PREFIX}${encodeBase64Url(JSON.stringify(payload))}`;
}

function parsePairingJson(payloadText: string): unknown {
  const text = readText(payloadText);
  if (!text) {
    throw new Error(INVALID_PAIRING_MESSAGE);
  }

  try {
    if (text.startsWith(DESKTOP_WS_PAIRING_PREFIX)) {
      return JSON.parse(decodeBase64UrlToText(text.slice(DESKTOP_WS_PAIRING_PREFIX.length)));
    }
    return JSON.parse(text);
  } catch {
    throw new Error(INVALID_PAIRING_MESSAGE);
  }
}

function parseDesktopWsPairingPayload(record: Record<string, unknown>): DesktopWsPairingPayload {
  const expiresAtMs = Number(record.expiresAtMs);
  const wsUrl = normalizeDesktopWsUrlInput(record.wsUrl);
  const payload: DesktopWsPairingPayload = {
    v: 2,
    kind: 'desktop-ws',
    apiBaseUrl: deriveDesktopApiBaseUrlFromWsUrl(wsUrl) || normalizeHttpBaseUrl(record.apiBaseUrl),
    wsUrl,
    tokenMode: normalizeDesktopWsTokenMode(record.tokenMode),
    token: readText(record.token),
    expiresAtMs,
    desktopDeviceId: readText(record.desktopDeviceId),
  };

  if (
    !payload.wsUrl ||
    !payload.apiBaseUrl ||
    !payload.token ||
    !payload.desktopDeviceId ||
    !Number.isFinite(payload.expiresAtMs) ||
    payload.expiresAtMs <= Date.now()
  ) {
    throw new Error(MISSING_DESKTOP_WS_PAIRING_MESSAGE);
  }

  return payload;
}

export function parsePairingPayload(payloadText: string): ParsedPairingPayload {
  const parsed = parsePairingJson(payloadText);
  if (!isObjectRecord(parsed)) {
    throw new Error(INVALID_PAIRING_MESSAGE);
  }

  if (Number(parsed.v) !== 2 || readText(parsed.kind) !== 'desktop-ws') {
    throw new Error('仅支持新版 Desktop WS 二维码');
  }

  return {
    transportKind: 'desktop-ws',
    payload: parseDesktopWsPairingPayload(parsed),
  };
}
