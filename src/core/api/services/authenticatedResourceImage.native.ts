import { downloadAuthenticatedResourceFile } from './authenticatedResourceFile.native';
import { Directory, File, FileMode, Paths } from 'expo-file-system';

import { buildAuthenticatedApiUriSource, type ApiUriSource } from '../apiClient.ts';
import { logHttpError, logHttpRequest, logHttpResponse } from '../../debug/httpDebugLogger.ts';
import { AuthenticatedResourceError, createAuthenticatedResourceImageCacheFileName } from './authenticatedResource.ts';
import type { AuthenticatedResourceImageRequest } from './authenticatedResourceImage.ts';
import { requiresAuthenticatedResourceHttpDataPlane } from './authenticatedResourceModel.ts';

const CACHE_DIRECTORY_NAME = 'chat-resource-images';
const IMAGE_PREVIEW_MAX_BYTES = 32 * 1024 * 1024;
const ERROR_DOCUMENT_PREFIX_BYTES = 256;

type InflightDownload = {
  consumers: number;
  controller: AbortController;
  promise: Promise<ApiUriSource>;
};

const inflightDownloads = new Map<string, InflightDownload>();
const resolvedConsumers = new Map<string, number>();

export function clearAuthenticatedResourceImageCache(): void {
  for (const download of inflightDownloads.values()) download.controller.abort();
  inflightDownloads.clear();
  resolvedConsumers.clear();
  const directory = new Directory(Paths.cache, CACHE_DIRECTORY_NAME);
  if (directory.exists) directory.delete();
}

