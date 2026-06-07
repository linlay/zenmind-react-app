function normalizeInput(value: string): string {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '');
}

export function looksLikeLocalAddress(host: string): boolean {
  const value = String(host || '').toLowerCase();
  if (!value) {
    return false;
  }

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

export function normalizeApiBaseUrl(value: string): string {
  const trimmed = normalizeInput(value);
  if (!trimmed) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const scheme = looksLikeLocalAddress(trimmed) ? 'http' : 'https';
  return `${scheme}://${trimmed}`;
}
