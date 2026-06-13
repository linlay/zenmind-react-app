import { ApiError, authenticatedApiRequest } from '../apiClient';

export type KanbanStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'completed';
export type KanbanPriority = 'high' | 'medium' | 'low';
export type KanbanRunState = 'running' | 'completed' | 'failed' | 'cancelled';

export type KanbanIssue = {
  id: string;
  boardId: string;
  projectId: string;
  title: string;
  description: string;
  status: KanbanStatus;
  priority: KanbanPriority;
  severity?: string;
  assigneeAgentKey?: string | null;
  assigneeId?: string | null;
  workerAgent?: string | null;
  workerId?: string | null;
  reviewRequired?: boolean;
  activeReviewId?: string | null;
  activeRunId?: string | null;
  runState?: KanbanRunState | null;
  automationId?: string | null;
  automationEnabled?: boolean;
  automationCron?: string | null;
  automationMessage?: string | null;
  automationTimezone?: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  revision: number;
};

export type KanbanAgent = {
  id?: string;
  agentKey: string;
  name: string;
  description?: string;
  role?: string;
  enabled?: boolean;
};

export type KanbanDesktopAgentOption = {
  agentKey: string;
  displayName: string;
  role?: string;
};

export type KanbanDesktopSession = {
  sessionId: string;
  deviceName?: string;
  deviceAlias?: string;
  hostname?: string;
  username?: string;
  selectedProjectId?: string;
  capabilities?: string[];
  agents?: KanbanDesktopAgentOption[];
  lastSeenAt?: string;
};

export type KanbanDesktopStatus = {
  online: boolean;
  sessionId?: string;
  capabilities?: string[];
  selectedProjectId?: string;
  sessions?: KanbanDesktopSession[];
};

export type KanbanSnapshot = {
  ok: boolean;
  message?: string;
  boardId: string;
  projectId: string;
  revision: number;
  issues: KanbanIssue[];
  agents?: KanbanAgent[];
  desktopStatus?: KanbanDesktopStatus;
};

export type KanbanChangeResult = {
  ok: boolean;
  code?: string;
  message?: string;
  boardId: string;
  projectId: string;
  revision: number;
  issue?: KanbanIssue | null;
  issues?: KanbanIssue[];
  deletedIssueId?: string;
};

export type KanbanIssueInput = {
  title: string;
  projectId?: string;
  description?: string;
  status?: KanbanStatus;
  priority?: KanbanPriority;
  severity?: string;
  assigneeAgentKey?: string | null;
  automationEnabled?: boolean;
  automationCron?: string | null;
  automationMessage?: string | null;
  automationTimezone?: string | null;
};

export type KanbanIssueUpdateInput = Partial<Omit<KanbanIssueInput, 'projectId'>> & {
  runState?: KanbanRunState | null;
  baseIssueRevision?: number;
};

type KanbanRpcEnvelope<T> = {
  v: number;
  type: string;
  id?: string;
  op?: string;
  ok?: boolean;
  error?: {
    code?: string;
    message?: string;
  };
  payload?: T;
};

const DEFAULT_BOARD_ID = 'default';
const DEFAULT_PROJECT_ID = 'default';

function rpcId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function assertRPCPayload<T>(envelope: KanbanRpcEnvelope<T>): T {
  if (envelope.ok === false) {
    throw new ApiError(envelope.error?.message || 'Kanban RPC failed', 200, envelope);
  }
  if (envelope.payload && typeof envelope.payload === 'object' && 'ok' in envelope.payload) {
    const payload = envelope.payload as { ok?: boolean; message?: string };
    if (payload.ok === false) {
      throw new ApiError(payload.message || 'Kanban operation failed', 200, envelope.payload);
    }
  }
  if (envelope.payload === undefined) {
    throw new ApiError('Kanban RPC returned empty payload', 200, envelope);
  }
  return envelope.payload;
}

export async function getKanbanSnapshotApi(
  projectId = DEFAULT_PROJECT_ID,
  signal?: AbortSignal
): Promise<KanbanSnapshot> {
  return authenticatedApiRequest<KanbanSnapshot>({
    path: '/kanban/api/snapshot',
    query: { projectId },
    signal
  });
}

export async function kanbanRpcApi<T>(
  op: string,
  payload: unknown,
  projectId = DEFAULT_PROJECT_ID,
  boardId = DEFAULT_BOARD_ID,
  signal?: AbortSignal
): Promise<T> {
  const envelope = await authenticatedApiRequest<KanbanRpcEnvelope<T>>({
    path: '/kanban/api/rpc',
    method: 'POST',
    body: {
      v: 1,
      type: 'rpc.req',
      id: rpcId(),
      role: 'web',
      boardId,
      projectId,
      op,
      payload
    },
    signal
  });
  return assertRPCPayload(envelope);
}

export function createKanbanIssueApi(
  input: KanbanIssueInput,
  projectId = DEFAULT_PROJECT_ID
): Promise<KanbanChangeResult> {
  return kanbanRpcApi<KanbanChangeResult>('kanban.issue.create', input, projectId);
}

export function updateKanbanIssueApi(
  id: string,
  input: KanbanIssueUpdateInput,
  projectId = DEFAULT_PROJECT_ID
): Promise<KanbanChangeResult> {
  return kanbanRpcApi<KanbanChangeResult>('kanban.issue.update', { id, input }, projectId);
}

export function moveKanbanIssueApi(
  id: string,
  status: KanbanStatus,
  position: number,
  baseIssueRevision?: number,
  projectId = DEFAULT_PROJECT_ID
): Promise<KanbanChangeResult> {
  return kanbanRpcApi<KanbanChangeResult>('kanban.issue.move', { id, status, position, baseIssueRevision }, projectId);
}

export function deleteKanbanIssueApi(
  id: string,
  baseIssueRevision?: number,
  projectId = DEFAULT_PROJECT_ID
): Promise<KanbanChangeResult> {
  return kanbanRpcApi<KanbanChangeResult>('kanban.issue.delete', { id, baseIssueRevision }, projectId);
}
