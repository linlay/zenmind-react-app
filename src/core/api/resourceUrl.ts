const RESOURCE_PATH_PATTERN = /^\/?api\/resource(?=$|[/?#])/;

export function normalizeApiResourcePath(value: string): string {
  const text = String(value || '').trim();
  if (!text || text.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(text)) {
    return text;
  }

  if (RESOURCE_PATH_PATTERN.test(text)) {
    return text.startsWith('/') ? text : `/${text}`;
  }

  return text;
}

export function buildChatResourceUrl(value: string, remoteChatId: string): string {
  const text = String(value || '').trim();
  if (!text || /^[a-z][a-z\d+.-]*:/i.test(text) || text.startsWith('//')) return text;
  if (text.startsWith('/api/resource')) return normalizeApiResourcePath(text);
  const path = text.startsWith('@chat/') ? text.slice(6) : text;
  if (
    !remoteChatId ||
    path.startsWith('/') ||
    path.startsWith('@') ||
    path.includes('\\') ||
    /[\u0000-\u001f\u007f]/.test(path) ||
    [...remoteChatId.split('/'), ...path.split('/')].some((part) => {
      try {
        const decoded = decodeURIComponent(part);
        return !decoded || decoded === '.' || decoded === '..' || /[\/\\\u0000-\u001f\u007f]/.test(decoded);
      } catch {
        return true;
      }
    })
  )
    return '';
  return `/api/resource?${new URLSearchParams({ file: `${remoteChatId}/${path}` }).toString()}`;
}
