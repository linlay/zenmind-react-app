import type {
  AuthenticatedResourceDownloadRequest,
  AuthenticatedResourceDownloadResult
} from './authenticatedResource.ts';

export async function downloadAuthenticatedResource(
  _request: AuthenticatedResourceDownloadRequest
): Promise<AuthenticatedResourceDownloadResult> {
  throw new Error('Resource download is unavailable on this platform');
}
