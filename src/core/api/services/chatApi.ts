import { ApiError, authenticatedApiRequest } from '../apiClient';

export const CHAT_SUMMARIES_TRANSPORT_TYPE = '/api/chats';
export const CHAT_DETAIL_TRANSPORT_TYPE = '/api/chat';
export const CHAT_READ_TRANSPORT_TYPE = '/api/read';

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

export type MarkChatReadPayload = {
  chatId?: string;
  agentKey?: string;
  teamId?: string;
  runId?: string;
};

export type AwaitingQuestionSubmitParamData = {
  id: string;
  answer?: string | number;
  answers?: string[];
  decision?: 'reject';
};

export type AwaitingApprovalDecision = 'approve' | 'reject' | 'approve_rule_run';

export type AwaitingPlanDecision = 'approve' | 'reject';

export type AwaitingApprovalSubmitParamData =
  | {
      id: string;
      decision: AwaitingApprovalDecision;
      reason?: string;
    }
  | {
      id: string;
      reason: string;
    };

export type AwaitingFormSubmitParamData = {
  id: string;
  decision: 'approve' | 'reject';
  reason?: string;
  form?: Record<string, unknown> | null;
};

export type AwaitingPlanSubmitParamData = {
  id?: string;
  decision: AwaitingPlanDecision;
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

export type AwaitingViewportResponse = {
  html?: string;
  [key: string]: unknown;
};

export type ChatApiEnvelope<T> = {
  code?: number;
  msg?: string;
  error?: string;
  data?: T;
};

export function unwrapChatApiEnvelope<T>(payload: unknown): T {
  if (!payload || typeof payload !== 'object') {
    return payload as T;
  }

  const envelope = payload as ChatApiEnvelope<T>;
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

export function buildMarkChatReadPayload(
  request: MarkChatReadRequest,
  runId?: string
): MarkChatReadPayload {
  const fallbackRunId = String(runId || '').trim();
  if (typeof request === 'string') {
    const chatId = String(request || '').trim();
    return {
      chatId,
      ...(fallbackRunId ? { runId: fallbackRunId } : {}),
    };
  }

  const chatId = String(request.chatId || '').trim();
  const agentKey = String(request.agentKey || '').trim();
  const teamId = String(request.teamId || '').trim();
  const readRunId = String(request.runId || '').trim() || fallbackRunId;

  return {
    ...(chatId ? { chatId } : {}),
    ...(agentKey ? { agentKey } : {}),
    ...(teamId ? { teamId } : {}),
    ...(readRunId ? { runId: readRunId } : {}),
  };
}

export async function submitAwaitingApi(
  request: SubmitAwaitingRequest
): Promise<SubmitAwaitingResponse> {
  const payload = await authenticatedApiRequest<
    SubmitAwaitingResponse | ChatApiEnvelope<SubmitAwaitingResponse>
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
  return unwrapChatApiEnvelope<SubmitAwaitingResponse>(payload) || {};
}

export async function getAwaitingViewportApi(viewportKey: string): Promise<AwaitingViewportResponse> {
  const payload = await authenticatedApiRequest<
    AwaitingViewportResponse | ChatApiEnvelope<AwaitingViewportResponse> | string
  >({
    path: '/ap/api/viewport',
    query: {
      viewportKey: String(viewportKey || '').trim(),
    },
  });

  if (typeof payload === 'string') {
    return { html: payload };
  }
  return unwrapChatApiEnvelope<AwaitingViewportResponse>(payload) || {};
}
