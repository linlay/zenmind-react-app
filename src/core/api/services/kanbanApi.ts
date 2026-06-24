import { getActiveDeviceProfile } from '../../auth/deviceProfiles';
import { sharedWsTransport } from '../../ws/sharedWsTransport';
import { resolveActiveWsTransportConfig } from '../activeWsTransport';
import { ensureKanbanInvalidationSubscribed } from './kanbanInvalidation.ts';
import {
  createKanbanIssueProtocol,
  createRequiredDesktopKanbanRequester,
  deleteKanbanIssueProtocol,
  getKanbanSnapshotProtocol,
  moveKanbanIssueProtocol,
  startKanbanIssueRunProtocol,
  updateKanbanIssueProtocol
} from './kanbanProtocol';
import type {
  KanbanChangeResult,
  KanbanIssueInput,
  KanbanIssueUpdateInput,
  KanbanSnapshot,
  KanbanStatus,
  StartKanbanIssueRunApiInput
} from './kanbanTypes.ts';

export { KanbanIssueRunUpdateError, isKanbanIssueRunUpdateError } from './kanbanProtocol';
export { subscribeKanbanInvalidation } from './kanbanInvalidation.ts';
export type { KanbanDesktopRequester } from './kanbanProtocol';
export type { KanbanInvalidationListener } from './kanbanInvalidation.ts';
export type {
  KanbanAgent,
  KanbanChangeResult,
  KanbanDesktopAgentOption,
  KanbanDesktopSession,
  KanbanDesktopStatus,
  KanbanIssue,
  KanbanIssueAttachment,
  KanbanIssueInput,
  KanbanIssueRunResult,
  KanbanIssueUpdateInput,
  KanbanPriority,
  KanbanRunState,
  KanbanSnapshot,
  KanbanStatus,
  StartKanbanIssueRunApiInput
} from './kanbanTypes.ts';

const DEFAULT_PROJECT_ID = 'default';
const KANBAN_DESKTOP_NAMESPACE = 'd';
const DESKTOP_REQUIRED_MESSAGE =
  'Desktop Kanban requires an active Desktop WS profile. Pair this device with ZenMind Desktop and try again.';
const DESKTOP_UNAVAILABLE_MESSAGE = 'Desktop is not connected. Open ZenMind Desktop and try again.';

const requestDesktopKanbanRequired = createRequiredDesktopKanbanRequester({
  getActiveProfile: getActiveDeviceProfile,
  resolveTransport: resolveActiveWsTransportConfig,
  request: (options) => sharedWsTransport.request(options),
  namespace: KANBAN_DESKTOP_NAMESPACE,
  requiredMessage: DESKTOP_REQUIRED_MESSAGE,
  unavailableMessage: DESKTOP_UNAVAILABLE_MESSAGE
});

export async function getKanbanSnapshotApi(
  projectId = DEFAULT_PROJECT_ID,
  signal?: AbortSignal
): Promise<KanbanSnapshot> {
  const snapshot = await getKanbanSnapshotProtocol(requestDesktopKanbanRequired, projectId, signal);
  ensureKanbanInvalidationSubscribed(requestDesktopKanbanRequired);
  return snapshot;
}

export function createKanbanIssueApi(
  input: KanbanIssueInput,
  projectId = DEFAULT_PROJECT_ID
): Promise<KanbanChangeResult> {
  return createKanbanIssueProtocol(requestDesktopKanbanRequired, input, projectId);
}

export function updateKanbanIssueApi(
  id: string,
  input: KanbanIssueUpdateInput,
  projectId = DEFAULT_PROJECT_ID
): Promise<KanbanChangeResult> {
  return updateKanbanIssueProtocol(requestDesktopKanbanRequired, id, input, projectId);
}

export function moveKanbanIssueApi(
  id: string,
  status: KanbanStatus,
  position: number,
  baseIssueRevision?: number,
  projectId = DEFAULT_PROJECT_ID
): Promise<KanbanChangeResult> {
  return moveKanbanIssueProtocol(requestDesktopKanbanRequired, id, status, position, baseIssueRevision, projectId);
}

export function deleteKanbanIssueApi(
  id: string,
  baseIssueRevision?: number,
  projectId = DEFAULT_PROJECT_ID
): Promise<KanbanChangeResult> {
  return deleteKanbanIssueProtocol(requestDesktopKanbanRequired, id, baseIssueRevision, projectId);
}

export async function startKanbanIssueRunApi({
  issue,
  agentKey,
  message,
  projectId = DEFAULT_PROJECT_ID,
  signal
}: StartKanbanIssueRunApiInput): Promise<KanbanChangeResult> {
  return startKanbanIssueRunProtocol(requestDesktopKanbanRequired, { issue, agentKey, message, projectId, signal });
}
