import { sharedWsTransport, type SharedWsSubscription } from '../../ws/sharedWsTransport.ts';

export type KanbanInvalidationListener = () => void;

type KanbanInvalidationRequester = <T>(type: string, payload?: unknown) => Promise<T>;

const DEFAULT_PROJECT_ID = 'default';
const KANBAN_DESKTOP_NAMESPACE = 'd';
const KANBAN_INVALIDATION_TYPES = [
  'snapshot.updated',
  'issue.created',
  'issue.updated',
  'issue.moved',
  'issue.deleted',
  'assistant.event',
  'assistant.run.started',
  'assistant.run.finished',
  'agent.catalog.updated'
] as const;
const KANBAN_INVALIDATION_TYPE_SET = new Set<string>(KANBAN_INVALIDATION_TYPES);

let kanbanInvalidationSubscriberCount = 0;
let kanbanInvalidationSubscribed = false;
let kanbanInvalidationSubscribeRequest: Promise<void> | null = null;
let kanbanInvalidationRequester: KanbanInvalidationRequester | null = null;
let unsubscribeKanbanInvalidationStatus: SharedWsSubscription | null = null;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeProjectId(projectId: string | undefined): string {
  return readText(projectId) || DEFAULT_PROJECT_ID;
}

function ensureKanbanInvalidationStatusObserver(): void {
  if (unsubscribeKanbanInvalidationStatus) {
    return;
  }

  unsubscribeKanbanInvalidationStatus = sharedWsTransport.subscribeStatus((status) => {
    if (status !== 'connected') {
      kanbanInvalidationSubscribed = false;
    }
  });
}

export function ensureKanbanInvalidationSubscribed(requestDesktopKanban: KanbanInvalidationRequester): void {
  if (
    kanbanInvalidationSubscriberCount <= 0 ||
    kanbanInvalidationSubscribed ||
    kanbanInvalidationSubscribeRequest ||
    sharedWsTransport.getStatus() !== 'connected'
  ) {
    return;
  }

  kanbanInvalidationRequester = requestDesktopKanban;
  kanbanInvalidationSubscribeRequest = requestDesktopKanban('event.subscribe', {
    types: KANBAN_INVALIDATION_TYPES
  })
    .then(() => {
      kanbanInvalidationSubscribed = true;
      if (kanbanInvalidationSubscriberCount === 0) {
        releaseKanbanInvalidationSubscription(requestDesktopKanban);
      }
    })
    .catch(() => {
      kanbanInvalidationSubscribed = false;
    })
    .finally(() => {
      kanbanInvalidationSubscribeRequest = null;
    });
}

function releaseKanbanInvalidationSubscription(requestDesktopKanban = kanbanInvalidationRequester): void {
  if (kanbanInvalidationSubscriberCount > 0) {
    return;
  }

  unsubscribeKanbanInvalidationStatus?.();
  unsubscribeKanbanInvalidationStatus = null;

  if (!kanbanInvalidationSubscribed) {
    return;
  }

  kanbanInvalidationSubscribed = false;
  if (requestDesktopKanban && sharedWsTransport.getStatus() === 'connected') {
    void requestDesktopKanban('event.unsubscribe', { types: KANBAN_INVALIDATION_TYPES }).catch(() => undefined);
  }
  kanbanInvalidationRequester = null;
}

function readInvalidationPayload(frame: Record<string, unknown>): unknown {
  return frame.data ?? frame.payload;
}

function readInvalidationProjectId(frame: Record<string, unknown>, payload: unknown): string {
  if (isObjectRecord(payload)) {
    const payloadProjectId = readText(payload.projectId);
    if (payloadProjectId) {
      return payloadProjectId;
    }
  }
  return readText(frame.projectId);
}

export function shouldHandleKanbanInvalidation(frame: unknown, projectId = DEFAULT_PROJECT_ID): boolean {
  if (!isObjectRecord(frame)) {
    return false;
  }

  const namespace = readText(frame.ns);
  if (namespace && namespace !== KANBAN_DESKTOP_NAMESPACE) {
    return false;
  }

  const payload = readInvalidationPayload(frame);
  const type = readText(frame.type) || (isObjectRecord(payload) ? readText(payload.type) : '');
  if (!KANBAN_INVALIDATION_TYPE_SET.has(type)) {
    return false;
  }

  const payloadProjectId = readInvalidationProjectId(frame, payload);
  return !payloadProjectId || payloadProjectId === normalizeProjectId(projectId);
}

export function subscribeKanbanInvalidation(
  listener: KanbanInvalidationListener,
  projectId = DEFAULT_PROJECT_ID
): SharedWsSubscription {
  let active = true;
  let disposed = false;
  const normalizedProjectId = normalizeProjectId(projectId);
  kanbanInvalidationSubscriberCount += 1;
  ensureKanbanInvalidationStatusObserver();

  const unsubscribePush = sharedWsTransport.subscribePush((frame) => {
    if (!active || !shouldHandleKanbanInvalidation(frame, normalizedProjectId)) {
      return;
    }
    listener();
  });

  return () => {
    if (disposed) {
      return;
    }
    active = false;
    disposed = true;
    unsubscribePush();
    kanbanInvalidationSubscriberCount = Math.max(0, kanbanInvalidationSubscriberCount - 1);
    releaseKanbanInvalidationSubscription();
  };
}
