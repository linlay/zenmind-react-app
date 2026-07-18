import { ApiError, authenticatedApiRequest } from '../apiClient.ts';

export {
  buildSubmitFrontendToolPayload,
  type SubmitFrontendToolRequest,
} from './frontendToolSubmitProtocol.ts';

export const CHAT_SUMMARIES_TRANSPORT_TYPE = '/api/chats';
export const CHAT_DETAIL_TRANSPORT_TYPE = '/api/chat';
export const CHAT_AGENT_DETAIL_TRANSPORT_TYPE = '/api/agent';
export const CHAT_READ_TRANSPORT_TYPE = '/api/read';
export const CHAT_SUBMIT_TRANSPORT_TYPE = '/api/submit';

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

export type RemoteChatEvent = Record<string, unknown> & {
  seq?: number;
  type?: string;
  timestamp?: string | number;
  chatId?: string;
  runId?: string;
};

export type ChatDetailRequest = {
  chatId: string;
  includeRawMessages: boolean;
};

export type RemoteChatUsageStats = Record<string, unknown>;

export type RemoteChatUsageData = RemoteChatUsageStats & {
  current?: RemoteChatUsageStats;
  run?: RemoteChatUsageStats;
  lastRun?: RemoteChatUsageStats;
  chat?: RemoteChatUsageStats;
  compact?: RemoteChatUsageStats;
  compactionUsage?: RemoteChatUsageStats;
};

export type RemoteChatContextWindow = {
  maxSize?: number;
  currentSize?: number;
  estimatedNextCallSize?: number;
  percent?: number;
  modelKey?: string;
  reasoningEffort?: string;
  [key: string]: unknown;
};

export type RemoteChatRunSummary = {
  runId?: string;
  chatId?: string;
  requestId?: string;
  agentKey?: string;
  initialMessage?: string;
  assistantText?: string;
  finishReason?: string;
  startedAt?: string | number | null;
  completedAt?: string | number | null;
  usage?: RemoteChatUsageData | RemoteChatUsageStats | null;
  feedbackType?: string | null;
  feedbackComment?: string | null;
  feedbackAt?: string | number | null;
  [key: string]: unknown;
};

export type RemoteChatActiveRun = {
  runId?: string;
  state?: string;
  lastSeq?: number;
  oldestSeq?: number;
  startedAt?: string | number | null;
  planningMode?: boolean;
  agentKey?: string;
  modelKey?: string;
  [key: string]: unknown;
};

export type RemoteChatPlanningSnapshot = {
  runId?: string;
  planningId?: string;
  planningFile?: string;
  text?: string;
  [key: string]: unknown;
};

export type RemoteChatPlanSnapshot = {
  planId?: string;
  runId?: string;
  title?: string;
  status?: string;
  tasks?: unknown[];
  [key: string]: unknown;
};

export type RemoteChatArtifactFile = {
  artifactId?: string;
  name?: string;
  mimeType?: string;
  sha256?: string;
  sizeBytes?: number;
  size?: number;
  url?: string;
  timestamp?: string | number;
  createdAt?: string | number;
  updatedAt?: string | number;
  [key: string]: unknown;
};

export type RemoteChatArtifactSnapshot = {
  items?: RemoteChatArtifactFile[];
  [key: string]: unknown;
};

export type RemoteChatReference = {
  id?: string;
  type?: string;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
  url?: string;
  sha256?: string;
  sandboxPath?: string;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
};

export type RemoteChatRawMessage = Record<string, unknown>;

export type RemoteChatDetail = {
  chatId?: string;
  chatName?: string;
  title?: string;
  name?: string;
  chatImageToken?: string;
  firstAgentKey?: string;
  agentKey?: string;
  teamId?: string;
  read?: unknown;
  unreadRunCount?: number;
  readStatus?: number;
  readAt?: string | number | null;
  readRunId?: string | null;
  updatedAt?: string | number;
  createdAt?: string | number;
  resourceTicket?: string;
  rawMessages?: RemoteChatRawMessage[];
  events?: RemoteChatEvent[];
  runs?: RemoteChatRunSummary[];
  activeRun?: RemoteChatActiveRun | null;
  plan?: RemoteChatPlanSnapshot | null;
  planning?: RemoteChatPlanningSnapshot | null;
  artifact?: RemoteChatArtifactSnapshot | null;
  references?: RemoteChatReference[];
  usage?: RemoteChatUsageData | RemoteChatUsageStats | null;
  contextWindow?: RemoteChatContextWindow | null;
  [key: string]: unknown;
};

