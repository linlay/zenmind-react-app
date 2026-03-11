export const DEFAULT_PTY_FRONTEND_PORT = '11931';
export const DEFAULT_PTY_FRONTEND_PATH = '/appterm';

export function getDefaultEndpointInput(): string {
  return '';
}

export const DEFAULT_ENDPOINT_INPUT = getDefaultEndpointInput();

function normalizeUrlBase(raw: string | undefined | null): string {
  return String(raw || '')
    .trim()
    .replace(/\/+$/, '');
}

export function normalizeEndpointInput(raw: string | undefined | null): string {
  const text = String(raw || '')
    .trim()
    .replace(/\/+$/, '');
  return text;
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

function resolveEndpointBaseUrl(endpointInput: string | undefined | null): string {
  const normalized = normalizeEndpointInput(endpointInput);
  if (!normalized) {
    return '';
  }
  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }
  const scheme = looksLikeLocalAddress(normalized) ? 'http' : 'https';
  return `${scheme}://${normalized}`;
}

function shouldForceWebDevProxyForLocalTargets(): boolean {
  if (typeof process === 'undefined') {
    return false;
  }
  const value = String(process.env.EXPO_PUBLIC_WEB_PROXY_FORCE_ALL || '')
    .trim()
    .toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

export function toBackendBaseUrl(endpointInput: string | undefined | null): string {
  const resolvedBase = resolveEndpointBaseUrl(endpointInput);
  return applyWebDevProxyBaseUrl(resolvedBase);
}

export function toDefaultPtyWebUrl(endpointInput: string | undefined | null): string {
  const resolvedBase = resolveEndpointBaseUrl(endpointInput);
  if (!resolvedBase) {
    return '';
  }

  try {
    const directUrl = new URL(resolvedBase);
    const proxyBase = getWebDevProxyBaseUrl();
    const shouldUseProxy =
      isWebLocalhostRuntime() &&
      Boolean(proxyBase) &&
      (!looksLikeLocalAddress(directUrl.host) || shouldForceWebDevProxyForLocalTargets());

    const url = new URL(shouldUseProxy ? proxyBase : resolvedBase);

    if (looksLikeLocalAddress(url.hostname)) {
      url.port = DEFAULT_PTY_FRONTEND_PORT;
    } else if (String(url.port || '').trim() === '443') {
      url.port = '';
    }

    if (shouldUseProxy) {
      url.port = new URL(proxyBase).port;
    }

    url.pathname = DEFAULT_PTY_FRONTEND_PATH;
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function normalizePtyUrlInput(
  raw: string | undefined | null,
  endpointInput: string = getDefaultEndpointInput()
): string {
  const text = String(raw || '')
    .trim()
    .replace(/\/+$/, '');
  if (!text) {
    const normalizedEndpoint = normalizeEndpointInput(endpointInput);
    if (!normalizedEndpoint) {
      return '';
    }
    return toDefaultPtyWebUrl(endpointInput);
  }

  if (text.startsWith('/')) {
    const backend = toBackendBaseUrl(endpointInput).replace(/\/+$/, '');
    if (!backend) {
      return '';
    }
    return `${backend}${text}`;
  }

  if (/^https?:\/\//i.test(text)) {
    return text;
  }

  const scheme = looksLikeLocalAddress(text) ? 'http' : 'https';
  return `${scheme}://${text}`;
}

function isWebLocalhostRuntime(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const host = String(window.location?.hostname || '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1';
}

function getWebDevProxyBaseUrl(): string {
  if (typeof process === 'undefined') {
    return '';
  }
  const configured = normalizeUrlBase(process.env.EXPO_PUBLIC_WEB_PROXY_BASE || '');
  if (!configured) {
    return '';
  }
  if (!/^https?:\/\//i.test(configured)) {
    return '';
  }
  return configured;
}

function applyWebDevProxyBaseUrl(baseUrl: string): string {
  const normalizedBase = normalizeUrlBase(baseUrl);
  if (!normalizedBase || !isWebLocalhostRuntime()) {
    return normalizedBase;
  }
  let parsedTarget: URL;
  try {
    parsedTarget = new URL(normalizedBase);
  } catch {
    return normalizedBase;
  }
  if (looksLikeLocalAddress(parsedTarget.host) && !shouldForceWebDevProxyForLocalTargets()) {
    return normalizedBase;
  }
  const proxyBase = getWebDevProxyBaseUrl();
  if (!proxyBase) {
    return normalizedBase;
  }
  return proxyBase;
}
