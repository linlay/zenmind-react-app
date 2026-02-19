export const DEFAULT_ENDPOINT_INPUT = 'agw.linlay.cc';
export const DEFAULT_PTY_FRONTEND_PORT = '11949';

export function normalizeEndpointInput(raw: string | undefined | null): string {
  const text = String(raw || '').trim().replace(/\/+$/, '');
  return text || DEFAULT_ENDPOINT_INPUT;
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
  endpointInput: string = DEFAULT_ENDPOINT_INPUT
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
