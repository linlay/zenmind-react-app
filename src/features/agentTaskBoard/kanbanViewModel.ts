import type {
  KanbanAgent,
  KanbanChangeResult,
  KanbanIssue,
  KanbanPriority,
  KanbanSnapshot,
  KanbanStatus
} from '../../core/api/services/kanbanApi';

export type TaskStage = 'intake' | 'assigned' | 'running' | 'review' | 'done';
export type TaskPriority = 'high' | 'medium' | 'low';
export type BoardQueue = 'focus' | 'running' | 'review';

export type BoardTask = {
  id: string;
  title: string;
  outcome: string;
  stage: TaskStage;
  status: KanbanStatus;
  priority: TaskPriority;
  agentName: string;
  dueLabel: string;
  nextAction: string;
  blocker?: string;
  progress: number;
  position: number;
  revision: number;
};

export type AgentOption = {
  key: string;
  name: string;
  load: string;
  fitText: string;
  status: 'ready' | 'busy' | 'waiting';
};

export type BoardSummary = {
  visibleTasks: readonly BoardTask[];
  intakeCount: number;
  reviewCount: number;
  blockedCount: number;
  focusTask: BoardTask | undefined;
};

export type BoardViewText = {
  noDescription: string;
  completedDue: string;
  unscheduledDue: string;
  untitledTask: string;
  unassignedAgent: string;
  actionRunFailed: string;
  actionRunCancelled: string;
  actionAssignAgent: string;
  actionWaitingRun: string;
  actionTrackRun: string;
  actionReview: string;
  actionArchive: string;
  blockerRunFailed: string;
  blockerRunCancelled: string;
  blockerReviewRequired: string;
  catalogAgentFallback: string;
  desktopOnline: string;
  existingAssignee: string;
};

const STATUS_STAGE: Record<KanbanStatus, TaskStage> = {
  backlog: 'intake',
  todo: 'assigned',
  in_progress: 'running',
  in_review: 'review',
  completed: 'done'
};

const STAGE_RANK: Record<TaskStage, number> = {
  intake: 0,
  assigned: 1,
  running: 2,
  review: 3,
  done: 4
};

const PRIORITY_RANK: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2
};

function normalizePriority(value: KanbanPriority | string | undefined): TaskPriority {
  if (value === 'high' || value === 'medium' || value === 'low') {
    return value;
  }
  return 'medium';
}

function normalizeStatus(value: KanbanStatus | string | undefined): KanbanStatus {
  if (
    value === 'backlog' ||
    value === 'todo' ||
    value === 'in_progress' ||
    value === 'in_review' ||
    value === 'completed'
  ) {
    return value;
  }
  return 'backlog';
}

function textOrFallback(value: string | null | undefined, fallback: string): string {
  const text = String(value || '').trim();
  return text || fallback;
}

function firstDescriptionLine(description: string, text: BoardViewText): string {
  const firstLine = description
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine || text.noDescription;
}

function formatIssueTime(value: string | undefined, status: KanbanStatus, text: BoardViewText): string {
  if (status === 'completed') {
    return text.completedDue;
  }
  const timestamp = Date.parse(String(value || ''));
  if (!Number.isFinite(timestamp)) {
    return text.unscheduledDue;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp));
}

function stageProgress(stage: TaskStage, issue: KanbanIssue): number {
  if (stage === 'done') {
    return 100;
  }
  if (issue.runState === 'failed' || issue.runState === 'cancelled') {
    return 72;
  }
  if (stage === 'review') {
    return 86;
  }
  if (stage === 'running') {
    return issue.runState === 'completed' ? 82 : 64;
  }
  if (stage === 'assigned') {
    return 28;
  }
  return 8;
}

function nextActionFor(stage: TaskStage, issue: KanbanIssue, text: BoardViewText): string {
  if (issue.runState === 'failed') {
    return text.actionRunFailed;
  }
  if (issue.runState === 'cancelled') {
    return text.actionRunCancelled;
  }
  if (stage === 'intake') {
    return text.actionAssignAgent;
  }
  if (stage === 'assigned') {
    return text.actionWaitingRun;
  }
  if (stage === 'running') {
    return text.actionTrackRun;
  }
  if (stage === 'review') {
    return text.actionReview;
  }
  return text.actionArchive;
}

