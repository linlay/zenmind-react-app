import { ApiError } from '../apiError.ts';
import type { SharedWsRequestOptions } from '../../ws/sharedWsTransport.ts';
import type { WsTransportConfig, WsTransportNamespace } from '../../ws/wsTransportConfig.ts';
import type {
  KanbanChangeResult,
  KanbanIssue,
  KanbanIssueInput,
  KanbanIssueRunResult,
  KanbanIssueUpdateInput,
  KanbanSnapshot,
  KanbanStatus,
  StartKanbanIssueRunApiInput
} from './kanbanTypes.ts';

export type KanbanDesktopRequester = <T>(type: string, payload?: unknown, signal?: AbortSignal) => Promise<T>;
export type KanbanDesktopProfileSnapshot = { transportKind?: string } | null;
export type KanbanDesktopTransportResolver = (namespace: WsTransportNamespace) => Promise<WsTransportConfig | null>;
export type KanbanDesktopSharedRequester = <T>(options: SharedWsRequestOptions) => Promise<T>;

export type RequiredDesktopKanbanRequesterOptions = {
  getActiveProfile: () => KanbanDesktopProfileSnapshot;
  resolveTransport: KanbanDesktopTransportResolver;
  request: KanbanDesktopSharedRequester;
  namespace?: WsTransportNamespace;
  requiredMessage?: string;
  unavailableMessage?: string;
};

type KanbanResponse = {
  ok?: boolean;
  code?: string;
  message?: string;
};

type NormalizedKanbanBaseResponse = Record<string, unknown> & {
  ok: boolean;
  boardId: string;
  projectId: string;
  revision: number;
};

const DEFAULT_BOARD_ID = 'default';
const DEFAULT_PROJECT_ID = 'default';
const KANBAN_DESKTOP_NAMESPACE: WsTransportNamespace = 'd';
const DESKTOP_REQUIRED_MESSAGE =
  'Desktop Kanban requires an active Desktop WS profile. Pair this device with ZenMind Desktop and try again.';
const DESKTOP_UNAVAILABLE_MESSAGE = 'Desktop is not connected. Open ZenMind Desktop and try again.';
const RUN_UPDATE_FAILED_CODE = 'kanban_issue_run_update_failed';
const RUN_UPDATE_FAILED_MESSAGE = 'Kanban run started, but the task card did not sync.';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

export function readKanbanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function isKanbanAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isDesktopUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === 'WsClientDisconnectedError' ||
    error.name === 'WsClientRequestTimeoutError' ||
    error.message.includes('WebSocket connection failed') ||
    error.message.includes('WebSocket transport disconnected') ||
    error.message.includes('WebSocket request timeout')
  );
}

function readErrorStatus(error: unknown): number {
  return typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 502;
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : '';
}

function assertKanbanResponse<T extends KanbanResponse>(payload: T, fallback: string): T {
  if (payload.ok === false) {
    throw new ApiError(payload.message || fallback, 502, payload);
  }
  return payload;
}

function ensurePayloadRecord(payload: unknown, fallback: string): Record<string, unknown> {
  if (!isObjectRecord(payload)) {
    throw new ApiError(fallback, 502, payload);
  }
  return payload;
}

export function withKanbanProjectId<T extends object>(input: T, projectId: string): T & { projectId?: string } {
  return readKanbanText((input as { projectId?: unknown }).projectId) ? input : { ...input, projectId };
}

function normalizeKanbanProjectId(projectId: string | undefined): string {
  return readKanbanText(projectId) || DEFAULT_PROJECT_ID;
}

function normalizeKanbanBaseResponse(
  payload: unknown,
  projectId: string,
  invalidMessage: string,
  failedMessage: string
): NormalizedKanbanBaseResponse {
  const record = assertKanbanResponse(ensurePayloadRecord(payload, invalidMessage), failedMessage);
  return {
    ...record,
    ok: record.ok !== false,
    boardId: readKanbanText(record.boardId) || DEFAULT_BOARD_ID,
    projectId: readKanbanText(record.projectId) || projectId,
    revision: readFiniteNumber(record.revision, 0)
  };
}

export function normalizeKanbanSnapshot(payload: unknown, projectId: string): KanbanSnapshot {
  const record = normalizeKanbanBaseResponse(
    payload,
    projectId,
    'Kanban snapshot returned invalid payload',
    'Kanban snapshot failed'
  );
  return {
    ...record,
    issues: Array.isArray(record.issues) ? (record.issues as KanbanIssue[]) : []
  } as KanbanSnapshot;
}

