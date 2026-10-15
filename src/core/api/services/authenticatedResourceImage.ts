import { buildAuthenticatedApiUriSource, type ApiUriSource } from '../apiClient.ts';

export type AuthenticatedResourceImageRequest = {
  cacheScopeId: string;
  fileName: string;
  forceRefresh?: boolean;
  resourceUrl: string;
  signal?: AbortSignal;
};

export async function resolveAuthenticatedResourceImageSource(
  request: AuthenticatedResourceImageRequest
): Promise<ApiUriSource> {
  return buildAuthenticatedApiUriSource(request.resourceUrl);
}

export function releaseAuthenticatedResourceImageSource(_request: AuthenticatedResourceImageRequest): void {
  // Native authenticated previews use temporary files; other platforms do not own a local file here.
}
