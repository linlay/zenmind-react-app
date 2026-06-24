export type KanbanStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'completed';
export type KanbanPriority = 'high' | 'medium' | 'low';
export type KanbanRunState = 'running' | 'completed' | 'failed' | 'cancelled';

export type KanbanIssueAttachment = {
  id?: string;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
  text?: string;
  hidden?: boolean;
  [key: string]: unknown;
};

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
  chatId?: string | null;
  runId?: string | null;
  runState?: KanbanRunState | null;
  automationId?: string | null;
  automationEnabled?: boolean;
  automationCron?: string | null;
  automationMessage?: string | null;
  automationTimezone?: string | null;
  attachmentChatId?: string | null;
  attachments?: readonly KanbanIssueAttachment[];
  lastRunError?: string | null;
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
  chatId?: string | null;
  runId?: string | null;
  runState?: KanbanRunState | null;
  attachmentChatId?: string | null;
  attachments?: readonly KanbanIssueAttachment[];
  baseIssueRevision?: number;
};

export type KanbanIssueRunResult = {
  ok: boolean;
  runId: string;
  chatId: string;
  message: string;
  permissionMode?: string;
  fullAccessExpiresAt?: string | null;
  fullAccessRemainingMs?: number;
};

export type StartKanbanIssueRunApiInput = {
  issue: KanbanIssue;
  agentKey: string;
  message: string;
  projectId?: string;
  signal?: AbortSignal;
};
