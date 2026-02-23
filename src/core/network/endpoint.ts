export const DEFAULT_PTY_FRONTEND_PORT = '11931';
export const DEFAULT_PTY_FRONTEND_PATH = '/appterm';

export function getDefaultEndpointInput(): string {
  return '';
}

export const DEFAULT_ENDPOINT_INPUT = getDefaultEndpointInput();

export function normalizeEndpointInput(raw: string | undefined | null): string {
  const text = String(raw || '').trim().replace(/\/+$/, '');
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

export function toBackendBaseUrl(endpointInput: string | undefined | null): string {
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

export function toDefaultPtyWebUrl(endpointInput: string | undefined | null): string {
  const backendBase = toBackendBaseUrl(endpointInput);
  if (!backendBase) {
    return '';
  }
  try {
    const url = new URL(backendBase);
    if (looksLikeLocalAddress(url.hostname)) {
      url.port = DEFAULT_PTY_FRONTEND_PORT;
    } else if (String(url.port || '').trim() === '443') {
      url.port = '';
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
  const text = String(raw || '').trim().replace(/\/+$/, '');
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
