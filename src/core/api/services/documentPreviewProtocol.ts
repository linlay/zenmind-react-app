export type DocumentPreviewSource =
  | { kind: 'chat-resource'; chatId: string; relativePath: string }
  | { kind: 'workspace-file'; agentKey: string; path: string };
export type DocumentPreviewResult = {
  previewId: string;
  sourceRevision: string;
  url: string;
  expiresAt: number;
  openMode: 'iframe' | 'external';
};
export type DocumentPreviewErrorCode = 'unsupported' | 'unavailable' | 'disabled' | 'too_large' | 'failed' | 'invalid';
export class DocumentPreviewError extends Error {
  constructor(readonly code: DocumentPreviewErrorCode) {
    super(code);
    this.name = 'DocumentPreviewError';
  }
}
export function isOfficeFile(name: string): boolean {
  return /\.(docx?|pptx?|xlsx?)$/iu.test(name);
}
export function isOnlineOfficeFile(name: string): boolean {
  return /\.(docx|pptx|xlsx)$/iu.test(name);
}
function safePath(path: string): boolean {
  return Boolean(
    path &&
    path.length <= 4096 &&
    !/[\\\u0000-\u001f\u007f]/u.test(path) &&
    !path.split('/').some((part) => part === '..' || part === '.')
  );
}
function resourceSegment(raw: string): string | null {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    /* Legacy literal percent. */
  }
  let checked = decoded;
  for (let depth = 0; depth < 5; depth++) {
    if (!checked || checked === '.' || checked === '..' || /[\\/\u0000-\u001f\u007f]/u.test(checked)) return null;
    try {
      const next = decodeURIComponent(checked);
      if (next === checked) return decoded;
      checked = next;
    } catch {
      return decoded;
    }
  }
  return null;
}
/** Resolve only API resource identities; never send an arbitrary URL to the preview service. */
export function resolveDocumentPreviewSource(resourceUrl: string, baseUrl: string): DocumentPreviewSource | null {
  try {
    const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash)
      return null;
    const url = new URL(resourceUrl.startsWith('/api/') ? resourceUrl.slice(1) : resourceUrl, base);
    if (url.origin !== base.origin || url.username || url.password || url.hash) return null;
    const prefix = base.pathname.replace(/\/$/u, '');
    if (url.pathname === `${prefix}/api/resource`) {
      const file = url.searchParams.get('file') || '';
      if (file.length > 4096 || file.includes('://')) return null;
      const segments = file.split('/').map(resourceSegment);
      if (segments.length < 2 || segments.some((value) => value === null)) return null;
      const chatId = segments[0]!;
      if (chatId.includes('..')) return null;
      return { kind: 'chat-resource', chatId, relativePath: segments.slice(1).join('/') };
    }
    if (url.pathname === `${prefix}/api/workspace/file`) {
      const agentKey = url.searchParams.get('agentKey') || '',
        path = url.searchParams.get('path') || '';
      return agentKey.length > 0 && agentKey.length <= 512 && !/[\u0000-\u001f\u007f]/u.test(agentKey) && safePath(path)
        ? { kind: 'workspace-file', agentKey, path }
        : null;
    }
  } catch {
    /* Malformed or missing configured data plane. */
  }
  return null;
}
export function validateDocumentPreviewResult(value: unknown, now = Date.now()): DocumentPreviewResult {
  const result = value as DocumentPreviewResult | null;
  try {
    if (
      !result ||
      typeof result.url !== 'string' ||
      result.url.length > 8192 ||
      typeof result.previewId !== 'string' ||
      !result.previewId ||
      typeof result.sourceRevision !== 'string' ||
      !result.sourceRevision ||
      !Number.isSafeInteger(result.expiresAt) ||
      result.expiresAt <= now ||
      !['iframe', 'external'].includes(result.openMode)
    )
      throw new Error();
    const url = new URL(result.url);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !url.hostname) throw new Error();
    return result;
  } catch {
    throw new DocumentPreviewError('invalid');
  }
}
