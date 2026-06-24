import {
  deriveDesktopApiBaseUrlFromWsUrl,
  normalizeDesktopWsTokenMode,
  normalizeDesktopWsUrlInput,
  type DesktopWsTokenMode,
} from './desktopWsProtocol.ts';

export type { DesktopWsTokenMode };
export { deriveDesktopApiBaseUrlFromWsUrl, normalizeDesktopWsTokenMode };

export function normalizeDesktopWsStorageUrl(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (/^https?:\/\//iu.test(text)) {
    return '';
  }
  return normalizeDesktopWsUrlInput(value);
}
