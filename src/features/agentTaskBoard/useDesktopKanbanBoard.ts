import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';

import {
  createKanbanIssueApi,
  deleteKanbanIssueApi,
  getKanbanSnapshotApi,
  isKanbanIssueRunUpdateError,
  moveKanbanIssueApi,
  startKanbanIssueRunApi,
  subscribeKanbanInvalidation,
  type KanbanChangeResult,
  type KanbanIssue,
  type KanbanSnapshot
} from '../../core/api/services/kanbanApi';
import { buildKanbanAssistantPrompt } from './kanbanAssistantPrompt';
import {
  nextAppliedSnapshotRevision,
  nextIssueIdSet,
  reconcileStartedRunIssueIds,
  shouldApplySnapshotRevision
} from './kanbanRunGuards';
import {
  applyKanbanChangeResult,
  createBoardTaskIndex,
  deriveAgentOptions,
  deriveBoardTasks,
  nextIssuePosition,
  type AgentOption,
  type BoardTask,
  type BoardViewText,
  type TaskPriority
} from './kanbanViewModel';

export type TaskDraftForm = {
  title: string;
  description: string;
  priority: TaskPriority;
};

export type UseDesktopKanbanBoardOptions = {
  enabled?: boolean;
  projectId?: string;
  text: BoardViewText;
  errorFallback?: string;
  missingTaskFallback?: string;
  runStartedSyncPendingFallback?: string;
};

export type DesktopKanbanBoardState = {
  snapshot: KanbanSnapshot | null;
  tasks: readonly BoardTask[];
  taskById: ReadonlyMap<string, BoardTask>;
  issueById: ReadonlyMap<string, KanbanIssue>;
  agents: readonly AgentOption[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  creating: boolean;
  pendingIssueIds: ReadonlySet<string>;
  refresh: () => Promise<void>;
  createTask: (draft: TaskDraftForm) => Promise<string | null>;
  assignAndRunTask: (taskId: string, agent: AgentOption) => Promise<void>;
  completeReview: (task: BoardTask) => Promise<void>;
  deleteTask: (task: BoardTask) => Promise<void>;
};

type BoardRuntimeState = Pick<
  DesktopKanbanBoardState,
  'snapshot' | 'loading' | 'refreshing' | 'error' | 'creating' | 'pendingIssueIds'
>;
type PendingCommitOptions = {
  error?: string | null;
};

const DEFAULT_PROJECT_ID = 'default';
const REFRESH_DEBOUNCE_MS = 150;
const EMPTY_PENDING_ISSUE_IDS: ReadonlySet<string> = new Set();

export function createEmptyTaskDraft(): TaskDraftForm {
  return {
    title: '',
    description: '',
    priority: 'medium'
  };
}

function normalizeProjectId(projectId: string | undefined): string {
  const value = String(projectId || '').trim();
  return value || DEFAULT_PROJECT_ID;
}

function messageFromError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function readRevision(value: { revision?: number }): number {
  return Number.isFinite(value.revision) ? Number(value.revision) : 0;
}

function createKanbanIssueIndex(snapshot: KanbanSnapshot | null): ReadonlyMap<string, KanbanIssue> {
  const issueById = new Map<string, KanbanIssue>();
  snapshot?.issues.forEach((issue) => {
    issueById.set(issue.id, issue);
  });
  return issueById;
}

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left === right) {
    return true;
  }
  if (left.size !== right.size) {
    return false;
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
}

function mergedPendingIssueIds(active: ReadonlySet<string>, syncPending: ReadonlySet<string>): ReadonlySet<string> {
  if (active.size <= 0 && syncPending.size <= 0) {
    return EMPTY_PENDING_ISSUE_IDS;
  }
  if (active.size <= 0) {
    return syncPending;
  }
  if (syncPending.size <= 0) {
    return active;
  }

  const next = new Set(active);
  syncPending.forEach((issueId) => next.add(issueId));
  return next;
}

function updateIssueIdSet(ref: MutableRefObject<ReadonlySet<string>>, issueId: string, included: boolean): boolean {
  const next = nextIssueIdSet(ref.current, issueId, included);
  if (!next) {
    return false;
  }
  ref.current = next;
  return true;
}

