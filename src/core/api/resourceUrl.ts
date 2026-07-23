const RESOURCE_PATH_PATTERN = /^\/?api\/resource(?=$|[/?#])/;
const LEGACY_APP_RESOURCE_PATH_PATTERN = /^\/?ap\/api\/resource(?=$|[/?#])/;

export function normalizeApiResourcePath(value: string): string {
  const text = String(value || '').trim();
  if (!text || text.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(text)) {
    return text;
  }

  if (LEGACY_APP_RESOURCE_PATH_PATTERN.test(text)) {
    return text.replace(/^\/?ap/, '');
  }

  if (RESOURCE_PATH_PATTERN.test(text)) {
    return text.startsWith('/') ? text : `/${text}`;
  }

  return text;
}
