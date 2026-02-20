const DEV_FALLBACK_ENDPOINT_INPUT = 'http://localhost:11946';
const PROD_FALLBACK_ENDPOINT_INPUT = 'agw.linlay.cc';
const ENDPOINT_ENV_KEY = 'EXPO_PUBLIC_AGW_ENDPOINT';
export const DEFAULT_PTY_FRONTEND_PORT = '11949';

function readEndpointEnv(): string {
  const raw =
    typeof process !== 'undefined' && process?.env
      ? process.env[ENDPOINT_ENV_KEY]
      : '';
  return String(raw || '').trim().replace(/\/+$/, '');
}

function isDevRuntime(): boolean {
  if (typeof __DEV__ !== 'undefined') {
    return __DEV__;
  }
  if (typeof process !== 'undefined' && process?.env) {
    return process.env.NODE_ENV !== 'production';
  }
  return false;
}

export function getDefaultEndpointInput(): string {
  const fromEnv = readEndpointEnv();
  if (fromEnv) {
    return fromEnv;
  }
  return isDevRuntime() ? DEV_FALLBACK_ENDPOINT_INPUT : PROD_FALLBACK_ENDPOINT_INPUT;
}

export const DEFAULT_ENDPOINT_INPUT = getDefaultEndpointInput();

export function normalizeEndpointInput(raw: string | undefined | null): string {
  const text = String(raw || '').trim().replace(/\/+$/, '');
  return text || getDefaultEndpointInput();
}

export function looksLikeLocalAddress(host: string | undefined | null): boolean {
  const value = String(host || '').toLowerCase();
  if (!value) return false;

  if (
    value.startsWith('localhost') ||
    value.startsWith('127.') ||
    value.startsWith('10.') ||
    value.startsWith('192.168.')
  ) {
    return true;
  }

  const match172 = value.match(/^172\.(\d{1,2})\./);
  if (match172) {
    const second = Number(match172[1]);
    if (second >= 16 && second <= 31) {
      return true;
    }
  }

  return /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/.test(value);
}

export function toBackendBaseUrl(endpointInput: string | undefined | null): string {
  const normalized = normalizeEndpointInput(endpointInput);
  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  const scheme = looksLikeLocalAddress(normalized) ? 'http' : 'https';
  return `${scheme}://${normalized}`;
}

export function toDefaultPtyWebUrl(endpointInput: string | undefined | null): string {
  const backendBase = toBackendBaseUrl(endpointInput);
  try {
    const url = new URL(backendBase);
    url.port = DEFAULT_PTY_FRONTEND_PORT;
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return `http://127.0.0.1:${DEFAULT_PTY_FRONTEND_PORT}`;
  }
}

export function normalizePtyUrlInput(
  raw: string | undefined | null,
  endpointInput: string = getDefaultEndpointInput()
): string {
  const text = String(raw || '').trim().replace(/\/+$/, '');
  if (!text) {
    return toDefaultPtyWebUrl(endpointInput);
  }

  if (text.startsWith('/')) {
    const backend = toBackendBaseUrl(endpointInput).replace(/\/+$/, '');
    return `${backend}${text}`;
  }

  if (/^https?:\/\//i.test(text)) {
    return text;
  }

  const scheme = looksLikeLocalAddress(text) ? 'http' : 'https';
  return `${scheme}://${text}`;
}