export function useDesktopKanbanBoard({
  enabled = true,
  projectId,
  text,
  errorFallback = 'Kanban operation failed',
  missingTaskFallback = 'Task not found',
  runStartedSyncPendingFallback = 'The run started, but the task card is still syncing.'
}: UseDesktopKanbanBoardOptions): DesktopKanbanBoardState {
  const [state, setState] = useState<BoardRuntimeState>({
    snapshot: null,
    loading: true,
    refreshing: false,
    error: null,
    creating: false,
    pendingIssueIds: EMPTY_PENDING_ISSUE_IDS
  });
  const normalizedProjectId = normalizeProjectId(projectId);
  const tasks = useMemo(() => deriveBoardTasks(state.snapshot, text), [state.snapshot, text]);
  const taskById = useMemo(() => createBoardTaskIndex(tasks), [tasks]);
  const issueById = useMemo(() => createKanbanIssueIndex(state.snapshot), [state.snapshot]);
  const agents = useMemo(() => deriveAgentOptions(state.snapshot, tasks, text), [state.snapshot, tasks, text]);

  const projectIdRef = useRef(normalizedProjectId);
  const errorFallbackRef = useRef(errorFallback);
  const missingTaskFallbackRef = useRef(missingTaskFallback);
  const runStartedSyncPendingFallbackRef = useRef(runStartedSyncPendingFallback);
  const snapshotRef = useRef<KanbanSnapshot | null>(state.snapshot);
  const tasksRef = useRef(tasks);
  const issueByIdRef = useRef(issueById);
  const activeControllerRef = useRef<AbortController | null>(null);
  const refreshSeqRef = useRef(0);
  const lastAppliedRevisionRef = useRef(-1);
  const mountedRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const creatingRef = useRef(false);
  const activePendingIssueIdsRef = useRef<ReadonlySet<string>>(EMPTY_PENDING_ISSUE_IDS);
  const syncPendingIssueIdsRef = useRef<ReadonlySet<string>>(EMPTY_PENDING_ISSUE_IDS);
  const enabledRef = useRef(enabled);

  enabledRef.current = enabled;
  projectIdRef.current = normalizedProjectId;
  errorFallbackRef.current = errorFallback;
  missingTaskFallbackRef.current = missingTaskFallback;
  runStartedSyncPendingFallbackRef.current = runStartedSyncPendingFallback;
  snapshotRef.current = state.snapshot;
  tasksRef.current = tasks;
  issueByIdRef.current = issueById;

  const setBoardState = useCallback((updater: (current: BoardRuntimeState) => BoardRuntimeState) => {
    if (!mountedRef.current) {
      return;
    }
    setState((current) => {
      const next = updater(current);
      snapshotRef.current = next.snapshot;
      return next;
    });
  }, []);

  const commitPendingIssueIds = useCallback(
    (options?: PendingCommitOptions) => {
      const next = mergedPendingIssueIds(activePendingIssueIdsRef.current, syncPendingIssueIdsRef.current);
      setBoardState((current) => {
        const pendingUnchanged = setsEqual(current.pendingIssueIds, next);
        const nextError = options && 'error' in options ? (options.error ?? null) : current.error;

        if (pendingUnchanged && current.error === nextError) {
          return current;
        }

        return {
          ...current,
          error: nextError,
          pendingIssueIds: pendingUnchanged ? current.pendingIssueIds : next
        };
      });
    },
    [setBoardState]
  );

  const markPending = useCallback(
    (issueId: string, options?: PendingCommitOptions) => {
      const changed = updateIssueIdSet(activePendingIssueIdsRef, issueId, true);
      if (changed || options) {
        commitPendingIssueIds(options);
      }
    },
    [commitPendingIssueIds]
  );

  const unmarkPending = useCallback(
    (issueId: string) => {
      if (updateIssueIdSet(activePendingIssueIdsRef, issueId, false)) {
        commitPendingIssueIds();
      }
    },
    [commitPendingIssueIds]
  );

  const markSyncPending = useCallback(
    (issueId: string, options?: PendingCommitOptions) => {
      const changed = updateIssueIdSet(syncPendingIssueIdsRef, issueId, true);
      if (changed || options) {
        commitPendingIssueIds(options);
      }
    },
    [commitPendingIssueIds]
  );

  const setError = useCallback(
    (error: unknown, fallback: string) => {
      const message = messageFromError(error, fallback);
      setBoardState((current) => (current.error === message ? current : { ...current, error: message }));
    },
    [setBoardState]
  );

  const applySnapshot = useCallback(
    (snapshot: KanbanSnapshot) => {
      const revision = readRevision(snapshot);
      if (!shouldApplySnapshotRevision(revision, lastAppliedRevisionRef.current)) {
        return;
      }

      lastAppliedRevisionRef.current = nextAppliedSnapshotRevision(lastAppliedRevisionRef.current, revision);
      setBoardState((current) => ({ ...current, snapshot }));
    },
    [setBoardState]
  );

  const applyChangeResult = useCallback(
    (result: KanbanChangeResult, completedIssueId?: string) => {
      const revision = readRevision(result);
      lastAppliedRevisionRef.current = nextAppliedSnapshotRevision(lastAppliedRevisionRef.current, revision);
      const shouldCommitPending = Boolean(completedIssueId);
      if (completedIssueId) {
        updateIssueIdSet(activePendingIssueIdsRef, completedIssueId, false);
      }
      setBoardState((current) => ({
        ...current,
        snapshot: applyKanbanChangeResult(current.snapshot, result),
        pendingIssueIds: shouldCommitPending
          ? mergedPendingIssueIds(activePendingIssueIdsRef.current, syncPendingIssueIdsRef.current)
          : current.pendingIssueIds
      }));
    },
    [setBoardState]
  );

  const runRefresh = useCallback(
    async ({ abortPrevious }: { abortPrevious: boolean }) => {
      if (!enabledRef.current) {
        return;
      }
      if (abortPrevious) {
        activeControllerRef.current?.abort();
      }

      const controller = new AbortController();
      activeControllerRef.current = controller;
      refreshSeqRef.current += 1;
      const seq = refreshSeqRef.current;
      const firstLoad = !hasLoadedOnceRef.current;

      setBoardState((current) => ({
        ...current,
        loading: firstLoad,
        refreshing: !firstLoad,
        error: null
      }));

      try {
        const snapshot = await getKanbanSnapshotApi(projectIdRef.current, controller.signal);
        if (!mountedRef.current || controller.signal.aborted || seq !== refreshSeqRef.current) {
          return;
        }
        applySnapshot(snapshot);
      } catch (error) {
        if (isAbortError(error) || !mountedRef.current || controller.signal.aborted || seq !== refreshSeqRef.current) {
          return;
        }
        setError(error, errorFallbackRef.current);
      } finally {
        if (mountedRef.current && !controller.signal.aborted && seq === refreshSeqRef.current) {
          hasLoadedOnceRef.current = true;
          setBoardState((current) => ({ ...current, loading: false, refreshing: false }));
        }
        if (activeControllerRef.current === controller) {
          activeControllerRef.current = null;
        }
      }
    },
    [applySnapshot, setBoardState, setError]
  );

  const refresh = useCallback(() => runRefresh({ abortPrevious: true }), [runRefresh]);

  const scheduleRefresh = useCallback(
    (_reason: string) => {
      if (!mountedRef.current || !enabledRef.current) {
        return;
      }

      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        void runRefresh({ abortPrevious: true });
      }, REFRESH_DEBOUNCE_MS);
    },
    [runRefresh]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeControllerRef.current?.abort();
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    lastAppliedRevisionRef.current = -1;
  }, [normalizedProjectId]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void refresh();
  }, [enabled, normalizedProjectId, refresh]);

  useEffect(() => {
    if (enabled) {
      return;
    }
    activeControllerRef.current?.abort();
    activeControllerRef.current = null;
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    setBoardState((current) => (current.refreshing ? { ...current, refreshing: false } : current));
  }, [enabled, setBoardState]);

  useEffect(
    () => {
      if (!enabled) {
        return undefined;
      }
      return subscribeKanbanInvalidation(() => scheduleRefresh('desktop-push'), normalizedProjectId);
    },
    [enabled, normalizedProjectId, scheduleRefresh]
  );

  useEffect(() => {
    const next = reconcileStartedRunIssueIds(syncPendingIssueIdsRef.current, state.snapshot);
    if (!next) {
      return;
    }
    syncPendingIssueIdsRef.current = next.size > 0 ? next : EMPTY_PENDING_ISSUE_IDS;
    commitPendingIssueIds();
  }, [commitPendingIssueIds, state.snapshot]);

  const createTask = useCallback(
    async (draft: TaskDraftForm): Promise<string | null> => {
      const title = draft.title.trim();
      if (creatingRef.current || !title) {
        return null;
      }

      creatingRef.current = true;
      setBoardState((current) => ({ ...current, creating: true, error: null }));
      try {
        const projectIdForRequest = snapshotRef.current?.projectId ?? projectIdRef.current;
        const result = await createKanbanIssueApi(
          {
            title,
            description: draft.description.trim(),
            status: 'backlog',
            priority: draft.priority,
            severity: 'medium'
          },
          projectIdForRequest
        );
        applyChangeResult(result);
        return result.issue?.id ?? result.issues?.[0]?.id ?? null;
      } catch (error) {
        setError(error, errorFallbackRef.current);
        return null;
      } finally {
        creatingRef.current = false;
        setBoardState((current) => ({ ...current, creating: false }));
      }
    },
    [applyChangeResult, setBoardState, setError]
  );

  const assignAndRunTask = useCallback(
    async (taskId: string, agent: AgentOption): Promise<void> => {
      const issue = issueByIdRef.current.get(taskId);
      if (!issue) {
        const error = new Error(missingTaskFallbackRef.current);
        setError(error, missingTaskFallbackRef.current);
        throw error;
      }
      if (
        issue.runState === 'running' ||
        activePendingIssueIdsRef.current.has(taskId) ||
        syncPendingIssueIdsRef.current.has(taskId)
      ) {
        return;
      }

      markPending(taskId, { error: null });
      try {
        const result = await startKanbanIssueRunApi({
          issue,
          agentKey: agent.key,
          message: buildKanbanAssistantPrompt(issue),
          projectId: snapshotRef.current?.projectId ?? issue.projectId ?? projectIdRef.current
        });
        applyChangeResult(result, taskId);
      } catch (error) {
        if (isKanbanIssueRunUpdateError(error)) {
          markSyncPending(error.issueId || taskId, {
            error: runStartedSyncPendingFallbackRef.current
          });
        } else {
          setError(error, errorFallbackRef.current);
        }
        throw error;
      } finally {
        unmarkPending(taskId);
      }
    },
    [applyChangeResult, markPending, markSyncPending, setError, unmarkPending]
  );

  const completeReview = useCallback(
    async (task: BoardTask): Promise<void> => {
      if (activePendingIssueIdsRef.current.has(task.id) || syncPendingIssueIdsRef.current.has(task.id)) {
        return;
      }

      markPending(task.id, { error: null });
      try {
        const result = await moveKanbanIssueApi(
          task.id,
          'completed',
          nextIssuePosition(tasksRef.current, 'completed'),
          task.revision,
          snapshotRef.current?.projectId ?? projectIdRef.current
        );
        applyChangeResult(result, task.id);
      } catch (error) {
        setError(error, errorFallbackRef.current);
        throw error;
      } finally {
        unmarkPending(task.id);
      }
    },
    [applyChangeResult, markPending, setError, unmarkPending]
  );

  const deleteTask = useCallback(
    async (task: BoardTask): Promise<void> => {
      if (activePendingIssueIdsRef.current.has(task.id) || syncPendingIssueIdsRef.current.has(task.id)) {
        return;
      }

      markPending(task.id, { error: null });
      try {
        const result = await deleteKanbanIssueApi(
          task.id,
          task.revision,
          snapshotRef.current?.projectId ?? projectIdRef.current
        );
        applyChangeResult(result, task.id);
      } catch (error) {
        setError(error, errorFallbackRef.current);
        throw error;
      } finally {
        unmarkPending(task.id);
      }
    },
    [applyChangeResult, markPending, setError, unmarkPending]
  );

  return {
    snapshot: state.snapshot,
    tasks,
    taskById,
    issueById,
    agents,
    loading: state.loading,
    refreshing: state.refreshing,
    error: state.error,
    creating: state.creating,
    pendingIssueIds: state.pendingIssueIds,
    refresh,
    createTask,
    assignAndRunTask,
    completeReview,
    deleteTask
  };
}
