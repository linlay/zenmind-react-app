import type { DeviceProfile } from '../../auth/deviceProfiles.ts';
import { ApiError } from '../apiError.ts';

export const CHAT_UPLOAD_API_PATH = '/api/upload';

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

type ApiEnvelope<T> = {
  code?: number;
  msg?: string;
  error?: string;
  data?: T;
};

export type ChatUploadErrorCode = 'invalid_tunnel_profile' | 'unexpected_response';

export class ChatUploadError extends Error {
  readonly code: ChatUploadErrorCode;

  constructor(code: ChatUploadErrorCode, message: string) {
    super(message);
    this.name = 'ChatUploadError';
    this.code = code;
  }
}

export type ChatUploadRoute =
  | {
      kind: 'direct-http';
      path: typeof CHAT_UPLOAD_API_PATH;
    }
  | {
      kind: 'desktop-public';
      endpointUrl: string;
    };

export type ChatUploadFormFields = {
  chatId: string;
  requestId: string;
};

export type DesktopPublicUploadRequestHooks = {
  onError?: (input: { attempt: number; durationMs: number; error: unknown }) => void;
  onRequest?: (input: { attempt: number }) => void;
  onResponse?: (input: { attempt: number; durationMs: number; responseText: string; status: number }) => void;
};

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function createChatUploadFormData(fields: ChatUploadFormFields, file: Blob): FormData {
  const formData = new FormData();
  formData.append('requestId', fields.requestId);
  if (fields.chatId) {
    formData.append('chatId', fields.chatId);
  }
  formData.append('file', file);
  return formData;
}

export function resolveChatUploadRoute(profile: DeviceProfile | null): ChatUploadRoute {
  if (!profile) {
    throw new ChatUploadError('invalid_tunnel_profile', 'Active device profile is unavailable');
  }
  if (profile.transportKind === 'http') {
    return {
      kind: 'direct-http',
      path: CHAT_UPLOAD_API_PATH
    };
  }

  const transport = profile.desktopWs;
  if (!transport) {
    throw new ChatUploadError('invalid_tunnel_profile', 'Desktop tunnel profile is incomplete');
  }
  try {
    const wsUrl = new URL(transport.wsUrl);
    if (wsUrl.protocol !== 'wss:' || !wsUrl.host || wsUrl.username || wsUrl.password) {
      throw new Error('invalid Desktop WS URL');
    }
    wsUrl.protocol = 'https:';
    wsUrl.pathname = CHAT_UPLOAD_API_PATH;
    wsUrl.search = '';
    wsUrl.hash = '';
    return {
      kind: 'desktop-public',
      endpointUrl: wsUrl.toString()
    };
  } catch {
    throw new ChatUploadError('invalid_tunnel_profile', 'Desktop tunnel profile has no public host');
  }
}

function isJsonContentType(value: string | null | undefined): boolean {
  const mediaType = normalizeText(value).toLowerCase().split(';', 1)[0];
  return mediaType === 'application/json' || mediaType.endsWith('+json');
}

function parseJsonText(value: string): unknown {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function resolveHttpErrorMessage(status: number, payload: unknown): string {
  if (isObjectRecord(payload)) {
    for (const key of ['error', 'msg', 'message']) {
      const message = normalizeText(payload[key]);
      if (message) {
        return message;
      }
    }
  }
  return `HTTP ${status}`;
}

export function unwrapChatUploadResponse(payload: unknown): ChatUploadResponseData {
  if (!isObjectRecord(payload)) {
    throw new ChatUploadError('unexpected_response', 'Upload endpoint returned an invalid response');
  }

  if (!('code' in payload) && !('data' in payload)) {
    return payload as ChatUploadResponseData;
  }

  const envelope = payload as ApiEnvelope<unknown>;
  const code = Number(envelope.code ?? 0);
  if (!Number.isFinite(code)) {
    throw new ChatUploadError('unexpected_response', 'Upload endpoint returned an invalid response');
  }
  if (code !== 0) {
    throw new ApiError(String(envelope.msg || envelope.error || 'API returned non-zero code'), 200, payload);
  }
  if (!isObjectRecord(envelope.data)) {
    throw new ChatUploadError('unexpected_response', 'Upload endpoint returned an invalid response');
  }
  return envelope.data as ChatUploadResponseData;
}

export function parseDesktopPublicUploadResponse(input: {
  contentType: string | null | undefined;
  ok: boolean;
  status: number;
  text: string;
}): ChatUploadResponseData {
  const payload = parseJsonText(input.text);
  if (!input.ok) {
    throw new ApiError(resolveHttpErrorMessage(input.status, payload), input.status, payload);
  }
  if (!isJsonContentType(input.contentType) || !isObjectRecord(payload)) {
    throw new ChatUploadError('unexpected_response', 'Upload endpoint returned an invalid response');
  }
  return unwrapChatUploadResponse(payload);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) {
    return;
  }
  if (signal.reason instanceof Error) {
    throw signal.reason;
  }
  const error = new Error('Upload aborted');
  error.name = 'AbortError';
  throw error;
}

export async function requestDesktopPublicUpload(input: {
  createBody: () => FormData;
  endpointUrl: string;
  fetchImpl: typeof fetch;
  getAccessToken: (forceRefresh: boolean) => Promise<string | null>;
  hooks?: DesktopPublicUploadRequestHooks;
  signal?: AbortSignal;
}): Promise<ChatUploadResponseData> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    throwIfAborted(input.signal);
    const accessToken = await input.getAccessToken(attempt > 1);
    if (!accessToken) {
      throw new ApiError('Not authenticated', 401, null);
    }

    const startedAt = Date.now();
    let response: Response;
    let responseText = '';
    try {
      input.hooks?.onRequest?.({ attempt });
      response = await input.fetchImpl(input.endpointUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        body: input.createBody(),
        signal: input.signal
      });
      responseText = await response.text();
    } catch (error) {
      input.hooks?.onError?.({ attempt, durationMs: Date.now() - startedAt, error });
      throw error;
    }

    input.hooks?.onResponse?.({
      attempt,
      durationMs: Date.now() - startedAt,
      responseText,
      status: response.status
    });
    if (response.status === 401 && attempt === 1 && !input.signal?.aborted) {
      continue;
    }

    return parseDesktopPublicUploadResponse({
      contentType: response.headers.get('content-type'),
      ok: response.ok,
      status: response.status,
      text: responseText
    });
  }

  throw new ApiError('Not authenticated', 401, null);
}
