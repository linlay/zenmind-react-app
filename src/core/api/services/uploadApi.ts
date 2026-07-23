import { File as ExpoFile } from 'expo-file-system';

import { authenticatedFormDataRequest } from '../apiClient';
import { normalizeApiResourcePath } from '../resourceUrl';
import { getAccessTokenForRequest } from '../../auth/appAuth';
import { getActiveDeviceProfile, type DeviceProfile } from '../../auth/deviceProfiles';
import { logHttpError, logHttpRequest, logHttpResponse } from '../../debug/httpDebugLogger';
import {
  ChatUploadError,
  createChatUploadFormData,
  requestDesktopPublicUpload,
  resolveChatUploadRoute,
  unwrapChatUploadResponse,
  type ChatUploadReference,
  type ChatUploadResponseData,
  type ChatUploadRoute
} from './uploadApiModel';

export {
  CHAT_UPLOAD_API_PATH,
  ChatUploadError,
  type ChatUploadErrorCode,
  type ChatUploadReference,
  type ChatUploadResponseData
} from './uploadApiModel';

export type UploadChatAttachmentInput = {
  uri: string;
  name: string;
  mimeType?: string | null;
  requestId: string;
  chatId?: string | null;
  signal?: AbortSignal;
};

type ExpoFetchFormDataFilePart = {
  name: string;
  type: string;
  bytes: () => Promise<Uint8Array>;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function createExpoFetchFilePart(uri: string, name: string, mimeType: string): ExpoFetchFormDataFilePart {
  // Expo 56 fetch rejects React Native's legacy `{ uri }` FormData file part.
  const file = new ExpoFile(uri);
  return {
    name,
    type: mimeType,
    bytes: () => file.bytes()
  };
}

function createUploadFormData(input: {
  chatId: string;
  mimeType: string;
  name: string;
  requestId: string;
  uri: string;
}): FormData {
  return createChatUploadFormData(
    {
      chatId: input.chatId,
      requestId: input.requestId
    },
    createExpoFetchFilePart(input.uri, input.name, input.mimeType) as unknown as Blob
  );
}

function uploadLogBody(input: {
  chatId: string;
  mimeType: string;
  name: string;
  requestId: string;
  transport: ChatUploadRoute['kind'];
}): Record<string, unknown> {
  return {
    stage: 'upload.prepare',
    transport: input.transport,
    requestId: input.requestId,
    ...(input.chatId ? { chatId: input.chatId } : {}),
    file: {
      name: input.name,
      type: input.mimeType,
      content: '[omitted]'
    }
  };
}

async function uploadThroughDesktopPublicHost(
  profile: DeviceProfile,
  route: Extract<ChatUploadRoute, { kind: 'desktop-public' }>,
  input: {
    chatId: string;
    mimeType: string;
    name: string;
    requestId: string;
    signal?: AbortSignal;
    uri: string;
  }
): Promise<ChatUploadResponseData> {
  if (!input.chatId) {
    throw new ChatUploadError('invalid_tunnel_profile', 'Tunnel uploads require a chat id');
  }

  return requestDesktopPublicUpload({
    endpointUrl: route.endpointUrl,
    signal: input.signal,
    fetchImpl: fetch,
    getAccessToken: (forceRefresh) => getAccessTokenForRequest(profile.apiBaseUrl, forceRefresh),
    createBody: () => createUploadFormData(input),
    hooks: {
      onRequest: ({ attempt }) => {
        logHttpRequest({
          url: route.endpointUrl,
          method: 'POST',
          attempt,
          body: uploadLogBody({
            ...input,
            transport: route.kind
          })
        });
      },
      onResponse: ({ attempt, durationMs, responseText, status }) => {
        logHttpResponse({
          url: route.endpointUrl,
          method: 'POST',
          attempt,
          status,
          durationMs,
          payload: responseText
        });
      },
      onError: ({ attempt, durationMs, error }) => {
        logHttpError({
          url: route.endpointUrl,
          method: 'POST',
          attempt,
          durationMs,
          error
        });
      }
    }
  });
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
    sha256: normalizeText(input.sha256) || undefined
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

export async function uploadChatAttachmentApi(input: UploadChatAttachmentInput): Promise<ChatUploadResponseData> {
  const requestId = normalizeText(input.requestId);
  const name = normalizeText(input.name) || 'upload.bin';
  const uri = normalizeText(input.uri);
  if (!requestId || !uri) {
    throw new Error('Upload request id and file uri are required');
  }

  const chatId = normalizeText(input.chatId);
  const mimeType = normalizeText(input.mimeType) || 'application/octet-stream';
  const profile = getActiveDeviceProfile();
  const route = resolveChatUploadRoute(profile);
  const startedAt = Date.now();

  logHttpRequest({
    url: route.kind === 'direct-http' ? route.path : route.endpointUrl,
    method: 'POST',
    body: uploadLogBody({
      transport: route.kind,
      requestId,
      chatId,
      name,
      mimeType
    })
  });

  if (route.kind === 'desktop-public') {
    if (!profile) {
      throw new ChatUploadError('invalid_tunnel_profile', 'Active device profile is unavailable');
    }
    return uploadThroughDesktopPublicHost(profile, route, {
      chatId,
      mimeType,
      name,
      requestId,
      signal: input.signal,
      uri
    });
  }

  try {
    const payload = await authenticatedFormDataRequest<unknown>({
      path: route.path,
      method: 'POST',
      body: createUploadFormData({ chatId, mimeType, name, requestId, uri }),
      signal: input.signal
    });

    return unwrapChatUploadResponse(payload);
  } catch (error) {
    logHttpError({
      url: route.path,
      method: 'POST',
      durationMs: Date.now() - startedAt,
      error
    });
    throw error;
  }
}
