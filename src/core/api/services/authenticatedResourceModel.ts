export type AuthenticatedResourceDownloadRequest = {
  resourceUrl: string;
  fileName: string;
};

export type AuthenticatedResourceDownloadResult = {
  fileName: string;
};

export function normalizeAuthenticatedResourceFileName(value: string): string {
  const normalized = String(value || '')
    .replace(/[\u0000-\u001f\u007f/\\?%*:|"<>]/g, '_')
    .replace(/_+/g, '_')
    .replace(/[.\s]+$/g, '')
    .trim();
  return (normalized || 'artifact').slice(0, 180);
}
