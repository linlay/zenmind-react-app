const LEGACY_RESOURCE_PATH_PATTERN = /^\/?api\/resource(?=$|[/?#])/;

export function normalizeApiResourcePath(value: string): string {
  const text = String(value || '').trim();
  if (!text || text.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(text)) {
    return text;
  }

  if (LEGACY_RESOURCE_PATH_PATTERN.test(text)) {
    return text.startsWith('/') ? `/ap${text}` : `/ap/${text}`;
  }

  return text;
}