function createAbortError(reason?: unknown): Error {
  const error = new Error(typeof reason === 'string' && reason ? reason : 'The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function createDownloadLogError(request: AuthenticatedResourceImageRequest, error: unknown): Error {
  const code = error instanceof AuthenticatedResourceError ? ` code=${error.code}` : '';
  const message = error instanceof Error ? error.message : String(error || 'Unknown error');
  return new Error(`[resource.image.download] file=${request.fileName}${code}: ${message}`);
}

function resolveCacheFile(request: AuthenticatedResourceImageRequest): File {
  const cacheDirectory = new Directory(Paths.cache, CACHE_DIRECTORY_NAME);
  if (!cacheDirectory.exists) {
    cacheDirectory.create({ idempotent: true, intermediates: true });
  }
  return new File(
    cacheDirectory,
    createAuthenticatedResourceImageCacheFileName(`${request.cacheScopeId}:${request.resourceUrl}`, request.fileName)
  );
}

function retainResolvedImage(destination: File): void {
  resolvedConsumers.set(destination.uri, (resolvedConsumers.get(destination.uri) || 0) + 1);
}

export function releaseAuthenticatedResourceImageSource(request: AuthenticatedResourceImageRequest): void {
  if (!requiresAuthenticatedResourceHttpDataPlane(request.resourceUrl)) {
    return;
  }
  const destination = resolveCacheFile(request);
  const consumers = resolvedConsumers.get(destination.uri) || 0;
  if (consumers > 1) {
    resolvedConsumers.set(destination.uri, consumers - 1);
    return;
  }
  if (consumers === 0) {
    return;
  }
  resolvedConsumers.delete(destination.uri);
  if (destination.exists) {
    destination.delete();
  }
}

function assertDownloadedImageCandidate(file: File): void {
  if (!file.exists || file.size <= 0) {
    throw new AuthenticatedResourceError('unexpected_content_type', 'Resource image is empty');
  }
  if (file.size > IMAGE_PREVIEW_MAX_BYTES) {
    throw new AuthenticatedResourceError('too_large', 'Resource image preview is too large');
  }

  const handle = file.open(FileMode.ReadOnly);
  let prefixBytes: Uint8Array;
  try {
    prefixBytes = handle.readBytes(Math.min(file.size, ERROR_DOCUMENT_PREFIX_BYTES));
  } finally {
    handle.close();
  }
  const prefix = Array.from(prefixBytes, (byte) => String.fromCharCode(byte))
    .join('')
    .trimStart()
    .toLowerCase();
  if (/^<(?:!doctype\s+html|html|head|body)(?:\s|>)/u.test(prefix) || /^(?:\{|\[)/u.test(prefix)) {
    throw new AuthenticatedResourceError('unexpected_content_type', 'Resource response is not a supported image');
  }
}

async function downloadImage(
  request: AuthenticatedResourceImageRequest,
  destination: File,
  controller: AbortController
): Promise<ApiUriSource> {
  const startedAt = Date.now();
  let sourceUrl = request.resourceUrl;
  try {
    const source = await buildAuthenticatedApiUriSource(request.resourceUrl);
    sourceUrl = source.uri;
    if (!sourceUrl || !/^https?:\/\//iu.test(sourceUrl)) {
      throw new AuthenticatedResourceError('invalid_url', 'Invalid resource URL');
    }

    logHttpRequest({
      url: sourceUrl,
      method: 'GET',
      body: {
        stage: 'resource.image.download',
        fileName: request.fileName,
        forceRefresh: Boolean(request.forceRefresh)
      }
    });
    const downloadedFile = await downloadAuthenticatedResourceFile(request.resourceUrl, destination, {
      signal: controller.signal,
      maxBytes: IMAGE_PREVIEW_MAX_BYTES
    });
    assertDownloadedImageCandidate(downloadedFile);
    logHttpResponse({
      url: sourceUrl,
      method: 'GET',
      status: 200,
      durationMs: Date.now() - startedAt,
      payload: {
        stage: 'resource.image.download',
        cache: 'written',
        fileName: request.fileName,
        sizeBytes: downloadedFile.size
      }
    });
    return { uri: downloadedFile.uri };
  } catch (error) {
    if (destination.exists) {
      destination.delete();
    }
    const resolvedError = error;
    if (!(resolvedError instanceof Error && resolvedError.name === 'AbortError')) {
      logHttpError({
        url: sourceUrl,
        method: 'GET',
        durationMs: Date.now() - startedAt,
        error: createDownloadLogError(request, resolvedError)
      });
    }
    throw resolvedError;
  }
}

function createInflightDownload(
  key: string,
  request: AuthenticatedResourceImageRequest,
  destination: File
): InflightDownload {
  const controller = new AbortController();
  const promise = downloadImage(request, destination, controller).finally(() => {
    if (inflightDownloads.get(key)?.promise === promise) {
      inflightDownloads.delete(key);
    }
  });
  const download = { consumers: 0, controller, promise };
  inflightDownloads.set(key, download);
  return download;
}

function waitForInflightDownload(key: string, download: InflightDownload, signal?: AbortSignal): Promise<ApiUriSource> {
  if (signal?.aborted) {
    return Promise.reject(createAbortError(signal.reason));
  }

  download.consumers += 1;
  return new Promise((resolve, reject) => {
    let settled = false;
    const release = () => {
      if (settled) {
        return;
      }
      settled = true;
      signal?.removeEventListener('abort', handleAbort);
      download.consumers -= 1;
      if (download.consumers === 0 && inflightDownloads.get(key) === download) {
        void Promise.resolve().then(() => {
          if (download.consumers === 0 && inflightDownloads.get(key) === download) {
            download.controller.abort();
          }
        });
      }
    };
    const handleAbort = () => {
      release();
      reject(createAbortError(signal?.reason));
    };

    signal?.addEventListener('abort', handleAbort, { once: true });
    download.promise.then(
      (source) => {
        release();
        resolve(source);
      },
      (error: unknown) => {
        release();
        reject(error);
      }
    );
  });
}

export async function resolveAuthenticatedResourceImageSource(
  request: AuthenticatedResourceImageRequest
): Promise<ApiUriSource> {
  if (!requiresAuthenticatedResourceHttpDataPlane(request.resourceUrl)) {
    return buildAuthenticatedApiUriSource(request.resourceUrl);
  }
  if (request.signal?.aborted) {
    throw createAbortError(request.signal.reason);
  }

  const destination = resolveCacheFile(request);
  const key = destination.uri;
  const activeDownload = inflightDownloads.get(key);
  if (activeDownload) {
    const source = await waitForInflightDownload(key, activeDownload, request.signal);
    retainResolvedImage(destination);
    return source;
  }
  if (request.forceRefresh && destination.exists) {
    destination.delete();
  }
  if (destination.exists && destination.size > 0) {
    logHttpResponse({
      url: request.resourceUrl,
      method: 'CACHE',
      status: 200,
      durationMs: 0,
      payload: {
        stage: 'resource.image.cache.hit',
        fileName: request.fileName,
        sizeBytes: destination.size
      }
    });
    retainResolvedImage(destination);
    return { uri: destination.uri };
  }

  const download = createInflightDownload(key, request, destination);
  const source = await waitForInflightDownload(key, download, request.signal);
  retainResolvedImage(destination);
  return source;
}
