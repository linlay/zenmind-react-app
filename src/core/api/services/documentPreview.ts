import { getCloudAuthSnapshot, getCloudAccessTokenForRequest, reportCloudFailure } from '../../auth/cloudAuth';
import { getSelectedSource } from '../../auth/activeDesktop';
import { classifyCloudFailure } from './chatDirectoryApi';
import { getDefaultSourceConfig } from '../../config/appEnvironment';
import { logHttpError, logHttpRequest, logHttpResponse } from '../../debug/httpDebugLogger';
import {
  DocumentPreviewError,
  isOnlineOfficeFile,
  resolveDocumentPreviewSource,
  validateDocumentPreviewResult,
  type DocumentPreviewResult
} from './documentPreviewProtocol.ts';

/** HTTP-only server conversion, bound to the configured default source, never the active Desktop/Identity host. */
export async function prepareAuthenticatedDocumentPreview(input: {
  sourceKind: string;
  sourceId: string;
  resourceUrl: string;
  name: string;
  signal: AbortSignal;
}): Promise<DocumentPreviewResult> {
  const config = getDefaultSourceConfig();
  const cloud = getCloudAuthSnapshot();
  const selection = getSelectedSource();
  if (selection?.kind !== 'cloud' || cloud.status !== 'available') throw new DocumentPreviewError('unavailable');
  const accountSourceId = JSON.stringify([config.sourceId, cloud.scopeId]);
  if (input.sourceKind !== 'default' || input.sourceId !== accountSourceId || !config.apiBaseUrl)
    throw new DocumentPreviewError('unavailable');
  if (!isOnlineOfficeFile(input.name)) throw new DocumentPreviewError('unsupported');
  const source = resolveDocumentPreviewSource(input.resourceUrl, config.apiBaseUrl);
  if (!source) throw new DocumentPreviewError('invalid');
  const controller = new AbortController();
  const abort = () => controller.abort();
  input.signal.addEventListener('abort', abort, { once: true });
  if (input.signal.aborted) abort();
  const timer = setTimeout(abort, 130_000); // Server default conversion timeout is 120 seconds.
  const assertScope = () => {
    const current = getDefaultSourceConfig();
    if (
      controller.signal.aborted ||
      current.sourceId !== config.sourceId ||
      current.apiBaseUrl !== config.apiBaseUrl ||
      getCloudAuthSnapshot().generation !== cloud.generation ||
      getCloudAuthSnapshot().status !== 'available' ||
      getSelectedSource() !== selection
    )
      throw new DocumentPreviewError('unavailable');
  };
  const request = async (path: string, body?: unknown): Promise<Record<string, unknown>> => {
    assertScope();
    const url = `${config.apiBaseUrl}${path}`,
      method = body ? 'POST' : 'GET',
      startedAt = Date.now();
    logHttpRequest({ url, method, attempt: 1 });
    try {
      const accessToken = getCloudAccessTokenForRequest();
      assertScope();
      const response = await fetch(url, {
        method,
        signal: controller.signal,
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      // Keep bearer preview links out of debug payloads; only record status.
      logHttpResponse({
        url,
        method,
        attempt: 1,
        status: response.status,
        durationMs: Date.now() - startedAt,
        payload: null
      });
      if (Number(response.headers.get('content-length')) > 64 * 1024) throw new DocumentPreviewError('invalid');
      const text = await response.text();
      if (text.length > 64 * 1024) throw new DocumentPreviewError('invalid');
      const envelope = JSON.parse(text);
      assertScope();
      if (!response.ok) reportCloudFailure(classifyCloudFailure({ status: response.status }), cloud.generation);
      if (!response.ok || envelope.code !== 0) {
        const code = envelope?.data?.code;
        throw new DocumentPreviewError(
          code === 'preview_disabled' ? 'disabled' : code === 'preview_file_too_large' ? 'too_large' : 'failed'
        );
      }
      if (!envelope.data || typeof envelope.data !== 'object' || Array.isArray(envelope.data))
        throw new DocumentPreviewError('invalid');
      return envelope.data;
    } catch (error) {
      logHttpError({
        url,
        method,
        attempt: 1,
        durationMs: Date.now() - startedAt,
        error: 'Document preview request failed'
      });
      throw error instanceof DocumentPreviewError ? error : new DocumentPreviewError('failed');
    }
  };
  try {
    const caps = await request('/api/document/preview/capabilities');
    if (caps.enabled !== true) throw new DocumentPreviewError('disabled');
    const ext = input.name.split('.').at(-1)!.toLowerCase();
    if (!Array.isArray(caps.supportedExtensions) || !caps.supportedExtensions.includes(ext))
      throw new DocumentPreviewError('unsupported');
    if (!Number.isSafeInteger(caps.maxFileBytes) || Number(caps.maxFileBytes) <= 0)
      throw new DocumentPreviewError('invalid');
    const requestId = `preview-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const result = await request('/api/document/preview', { requestId, source });
    assertScope();
    return validateDocumentPreviewResult(result);
  } finally {
    clearTimeout(timer);
    input.signal.removeEventListener('abort', abort);
    controller.abort();
  }
}
