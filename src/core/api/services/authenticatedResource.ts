import { buildAuthenticatedApiUriSource, type ApiUriSource } from '../apiClient.ts';
import { getActiveDeviceProfile } from '../../auth/deviceProfiles.ts';
import {
  isAuthenticatedResourceContentTypeCompatible,
  requiresAuthenticatedResourceHttpDataPlane
} from './authenticatedResourceModel.ts';

export {
  createAuthenticatedResourceImageCacheFileName,
  isAuthenticatedResourceContentTypeCompatible,
  normalizeAuthenticatedResourceFileName,
  requiresAuthenticatedResourceHttpDataPlane,
  type AuthenticatedResourceDownloadRequest,
  type AuthenticatedResourceDownloadResult
} from './authenticatedResourceModel.ts';

export const AUTHENTICATED_TEXT_PREVIEW_MAX_BYTES = 512 * 1024;
export const AUTHENTICATED_TEXT_PREVIEW_TIMEOUT_MS = 8_000;

export type AuthenticatedResourceErrorCode =
  | 'http'
  | 'invalid_url'
  | 'timed_out'
  | 'too_large'
  | 'unexpected_content_type'
  | 'unsupported_transport';

export class AuthenticatedResourceError extends Error {
  readonly code: AuthenticatedResourceErrorCode;

  constructor(code: AuthenticatedResourceErrorCode, message: string) {
    super(message);
    this.name = 'AuthenticatedResourceError';
    this.code = code;
  }
}

export async function resolveAuthenticatedResourceSource(resourceUrl: string): Promise<ApiUriSource> {
  if (
    getActiveDeviceProfile()?.transportKind === 'desktop-ws' &&
    requiresAuthenticatedResourceHttpDataPlane(resourceUrl)
  ) {
    throw new AuthenticatedResourceError(
      'unsupported_transport',
      'Desktop WS does not expose the authenticated resource HTTP data plane'
    );
  }
  const source = await buildAuthenticatedApiUriSource(resourceUrl);
  if (!source.uri || source.uri.startsWith('//') || !/^https?:\/\//i.test(source.uri)) {
    throw new AuthenticatedResourceError('invalid_url', 'Invalid resource URL');
  }
  return source;
}

export async function fetchAuthenticatedResourceText(
  resource: string | ApiUriSource,
  options: {
    maxBytes?: number;
    expectedFileName?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {}
): Promise<string> {
  const maxBytes = Math.max(1, options.maxBytes ?? AUTHENTICATED_TEXT_PREVIEW_MAX_BYTES);
  const timeoutMs = Math.max(1, options.timeoutMs ?? AUTHENTICATED_TEXT_PREVIEW_TIMEOUT_MS);
  const source = typeof resource === 'string' ? await resolveAuthenticatedResourceSource(resource) : resource;
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    if (options.signal?.aborted) {
      controller.abort(options.signal.reason);
    }
    const response = await fetch(source.uri, {
      headers: source.headers,
      signal: controller.signal
    });
    if (!response.ok) {
      throw new AuthenticatedResourceError('http', `HTTP ${response.status}`);
    }
    if (
      options.expectedFileName &&
      !isAuthenticatedResourceContentTypeCompatible(
        options.expectedFileName,
        response.headers.get('content-type')
      )
    ) {
      throw new AuthenticatedResourceError(
        'unexpected_content_type',
        'Resource response content type does not match the requested file'
      );
    }
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new AuthenticatedResourceError('too_large', 'Resource preview is too large');
    }
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new AuthenticatedResourceError('too_large', 'Resource preview is too large');
    }
    return text;
  } catch (error) {
    if (timedOut) {
      throw new AuthenticatedResourceError('timed_out', 'Resource preview timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}
