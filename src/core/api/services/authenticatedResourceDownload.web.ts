import {
  normalizeAuthenticatedResourceFileName,
  resolveAuthenticatedResourceSource,
  type AuthenticatedResourceDownloadRequest,
  type AuthenticatedResourceDownloadResult
} from './authenticatedResource.ts';

export async function downloadAuthenticatedResource(
  request: AuthenticatedResourceDownloadRequest
): Promise<AuthenticatedResourceDownloadResult> {
  const source = await resolveAuthenticatedResourceSource(request.resourceUrl);
  const response = await fetch(source.uri, { headers: source.headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const fileName = normalizeAuthenticatedResourceFileName(request.fileName);
  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
  return { fileName };
}
