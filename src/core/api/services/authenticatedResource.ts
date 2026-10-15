import { fetch } from 'expo/fetch';
import { clearDesktopPlatformCredentialCache } from '../activeWsTransport';
import { getAccountAuthGeneration } from '../../auth/accountAuth';
import { getSelectedSource } from '../../auth/activeDesktop';
import { getCloudAuthSnapshot } from '../../auth/cloudAuth';
import { buildAuthenticatedApiUriSource, type ApiUriSource } from '../apiClient.ts';
import { isAuthenticatedResourceContentTypeCompatible } from './authenticatedResourceModel.ts';

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
  const selection = getSelectedSource();
  const generation = selection?.kind === 'desktop' ? getAccountAuthGeneration() : getCloudAuthSnapshot().generation;
  const assertCurrent = () => {
    if (
      selection !== getSelectedSource() ||
      generation !== (selection?.kind === 'desktop' ? getAccountAuthGeneration() : getCloudAuthSnapshot().generation)
    )
      throw new Error('Resource preview superseded');
  };
  const resourceUrl = typeof resource === 'string' ? resource : resource.uri;
  let source = await resolveAuthenticatedResourceSource(resourceUrl);
  assertCurrent();
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
    for (let attempt = 0; attempt < 2; attempt++) {
      assertCurrent();
      const response = await fetch(source.uri, {
        headers: source.headers,
        redirect: 'error',
        credentials: 'omit',
        signal: controller.signal
      });
      assertCurrent();
      if (response.status === 401 && attempt === 0 && selection?.kind === 'desktop') {
        await response.body?.cancel();
        clearDesktopPlatformCredentialCache();
        source = await resolveAuthenticatedResourceSource(resourceUrl);
        continue;
      }
      if (!response.ok) {
        throw new AuthenticatedResourceError('http', `HTTP ${response.status}`);
      }
      if (
        options.expectedFileName &&
        !isAuthenticatedResourceContentTypeCompatible(options.expectedFileName, response.headers.get('content-type'))
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
      const reader = response.body?.getReader();
      if (!reader) throw new AuthenticatedResourceError('http', 'Resource stream unavailable');
      try {
        const decoder = new TextDecoder();
        const parts: string[] = [];
        let size = 0;
        while (true) {
          const chunk = await reader.read();
          assertCurrent();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > maxBytes) throw new AuthenticatedResourceError('too_large', 'Resource preview is too large');
          parts.push(decoder.decode(chunk.value, { stream: true }));
        }
        parts.push(decoder.decode());
        return parts.join('');
      } finally {
        await reader.cancel().catch(() => undefined);
      }
    }
    throw new AuthenticatedResourceError('http', 'Resource authentication failed');
  } catch (error) {
    if (timedOut) {
      throw new AuthenticatedResourceError('timed_out', 'Resource preview timed out');
    }
    throw error;
  } finally {
    controller.abort();
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}