export type RemoteAgentDetail = {
  agentKey?: string;
  key?: string;
  id?: string;
  name?: string;
  description?: string;
  wonders?: unknown;
  greetings?: unknown;
  [key: string]: unknown;
};

export type AgentWonderSuggestion = {
  id: string;
  title: string;
  text: string;
  raw: unknown;
};

export type AgentDetailSnapshot = {
  agentKey: string;
  name: string;
  description: string;
  wonders: AgentWonderSuggestion[];
  raw: RemoteAgentDetail;
  fetchedAt: number;
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

export type FrontendToolSubmitPayloadData = {
  toolKey: string;
  runId: string;
  toolId: string;
  params: Record<string, unknown>;
};

export type SubmitFrontendToolResponse = SubmitAwaitingResponse;

export type ChatViewportResponse = {
  html?: string;
  [key: string]: unknown;
};

export type ChatApiEnvelope<T> = {
  status?: string | number;
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

function toCleanText(value: unknown): string {
  return String(value || '').trim();
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function buildWonderId(index: number, text: string): string {
  return `wonder-${index}-${text.slice(0, 32)}`;
}

function normalizeWonderSuggestion(input: unknown, index: number): AgentWonderSuggestion | null {
  if (typeof input === 'string') {
    const text = toCleanText(input);
    if (!text) {
      return null;
    }
    return {
      id: buildWonderId(index, text),
      title: text,
      text,
      raw: input,
    };
  }

  if (!isObjectRecord(input)) {
    return null;
  }

  const text =
    toCleanText(input.question) ||
    toCleanText(input.prompt) ||
    toCleanText(input.text) ||
    toCleanText(input.content) ||
    toCleanText(input.title);
  if (!text) {
    return null;
  }

  const title = toCleanText(input.title) || text;
  const id = toCleanText(input.id) || toCleanText(input.key) || buildWonderId(index, text);
  return {
    id,
    title,
    text,
    raw: input,
  };
}

export function buildAgentDetailPayload(agentKey: string) {
  return {
    agentKey: toCleanText(agentKey),
  };
}

export function buildChatDetailPayload(
  request: string | { chatId?: string; includeRawMessages?: boolean }
): ChatDetailRequest {
  const source = typeof request === 'string' ? { chatId: request } : request;
  return {
    chatId: toCleanText(source.chatId),
    includeRawMessages: source.includeRawMessages === true,
  };
}

export function projectRemoteAgentDetail(
  detail: RemoteAgentDetail | null | undefined,
  fallbackAgentKey = '',
  fetchedAt = Date.now()
): AgentDetailSnapshot | null {
  if (!detail || typeof detail !== 'object') {
    return null;
  }

  const agentKey =
    toCleanText(detail.agentKey) ||
    toCleanText(detail.key || detail.id) ||
    toCleanText(fallbackAgentKey);
  if (!agentKey) {
    return null;
  }

  const wonders = Array.isArray(detail.wonders)
    ? detail.wonders
        .map((item, index) => normalizeWonderSuggestion(item, index))
        .filter((item): item is AgentWonderSuggestion => Boolean(item))
        .slice(0, 6)
    : [];

  return {
    agentKey,
    name: toCleanText(detail.name),
    description: toCleanText(detail.description),
    wonders,
    raw: detail,
    fetchedAt,
  };
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

export function buildSubmitAwaitingPayload(
  request: SubmitAwaitingRequest
): SubmitAwaitingRequest {
  const chatId = String(request.chatId || '').trim();
  const submitId = String(request.submitId || '').trim();
  const payload: SubmitAwaitingRequest = {
    runId: String(request.runId || '').trim(),
    agentKey: String(request.agentKey || '').trim(),
    awaitingId: String(request.awaitingId || '').trim(),
    params: request.params,
  };

  if (chatId) {
    payload.chatId = chatId;
  }
  if (submitId) {
    payload.submitId = submitId;
  }

  return payload;
}

export async function getChatViewportApi(viewportKey: string): Promise<ChatViewportResponse> {
  const payload = await authenticatedApiRequest<
    ChatViewportResponse | ChatApiEnvelope<ChatViewportResponse> | string
  >({
    path: '/ap/api/viewport',
    query: {
      viewportKey: String(viewportKey || '').trim(),
    },
  });

  if (typeof payload === 'string') {
    return { html: payload };
  }
  return unwrapChatApiEnvelope<ChatViewportResponse>(payload) || {};
}
