const ABSOLUTE_HTTP_URL_REGEX = /^https?:\/\//i;
const PROTOCOL_RELATIVE_URL_REGEX = /^\/\//;
const DIRECT_IMAGE_SCHEME_REGEX = /^(data:|blob:|file:)/i;
const CUSTOM_SCHEME_REGEX = /^[a-z][a-z0-9+.-]*:/i;

function normalizeBackendBase(backendUrl: string): string {
  const base = String(backendUrl || '').trim();
  if (!base) return '';
  return base.endsWith('/') ? base : `${base}/`;
}

function toResolvedUrl(rawUrl: string, backendUrl: string): string {
  const text = String(rawUrl || '').trim();
  if (!text) return '';
  const base = normalizeBackendBase(backendUrl);
  if (!base) return text;
  try {
    return new URL(text, base).toString();
  } catch {
    return text;
  }
}

function appendDownloadFlag(rawUrl: string): string {
  const text = String(rawUrl || '').trim();
  if (!text) return '';
  if (/(^|[?&])download=true($|&)/i.test(text)) return text;
  return `${text}${text.includes('?') ? '&' : '?'}download=true`;
}

function extractFilePathFromApData(rawUrl: string): string {
  const text = String(rawUrl || '').trim();
  if (!text) return '';
  try {
    const parsed = new URL(text, 'https://zenmind.local');
    const pathname = parsed.pathname || '';
    if (!(pathname === '/api/ap/data' || pathname.startsWith('/api/ap/data/'))) {
      return '';
    }
    return sanitizeFilePath(parsed.searchParams.get('file') || '');
  } catch {
    return '';
  }
}

export function isAbsoluteHttpUrl(raw: string): boolean {
  return ABSOLUTE_HTTP_URL_REGEX.test(String(raw || '').trim());
}

export function isDirectImageUrl(raw: string): boolean {
  const text = String(raw || '').trim();
  if (!text) return false;
  return (
    ABSOLUTE_HTTP_URL_REGEX.test(text) ||
    PROTOCOL_RELATIVE_URL_REGEX.test(text) ||
    DIRECT_IMAGE_SCHEME_REGEX.test(text)
  );
}

function normalizeDirectImageUrl(raw: string): string {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (PROTOCOL_RELATIVE_URL_REGEX.test(text)) {
    return `https:${text}`;
  }
  return text;
}

export function sanitizeFilePath(raw: string): string {
  const text = String(raw || '').trim();
  if (!text) return '';
  const withoutHash = (text.split('#')[0] || '').trim();
  const withoutQuery = (withoutHash.split('?')[0] || '').trim();
  return withoutQuery;
}

export function buildApDataUrl(
  backendUrl: string,
  filePath: string,
  download: boolean,
  chatImageToken = ''
): string {
  const path = sanitizeFilePath(filePath);
  if (!path) return '';
  const token = String(chatImageToken || '').trim();
  const query = `file=${encodeURIComponent(path)}${download ? '&download=true' : ''}${token ? `&t=${encodeURIComponent(token)}` : ''}`;
  const base = normalizeBackendBase(backendUrl);
  if (!base) return `/api/ap/data?${query}`;
  try {
    const endpoint = new URL('/api/ap/data', base).toString();
    return `${endpoint}?${query}`;
  } catch {
    return `/api/ap/data?${query}`;
  }
}

export function resolveMarkdownImageUrl(raw: string, backendUrl: string, chatImageToken: string): string {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (isDirectImageUrl(text)) return normalizeDirectImageUrl(text);

  const token = String(chatImageToken || '').trim();
  if (!token) return '';

  const filePath = extractFilePathFromApData(text) || sanitizeFilePath(text);
  if (!filePath) return '';
  return buildApDataUrl(backendUrl, filePath, false, token);
}

export function resolveMarkdownLinkUrl(raw: string, backendUrl: string, asAttachment: boolean): string {
  const text = String(raw || '').trim();
  if (!text) return '';

  if (isAbsoluteHttpUrl(text)) {
    return text;
  }

  if (CUSTOM_SCHEME_REGEX.test(text)) {
    return text;
  }

  const filePath = extractFilePathFromApData(text) || sanitizeFilePath(text);
  if (!filePath) {
    return toResolvedUrl(text, backendUrl);
  }

  const resolved = buildApDataUrl(backendUrl, filePath, asAttachment);
  return asAttachment ? appendDownloadFlag(resolved) : resolved;
}
