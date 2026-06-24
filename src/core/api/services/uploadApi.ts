import { File as ExpoFile } from 'expo-file-system';

import { ApiError, authenticatedFormDataRequest } from '../apiClient';
import { normalizeApiResourcePath } from '../resourceUrl';
import { logHttpError, logHttpRequest } from '../../debug/httpDebugLogger';

export const CHAT_UPLOAD_API_PATH = '/ap/api/upload';

export type ChatUploadReference = {
  id?: string;
  type?: string;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
  url?: string;
  sha256?: string;
};

export type ChatUploadResponseData = {
  requestId?: string;
  chatId?: string;
  upload?: ChatUploadReference;
  references?: unknown[];
};

export type UploadChatAttachmentInput = {
  uri: string;
  name: string;
  mimeType?: string | null;
  requestId: string;
  chatId?: string | null;
  sha256?: string | null;
  signal?: AbortSignal;
};

type ApiEnvelope<T> = {
  code?: number;
  msg?: string;
  error?: string;
  data?: T;
};

type ExpoFetchFormDataFilePart = {
  name: string;
  type: string;
  bytes: () => Promise<Uint8Array>;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function unwrapEnvelope<T>(payload: unknown): T {
  if (!isObjectRecord(payload) || (!('code' in payload) && !('data' in payload))) {
    return payload as T;
  }

  const envelope = payload as ApiEnvelope<T>;
  const code = Number(envelope.code ?? 0);
  if (Number.isFinite(code) && code !== 0) {
    throw new ApiError(
      String(envelope.msg || envelope.error || 'API returned non-zero code'),
      200,
      payload
    );
  }

  return (envelope.data ?? null) as T;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function createExpoFetchFilePart(
  uri: string,
  name: string,
  mimeType: string
): ExpoFetchFormDataFilePart {
  // Expo 56 fetch rejects React Native's legacy `{ uri }` FormData file part.
  const file = new ExpoFile(uri);
  return {
    name,
    type: mimeType,
    bytes: () => file.bytes(),
  };
}

function normalizeReference(input: Record<string, unknown>): ChatUploadReference {
  const sizeBytes = Number(input.sizeBytes ?? input.size);
  return {
    id: normalizeText(input.id) || undefined,
    type: normalizeText(input.type) || undefined,
    name: normalizeText(input.name) || undefined,
    mimeType: normalizeText(input.mimeType) || undefined,
    sizeBytes: Number.isFinite(sizeBytes) && sizeBytes >= 0 ? sizeBytes : undefined,
    url: normalizeApiResourcePath(normalizeText(input.url)) || undefined,
    sha256: normalizeText(input.sha256) || undefined,
  };
}

export function extractUploadReferences(data: unknown): ChatUploadReference[] {
  if (Array.isArray(data)) {
    return data
      .filter(isObjectRecord)
      .map(normalizeReference)
      .filter((item) => Boolean(item.name || item.id || item.url));
  }

  if (isObjectRecord(data) && Array.isArray(data.references)) {
    return data.references
      .filter(isObjectRecord)
      .map(normalizeReference)
      .filter((item) => Boolean(item.name || item.id || item.url));
  }

  if (isObjectRecord(data) && isObjectRecord(data.upload)) {
    const reference = normalizeReference(data.upload);
    return reference.name || reference.id || reference.url ? [reference] : [];
  }

  return [];
}

export function extractUploadChatId(data: unknown): string {
  return isObjectRecord(data) ? normalizeText(data.chatId) : '';
}

export async function uploadChatAttachmentApi(
  input: UploadChatAttachmentInput
): Promise<ChatUploadResponseData> {
  const requestId = normalizeText(input.requestId);
  const name = normalizeText(input.name) || 'upload.bin';
  const uri = normalizeText(input.uri);
  if (!requestId || !uri) {
    throw new Error('Upload request id and file uri are required');
  }

  const chatId = normalizeText(input.chatId);
  const sha256 = normalizeText(input.sha256);
  const mimeType = normalizeText(input.mimeType) || 'application/octet-stream';
  const startedAt = Date.now();

  logHttpRequest({
    url: CHAT_UPLOAD_API_PATH,
    method: 'POST',
    body: {
      stage: 'upload.prepare',
      requestId,
      ...(chatId ? { chatId } : {}),
      ...(sha256 ? { sha256 } : {}),
      file: {
        name,
        type: mimeType,
        content: '[omitted]',
      },
    },
  });

  const formData = new FormData();
  try {
    formData.append('requestId', requestId);

    if (chatId) {
      formData.append('chatId', chatId);
    }

    if (sha256) {
      formData.append('sha256', sha256);
    }

    formData.append('file', createExpoFetchFilePart(uri, name, mimeType) as unknown as Blob);
  } catch (error) {
    logHttpError({
      url: CHAT_UPLOAD_API_PATH,
      method: 'POST',
      durationMs: Date.now() - startedAt,
      error,
    });
    throw error;
  }

  const payload = await authenticatedFormDataRequest<
    ChatUploadResponseData | ApiEnvelope<ChatUploadResponseData>
  >({
    path: CHAT_UPLOAD_API_PATH,
    method: 'POST',
    body: formData,
    signal: input.signal,
  });

  return unwrapEnvelope<ChatUploadResponseData>(payload) || {};
}
