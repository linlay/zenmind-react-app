export type AuthenticatedResourceDownloadRequest = {
  resourceUrl: string;
  fileName: string;
};

export type AuthenticatedResourceDownloadResult = {
  fileName: string;
};

const INTERNAL_HTTP_RESOURCE_PATH_PATTERN = /^\/?(?:ap\/)?api\/(?:resource|workspace\/file)(?=$|[?#])/i;
const HTML_CONTENT_TYPES = new Set(['text/html', 'application/xhtml+xml']);

export function requiresAuthenticatedResourceHttpDataPlane(value: string): boolean {
  const normalized = String(value || '').trim();
  return Boolean(
    normalized &&
      !normalized.startsWith('//') &&
      !/^[a-z][a-z\d+.-]*:/i.test(normalized) &&
      INTERNAL_HTTP_RESOURCE_PATH_PATTERN.test(normalized)
  );
}

export function isAuthenticatedResourceContentTypeCompatible(
  fileName: string,
  contentType: string | null | undefined
): boolean {
  const mediaType = String(contentType || '')
    .trim()
    .toLowerCase()
    .split(';', 1)[0];
  if (!HTML_CONTENT_TYPES.has(mediaType)) {
    return true;
  }

  const extension = String(fileName || '')
    .trim()
    .toLowerCase()
    .split(/[?#]/, 1)[0]
    .split('.')
    .at(-1);
  return extension === 'html' || extension === 'htm';
}

export function normalizeAuthenticatedResourceFileName(value: string): string {
  const normalized = String(value || '')
    .replace(/[\u0000-\u001f\u007f/\\?%*:|"<>]/g, '_')
    .replace(/_+/g, '_')
    .replace(/[.\s]+$/g, '')
    .trim();
  return (normalized || 'artifact').slice(0, 180);
}

function hashAuthenticatedResourceIdentity(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function createAuthenticatedResourceImageCacheFileName(resourceUrl: string, fileName: string): string {
  const resourceHash = hashAuthenticatedResourceIdentity(String(resourceUrl || '').trim());
  return normalizeAuthenticatedResourceFileName(`${resourceHash}-${fileName || 'image'}`);
}