export function normalizeKanbanChangeResult(payload: unknown, projectId: string): KanbanChangeResult {
  const record = normalizeKanbanBaseResponse(
    payload,
    projectId,
    'Kanban operation returned invalid payload',
    'Kanban operation failed'
  );
  const result: Record<string, unknown> = {
    ...record
  };

  if (Array.isArray(record.issues)) {
    result.issues = record.issues as KanbanIssue[];
  } else {
    delete result.issues;
  }
  if (isObjectRecord(record.issue) || record.issue === null) {
    result.issue = record.issue;
  } else {
    delete result.issue;
  }
  const deletedIssueId = readKanbanText(record.deletedIssueId);
  if (deletedIssueId) {
    result.deletedIssueId = deletedIssueId;
  } else {
    delete result.deletedIssueId;
  }

  return result as KanbanChangeResult;
}

function createDesktopRequiredError(message = DESKTOP_REQUIRED_MESSAGE): ApiError {
  return new ApiError(message, 503, { code: 'desktop_ws_required' });
}

function toKanbanApiError(error: unknown, type: string, unavailableMessage = DESKTOP_UNAVAILABLE_MESSAGE): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (isDesktopUnavailableError(error)) {
    return new ApiError(unavailableMessage, 503, { code: 'desktop_unavailable', type });
  }
  const status = readErrorStatus(error);
  const message = readErrorMessage(error) || 'Kanban operation failed';
  return new ApiError(message, status, { code: 'desktop_kanban_failed', type, cause: error });
}

export function createRequiredDesktopKanbanRequester({
  getActiveProfile,
  resolveTransport,
  request,
  namespace = KANBAN_DESKTOP_NAMESPACE,
  requiredMessage = DESKTOP_REQUIRED_MESSAGE,
  unavailableMessage = DESKTOP_UNAVAILABLE_MESSAGE
}: RequiredDesktopKanbanRequesterOptions): KanbanDesktopRequester {
  return async function requestDesktopKanbanRequired<T>(
    type: string,
    payload?: unknown,
    signal?: AbortSignal
  ): Promise<T> {
    if (getActiveProfile()?.transportKind !== 'desktop-ws') {
      throw createDesktopRequiredError(requiredMessage);
    }

    let transport;
    try {
      transport = await resolveTransport(namespace);
    } catch (error) {
      if (isKanbanAbortError(error)) {
        throw error;
      }
      throw toKanbanApiError(error, type, unavailableMessage);
    }

    if (!transport || transport.kind !== 'desktop-ws') {
      throw createDesktopRequiredError(requiredMessage);
    }

    try {
      return await request<T>({
        transport,
        namespace,
        type,
        payload,
        signal
      });
    } catch (error) {
      if (isKanbanAbortError(error)) {
        throw error;
      }
      throw toKanbanApiError(error, type, unavailableMessage);
    }
  };
}

export async function getKanbanSnapshotProtocol(
  requestDesktopKanban: KanbanDesktopRequester,
  projectId = DEFAULT_PROJECT_ID,
  signal?: AbortSignal
): Promise<KanbanSnapshot> {
  const normalizedProjectId = normalizeKanbanProjectId(projectId);
  const payload = await requestDesktopKanban<unknown>('snapshot.get', { projectId: normalizedProjectId }, signal);
  return normalizeKanbanSnapshot(payload, normalizedProjectId);
}

async function requestKanbanChangeProtocol(
  requestDesktopKanban: KanbanDesktopRequester,
  type: string,
  payload: unknown,
  projectId = DEFAULT_PROJECT_ID,
  signal?: AbortSignal
): Promise<KanbanChangeResult> {
  const normalizedProjectId = normalizeKanbanProjectId(projectId);
  const result = await requestDesktopKanban<unknown>(type, payload, signal);
  return normalizeKanbanChangeResult(result, normalizedProjectId);
}

export function createKanbanIssueProtocol(
  requestDesktopKanban: KanbanDesktopRequester,
  input: KanbanIssueInput,
  projectId = DEFAULT_PROJECT_ID
): Promise<KanbanChangeResult> {
  const normalizedProjectId = normalizeKanbanProjectId(projectId);
  return requestKanbanChangeProtocol(
    requestDesktopKanban,
    'issue.create',
    withKanbanProjectId(input, normalizedProjectId),
    normalizedProjectId
  );
}

export function updateKanbanIssueProtocol(
  requestDesktopKanban: KanbanDesktopRequester,
  id: string,
  input: KanbanIssueUpdateInput,
  projectId = DEFAULT_PROJECT_ID
): Promise<KanbanChangeResult> {
  const normalizedProjectId = normalizeKanbanProjectId(projectId);
  return requestKanbanChangeProtocol(
    requestDesktopKanban,
    'issue.update',
    { id, input: withKanbanProjectId(input, normalizedProjectId) },
    normalizedProjectId
  );
}

