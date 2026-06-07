import { ApiError, authenticatedApiRequest } from '../apiClient';

export const CHAT_SUMMARIES_TRANSPORT_TYPE = '/api/chats';

export type RemoteChatSummary = {
  chatId?: string;
  chatName?: string;
  title?: string;
  teamId?: string;
  agentKey?: string;
  agentName?: string;
  firstAgentKey?: string;
  firstAgentName?: string;
  lastRunContent?: string;
  lastRunId?: string;
  read?: unknown;
  unreadRunCount?: number;
  readStatus?: number;
  readAt?: string | number | null;
  readRunId?: string | null;
  updatedAt?: string | number;
  createdAt?: string | number;
  [key: string]: unknown;
};

export type RemoteChatEvent = Record<string, unknown>;

export type RemoteChatDetail = {
  chatId?: string;
  chatName?: string;
  chatImageToken?: string;
  read?: unknown;
  unreadRunCount?: number;
  readStatus?: number;
  readAt?: string | number | null;
  readRunId?: string | null;
  updatedAt?: string | number;
  events?: RemoteChatEvent[];
  [key: string]: unknown;
};

export type MarkChatReadRequest =
  | string
  | {
      chatId?: string;
      agentKey?: string;
      teamId?: string;
      runId?: string;
    };

export type MarkChatReadResponse = {
  chatId?: string;
  agentKey?: string;
  teamId?: string;
  read?: unknown;
  readStatus?: number;
  readAt?: string | number | null;
  readRunId?: string | null;
  agentUnreadCount?: number;
  unreadCount?: number;
};

export type AwaitingQuestionSubmitParamData = {
  id: string;
  answer?: string | number;
  answers?: string[];
};

export type AwaitingApprovalSubmitParamData = {
  id: string;
  decision: string;
  reason?: string;
};

export type AwaitingFormSubmitParamData = {
  id: string;
  decision: 'approve' | 'reject';
  reason?: string;
  form?: Record<string, unknown> | null;
};

export type AwaitingPlanSubmitParamData = {
  id?: string;
  decision: 'approve' | 'reject';
  reason?: string;
  planningId?: string;
};

export type AwaitingSubmitParamData =
  | AwaitingQuestionSubmitParamData
  | AwaitingApprovalSubmitParamData
  | AwaitingFormSubmitParamData
  | AwaitingPlanSubmitParamData;

export type AwaitingSubmitPayloadData = {
  runId: string;
  awaitingId: string;
  params: AwaitingSubmitParamData[];
};

export type SubmitAwaitingRequest = AwaitingSubmitPayloadData & {
  chatId?: string;
  agentKey: string;
  submitId?: string;
};

export type SubmitAwaitingResponse = {
  accepted?: boolean;
  status?: string;
  detail?: string;
  continued?: boolean;
  runId?: string;
  chatId?: string;
  [key: string]: unknown;
};

type ApiEnvelope<T> = {
  code?: number;
  msg?: string;
  error?: string;
  data?: T;
};

function unwrapEnvelope<T>(payload: unknown): T {
  if (!payload || typeof payload !== 'object') {
    return payload as T;
  }

  const envelope = payload as ApiEnvelope<T>;
  if (!('code' in envelope) && !('data' in envelope)) {
    return payload as T;
  }

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

export async function getChatDetailApi(chatId: string): Promise<RemoteChatDetail> {
  const payload = await authenticatedApiRequest<RemoteChatDetail | ApiEnvelope<RemoteChatDetail>>({
    path: '/ap/api/chat',
    query: {
      chatId: String(chatId || '').trim(),
    },
  });
  return unwrapEnvelope<RemoteChatDetail>(payload) || {};
}

export async function markChatReadApi(request: MarkChatReadRequest, runId?: string) {
  const body =
    typeof request === 'string'
      ? {
          chatId: String(request || '').trim(),
          ...(String(runId || '').trim() ? { runId: String(runId || '').trim() } : {}),
        }
      : {
          ...(String(request.chatId || '').trim()
            ? { chatId: String(request.chatId || '').trim() }
            : {}),
          ...(String(request.agentKey || '').trim()
            ? { agentKey: String(request.agentKey || '').trim() }
            : {}),
          ...(String(request.teamId || '').trim()
            ? { teamId: String(request.teamId || '').trim() }
            : {}),
          ...(String(request.runId || '').trim()
            ? { runId: String(request.runId || '').trim() }
            : {}),
        };
  const payload = await authenticatedApiRequest<
    MarkChatReadResponse | ApiEnvelope<MarkChatReadResponse>
  >({
    path: '/ap/api/read',
    method: 'POST',
    body,
  });
  return unwrapEnvelope<MarkChatReadResponse>(payload);
}

export async function submitAwaitingApi(
  request: SubmitAwaitingRequest
): Promise<SubmitAwaitingResponse> {
  const payload = await authenticatedApiRequest<
    SubmitAwaitingResponse | ApiEnvelope<SubmitAwaitingResponse>
  >({
    path: '/ap/api/submit',
    method: 'POST',
    body: {
      ...(String(request.chatId || '').trim()
        ? { chatId: String(request.chatId || '').trim() }
        : {}),
      runId: String(request.runId || '').trim(),
      agentKey: String(request.agentKey || '').trim(),
      awaitingId: String(request.awaitingId || '').trim(),
      ...(String(request.submitId || '').trim()
        ? { submitId: String(request.submitId || '').trim() }
        : {}),
      params: request.params,
    },
  });
  return unwrapEnvelope<SubmitAwaitingResponse>(payload) || {};
}
