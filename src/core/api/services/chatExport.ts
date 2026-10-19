import { getCloudAuthSnapshot, getCloudAccessTokenForRequest, reportCloudFailure } from '../../auth/cloudAuth';
import { getSelectedSource } from '../../auth/activeDesktop';
import { classifyCloudFailure } from './chatDirectoryApi';
import { fetch } from 'expo/fetch';
import { getDefaultSourceConfig } from '../../config/appEnvironment';
import { INSTALLED_BRAND_ID } from '../../../shared/generated/brand';
import { logHttpError, logHttpRequest, logHttpResponse } from '../../debug/httpDebugLogger';
import {
  buildChatExportHtml,
  chatExportFileName,
  ChatExportError,
  CHAT_EXPORT_MAX_BYTES,
  CHAT_EXPORT_TEMPLATE_MAX_BYTES,
  resolveChatExportAssetOrigin,
  type ChatExportFile,
  type ChatExportFormat
} from './chatExportProtocol.ts';

export function getChatExportAssetOrigin(): string {
  try {
    return resolveChatExportAssetOrigin(process.env.EXPO_PUBLIC_CONVERSATION_EXPORT_ASSET_ORIGIN ?? '');
  } catch {
    return '';
  }
}

/** Read-only full-history endpoint. Never attach, read, or borrow the active Desktop credential. */
export async function fetchChatExport(input: {
  sourceKind: string;
  sourceId: string;
  chatId: string;
  format: ChatExportFormat;
  signal: AbortSignal;
}): Promise<ChatExportFile> {
  const config = getDefaultSourceConfig(),
    origin = getChatExportAssetOrigin();
  const cloud = getCloudAuthSnapshot();
  const selection = getSelectedSource();
  if (selection?.kind !== 'cloud' || cloud.status !== 'available') throw new ChatExportError('unavailable');
  const accountSourceId = JSON.stringify([config.sourceId, cloud.scopeId]);
  if (
    input.sourceKind !== 'default' ||
    input.sourceId !== accountSourceId ||
    !config.apiBaseUrl ||
    !input.chatId.trim() ||
    (input.format === 'html' && !origin)
  )
    throw new ChatExportError('unavailable');
  const controller = new AbortController(),
    abort = () => controller.abort();
  input.signal.addEventListener('abort', abort, { once: true });
  if (input.signal.aborted) abort();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    abort();
  }, 60_000);
  const check = () => {
    if (controller.signal.aborted) throw new ChatExportError('cancelled');
    const current = getDefaultSourceConfig();
    if (
      current.sourceId !== config.sourceId ||
      current.apiBaseUrl !== config.apiBaseUrl ||
      getCloudAuthSnapshot().generation !== cloud.generation ||
      getCloudAuthSnapshot().status !== 'available' ||
      getSelectedSource() !== selection
    )
      throw new ChatExportError('unavailable');
  };
  const read = async (url: string, mimeType: string, limit: number, authenticated: boolean) => {
    check();
    const startedAt = Date.now();
    if (authenticated) logHttpRequest({ url, method: 'GET', attempt: 1 });
    const accessToken = authenticated ? getCloudAccessTokenForRequest() : null;
    check();
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'error',
      credentials: 'omit',
      headers: {
        Accept: mimeType,
        ...(authenticated && accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      }
    });
    if (authenticated)
      logHttpResponse({
        url,
        method: 'GET',
        attempt: 1,
        status: response.status,
        durationMs: Date.now() - startedAt,
        payload: null
      });
    const reader = response.body?.getReader();
    try {
      if (!response.ok) {
        if (authenticated) reportCloudFailure(classifyCloudFailure({ status: response.status }), cloud.generation);
        throw new ChatExportError(response.status === 413 ? 'too_large' : 'failed');
      }
      if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== mimeType || !reader)
        throw new ChatExportError('invalid');
      if (Number(response.headers.get('content-length')) > limit) throw new ChatExportError('too_large');
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        check();
        const { value, done } = await reader.read();
        check();
        if (done) break;
        size += value.byteLength;
        if (size > limit) throw new ChatExportError('too_large');
        chunks.push(value);
      }
      if (!size) throw new ChatExportError('invalid');
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return { bytes, disposition: response.headers.get('content-disposition') };
    } finally {
      try {
        await reader?.cancel();
      } catch {
        /* An aborted native stream is already closed. */
      } finally {
        reader?.releaseLock();
      }
    }
  };
  try {
    const query = new URLSearchParams({
      chatId: input.chatId,
      format: input.format === 'html' ? 'snapshot' : 'markdown'
    });
    const snapshot = await read(
      `${config.apiBaseUrl}/api/chat/export?${query}`,
      input.format === 'html' ? 'application/json' : 'text/markdown',
      CHAT_EXPORT_MAX_BYTES,
      true
    );
    let bytes = snapshot.bytes;
    if (input.format === 'html') {
      const template = await read(
        `${origin}/assets/conversation-export/conversation.template.html`,
        'text/html',
        CHAT_EXPORT_TEMPLATE_MAX_BYTES,
        false
      );
      bytes = buildChatExportHtml(bytes, new TextDecoder().decode(template.bytes), origin, INSTALLED_BRAND_ID);
    }
    check();
    return {
      bytes,
      fileName: chatExportFileName(snapshot.disposition, input.chatId, input.format),
      mimeType: input.format === 'html' ? 'text/html' : 'text/markdown'
    };
  } catch (error) {
    logHttpError({
      url: `${config.apiBaseUrl}/api/chat/export`,
      method: 'GET',
      attempt: 1,
      durationMs: 0,
      error: 'Conversation export failed'
    });
    if (timedOut) throw new ChatExportError('failed');
    throw controller.signal.aborted
      ? new ChatExportError('cancelled')
      : error instanceof ChatExportError
        ? error
        : new ChatExportError('failed');
  } finally {
    clearTimeout(timer);
    input.signal.removeEventListener('abort', abort);
    controller.abort();
  }
}