function blockerFor(stage: TaskStage, issue: KanbanIssue, text: BoardViewText): string | undefined {
  if (issue.runState === 'failed') {
    return text.blockerRunFailed;
  }
  if (issue.runState === 'cancelled') {
    return text.blockerRunCancelled;
  }
  if (stage === 'review' && (issue.reviewRequired || issue.activeReviewId)) {
    return text.blockerReviewRequired;
  }
  return undefined;
}

function agentNameFor(issue: KanbanIssue, text: BoardViewText): string {
  return textOrFallback(
    issue.assigneeAgentKey || issue.workerAgent || issue.assigneeId || issue.workerId,
    text.unassignedAgent
  );
}

function compareTasks(left: BoardTask, right: BoardTask): number {
  return (
    STAGE_RANK[left.stage] - STAGE_RANK[right.stage] ||
    PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority] ||
    left.position - right.position ||
    right.revision - left.revision
  );
}

export function deriveBoardTasks(snapshot: KanbanSnapshot | null, text: BoardViewText): readonly BoardTask[] {
  if (!snapshot) {
    return [];
  }
  return snapshot.issues
    .map((issue) => {
      const status = normalizeStatus(issue.status);
      const stage = STATUS_STAGE[status];
      const priority = normalizePriority(issue.priority);
      return {
        id: issue.id,
        title: textOrFallback(issue.title, text.untitledTask),
        outcome: firstDescriptionLine(issue.description, text),
        stage,
        status,
        priority,
        agentName: agentNameFor(issue, text),
        dueLabel: formatIssueTime(issue.updatedAt || issue.createdAt, status, text),
        nextAction: nextActionFor(stage, issue, text),
        blocker: blockerFor(stage, issue, text),
        progress: stageProgress(stage, issue),
        position: Number.isFinite(issue.position) ? issue.position : 0,
        revision: Number.isFinite(issue.revision) ? issue.revision : 0
      };
    })
    .sort(compareTasks);
}

export function deriveBoardSummary(tasks: readonly BoardTask[], queue: BoardQueue): BoardSummary {
  const visibleTasks: BoardTask[] = [];
  let intakeCount = 0;
  let reviewCount = 0;
  let blockedCount = 0;
  let firstBlockedTask: BoardTask | undefined;
  let firstIntakeTask: BoardTask | undefined;

  tasks.forEach((task) => {
    const isIntake = task.stage === 'intake';
    const isReview = task.stage === 'review';
    const isBlocked = Boolean(task.blocker);

    if (isIntake) {
      intakeCount += 1;
      firstIntakeTask ??= task;
    }
    if (isReview) {
      reviewCount += 1;
    }
    if (isBlocked) {
      blockedCount += 1;
      firstBlockedTask ??= task;
    }

    if (
      (queue === 'focus' && (isIntake || isBlocked)) ||
      (queue === 'running' && (task.stage === 'assigned' || task.stage === 'running')) ||
      (queue === 'review' && isReview)
    ) {
      visibleTasks.push(task);
    }
  });

  return {
    visibleTasks,
    intakeCount,
    reviewCount,
    blockedCount,
    focusTask: firstBlockedTask ?? firstIntakeTask
  };
}

function addAgent(target: Map<string, AgentOption>, agent: AgentOption) {
  const key = agent.key.trim();
  if (!key || target.has(key)) {
    return;
  }
  target.set(key, { ...agent, key });
}

function addCatalogAgent(target: Map<string, AgentOption>, agent: KanbanAgent, text: BoardViewText) {
  if (agent.enabled === false) {
    return;
  }
  addAgent(target, {
    key: agent.agentKey,
    name: textOrFallback(agent.name, agent.agentKey),
    load: 'enabled',
    fitText: textOrFallback(agent.description || agent.role, text.catalogAgentFallback),
    status: 'waiting'
  });
}

