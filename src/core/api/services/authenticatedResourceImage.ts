import { buildAuthenticatedApiUriSource, type ApiUriSource } from '../apiClient.ts';

export type AuthenticatedResourceImageRequest = {
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