export function moveKanbanIssueProtocol(
  requestDesktopKanban: KanbanDesktopRequester,
  id: string,
  status: KanbanStatus,
  position: number,
  baseIssueRevision?: number,
  projectId = DEFAULT_PROJECT_ID
): Promise<KanbanChangeResult> {
  const normalizedProjectId = normalizeKanbanProjectId(projectId);
  return requestKanbanChangeProtocol(
    requestDesktopKanban,
    'issue.move',
    { id, status, position, baseIssueRevision, projectId: normalizedProjectId },
    normalizedProjectId
  );
}

export function deleteKanbanIssueProtocol(
  requestDesktopKanban: KanbanDesktopRequester,
  id: string,
  baseIssueRevision?: number,
  projectId = DEFAULT_PROJECT_ID
): Promise<KanbanChangeResult> {
  const normalizedProjectId = normalizeKanbanProjectId(projectId);
  return requestKanbanChangeProtocol(
    requestDesktopKanban,
    'issue.delete',
    { id, baseIssueRevision, projectId: normalizedProjectId },
    normalizedProjectId
  );
}

function normalizeKanbanRunResult(payload: unknown): KanbanIssueRunResult {
  const record = assertKanbanResponse(
    ensurePayloadRecord(payload, 'Kanban run returned invalid payload'),
    'Kanban run failed'
  );
  const result = {
    ...record,
    ok: record.ok !== false,
    runId: readKanbanText(record.runId),
    chatId: readKanbanText(record.chatId),
    message: readKanbanText(record.message)
  } as KanbanIssueRunResult;
  if (!result.chatId || !result.runId) {
    throw new ApiError('Kanban run did not return chatId and runId', 502, record);
  }
  return result;
}

export class KanbanIssueRunUpdateError extends ApiError {
  readonly issueId: string;
  readonly agentKey: string;
  readonly chatId: string;
  readonly runId: string;

  constructor({
    issueId,
    agentKey,
    chatId,
    runId,
    cause
  }: {
    issueId: string;
    agentKey: string;
    chatId: string;
    runId: string;
    cause: unknown;
  }) {
    const causeMessage = readErrorMessage(cause);
    super(RUN_UPDATE_FAILED_MESSAGE, readErrorStatus(cause), {
      code: RUN_UPDATE_FAILED_CODE,
      issueId,
      agentKey,
      chatId,
      runId,
      ...(causeMessage ? { causeMessage } : {}),
      ...(cause instanceof ApiError ? { cause: cause.payload } : {})
    });
    this.name = 'KanbanIssueRunUpdateError';
    this.issueId = issueId;
    this.agentKey = agentKey;
    this.chatId = chatId;
    this.runId = runId;
  }
}

export function isKanbanIssueRunUpdateError(error: unknown): error is KanbanIssueRunUpdateError {
  if (error instanceof KanbanIssueRunUpdateError) {
    return true;
  }
  return error instanceof ApiError && isObjectRecord(error.payload) && error.payload.code === RUN_UPDATE_FAILED_CODE;
}

export async function startKanbanIssueRunProtocol(
  requestDesktopKanban: KanbanDesktopRequester,
  { issue, agentKey, message, projectId = DEFAULT_PROJECT_ID, signal }: StartKanbanIssueRunApiInput
): Promise<KanbanChangeResult> {
  const normalizedAgentKey = readKanbanText(agentKey);
  if (!normalizedAgentKey) {
    throw new ApiError('Agent is required to start Kanban issue run', 400, { code: 'agent_required' });
  }
  const normalizedMessage = readKanbanText(message);
  if (!normalizedMessage) {
    throw new ApiError('Message is required to start Kanban issue run', 400, { code: 'message_required' });
  }

  const attachments = Array.isArray(issue.attachments) && issue.attachments.length > 0 ? issue.attachments : null;
  const attachmentChatId = readKanbanText(issue.attachmentChatId);
  const runPayload = await requestDesktopKanban<unknown>(
    'assistant.startRun',
    {
      ...(attachmentChatId ? { chatId: attachmentChatId } : {}),
      ...(attachments ? { attachments } : {}),
      agentKey: normalizedAgentKey,
      message: normalizedMessage,
      source: 'copilot'
    },
    signal
  );
  const runResult = normalizeKanbanRunResult(runPayload);

  try {
    const updatePayload = await requestDesktopKanban<unknown>(
      'issue.update',
      {
        id: issue.id,
        input: withKanbanProjectId(
          {
            status: 'in_progress',
            assigneeAgentKey: normalizedAgentKey,
            chatId: runResult.chatId,
            runId: runResult.runId,
            runState: 'running',
            baseIssueRevision: issue.revision
          },
          projectId
        )
      },
      signal
    );
    return normalizeKanbanChangeResult(updatePayload, projectId);
  } catch (error) {
    if (isKanbanAbortError(error)) {
      throw error;
    }
    throw new KanbanIssueRunUpdateError({
      issueId: issue.id,
      agentKey: normalizedAgentKey,
      chatId: runResult.chatId,
      runId: runResult.runId,
      cause: error
    });
  }
}