export function deriveAgentOptions(
  snapshot: KanbanSnapshot | null,
  tasks: readonly BoardTask[],
  text: BoardViewText
): readonly AgentOption[] {
  const agents = new Map<string, AgentOption>();

  snapshot?.desktopStatus?.sessions?.forEach((session) => {
    session.agents?.forEach((agent) => {
      addAgent(agents, {
        key: agent.agentKey,
        name: textOrFallback(agent.displayName, agent.agentKey),
        load: 'online',
        fitText: textOrFallback(
          agent.role,
          textOrFallback(session.deviceAlias || session.deviceName || session.hostname, text.desktopOnline)
        ),
        status: 'ready'
      });
    });
  });

  snapshot?.agents?.forEach((agent) => addCatalogAgent(agents, agent, text));

  tasks.forEach((task) => {
    if (task.agentName === text.unassignedAgent) {
      return;
    }
    addAgent(agents, {
      key: task.agentName,
      name: task.agentName,
      load: 'assigned',
      fitText: text.existingAssignee,
      status: task.stage === 'running' ? 'busy' : 'waiting'
    });
  });

  return Array.from(agents.values()).sort((left, right) => {
    const leftRank = left.status === 'ready' ? 0 : left.status === 'waiting' ? 1 : 2;
    const rightRank = right.status === 'ready' ? 0 : right.status === 'waiting' ? 1 : 2;
    return leftRank - rightRank || left.name.localeCompare(right.name);
  });
}

export function getAgentPreview(agents: readonly AgentOption[]): readonly AgentOption[] {
  const readyAgents: AgentOption[] = [];
  const fallbackAgents: AgentOption[] = [];

  for (const agent of agents) {
    if (agent.status === 'ready') {
      readyAgents.push(agent);
      if (readyAgents.length === 3) {
        return readyAgents;
      }
    } else if (fallbackAgents.length < 3) {
      fallbackAgents.push(agent);
    }
  }

  return readyAgents.concat(fallbackAgents).slice(0, 3);
}

export function createBoardTaskIndex(tasks: readonly BoardTask[]): ReadonlyMap<string, BoardTask> {
  const taskById = new Map<string, BoardTask>();
  tasks.forEach((task) => {
    taskById.set(task.id, task);
  });
  return taskById;
}

export function nextIssuePosition(tasks: readonly BoardTask[], status: KanbanStatus): number {
  let max = 0;
  tasks.forEach((task) => {
    if (task.status === status && Number.isFinite(task.position)) {
      max = Math.max(max, task.position);
    }
  });
  return max + 1024;
}

export function applyKanbanChangeResult(
  snapshot: KanbanSnapshot | null,
  result: KanbanChangeResult
): KanbanSnapshot | null {
  if (!snapshot) {
    const issues = result.issues ?? (result.issue ? [result.issue] : []);
    return {
      ok: result.ok,
      message: result.message,
      boardId: result.boardId,
      projectId: result.projectId,
      revision: result.revision,
      issues
    };
  }
  if (result.issues) {
    return {
      ...snapshot,
      boardId: result.boardId || snapshot.boardId,
      projectId: result.projectId || snapshot.projectId,
      revision: result.revision || snapshot.revision,
      issues: result.issues
    };
  }
  if (result.deletedIssueId) {
    return {
      ...snapshot,
      revision: result.revision || snapshot.revision,
      issues: snapshot.issues.filter((issue) => issue.id !== result.deletedIssueId)
    };
  }
  if (result.issue) {
    const nextIssue = result.issue;
    const found = snapshot.issues.some((issue) => issue.id === nextIssue.id);
    return {
      ...snapshot,
      revision: result.revision || snapshot.revision,
      issues: found
        ? snapshot.issues.map((issue) => (issue.id === nextIssue.id ? nextIssue : issue))
        : [...snapshot.issues, nextIssue]
    };
  }
  return snapshot;
}
