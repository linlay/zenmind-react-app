import { normalizeQueryModelOverride, type QueryModelOverride } from '../../core/api/services/modelOptionsProtocol.ts';
import { getRemoteChatSourceId } from '../chatPersistence/chatSource.ts';
import type { ChatTimelineRunNode, ChatTimelineState } from './types.ts';
export type ChatRunAccessLevel = 'default' | 'auto_approve' | 'full_access';
export function readRunAccessLevel(value: unknown): ChatRunAccessLevel | undefined {
  return value === 'default' || value === 'auto_approve' || value === 'full_access' ? value : undefined;
}
export function getChatTimelineRun(state: ChatTimelineState, runId: string): ChatTimelineRunNode | null {
  const direct = state.nodesById[`run:${state.conversationId}:${runId}:run`];
  if (direct?.kind === 'run') return direct;
  for (let index = state.orderedNodeIds.length - 1; index >= 0; index--) {
    const node = state.nodesById[state.orderedNodeIds[index]];
    if (node?.kind === 'run' && node.runId === runId) return node;
  }
  return null;
}
export function mergeRunAccessMetadata(
  chosen: ChatTimelineRunNode,
  current: ChatTimelineRunNode,
  incoming: ChatTimelineRunNode
): ChatTimelineRunNode {
  const confirmed = (current.accessLevelVersion ?? 0) >= (incoming.accessLevelVersion ?? 0) ? current : incoming;
  const queryModel = chosen.queryModel ?? current.queryModel ?? incoming.queryModel;
  const isMainRun = current.isMainRun ?? incoming.isMainRun;
  let accessUpdate = chosen.lifecycle === 'active' ? current.accessUpdate : undefined;
  if (accessUpdate?.phase === 'unknown' && (confirmed.accessLevelVersion ?? 0) > accessUpdate.baselineVersion)
    accessUpdate = undefined;
  if (
    chosen.accessLevel === confirmed.accessLevel &&
    chosen.accessLevelVersion === confirmed.accessLevelVersion &&
    chosen.accessUpdate === accessUpdate &&
    chosen.queryModel === queryModel &&
    chosen.isMainRun === isMainRun
  )
    return chosen;
  return {
    ...chosen,
    queryModel,
    isMainRun,
    accessLevel: confirmed.accessLevel,
    accessLevelVersion: confirmed.accessLevelVersion,
    accessUpdate
  };
}
export function applyChatTimelineRunAccess(
  state: ChatTimelineState,
  runId: string,
  input: {
    accessLevel?: unknown;
    version?: unknown;
    update?: ChatTimelineRunNode['accessUpdate'] | null;
  }
): ChatTimelineState {
  const node = getChatTimelineRun(state, runId);
  if (!node) return state;
  const accessLevel = readRunAccessLevel(input.accessLevel);
  const version =
    typeof input.version === 'number' && Number.isSafeInteger(input.version) && input.version >= 1
      ? input.version
      : undefined;
  const canConfirm = accessLevel !== undefined && version !== undefined && version > (node.accessLevelVersion ?? 0);
  let accessUpdate = input.update === null ? undefined : (input.update ?? node.accessUpdate);
  if (
    node.lifecycle !== 'active' ||
    (accessUpdate?.phase === 'unknown' &&
      (canConfirm ? version! : (node.accessLevelVersion ?? 0)) > accessUpdate.baselineVersion)
  )
    accessUpdate = undefined;
  const next = {
    ...node,
    accessLevel: canConfirm ? accessLevel : node.accessLevel,
    accessLevelVersion: canConfirm ? version : node.accessLevelVersion,
    accessUpdate
  };
  if (
    next.accessLevel === node.accessLevel &&
    next.accessLevelVersion === node.accessLevelVersion &&
    next.accessUpdate === node.accessUpdate
  )
    return state;
  // Permission metadata must not change run duration or business ordering timestamps.
  return { ...state, nodesById: { ...state.nodesById, [node.id]: next }, revision: state.revision + 1 };
}

// Scope checks apply before metadata is projected, so child Runs cannot supply Composer defaults.
export function isMainChatRunEvent(event: Record<string, unknown>, conversationId: string): boolean {
  return (
    (!event.chatId || getRemoteChatSourceId(String(event.chatId)) === getRemoteChatSourceId(conversationId)) &&
    !event.taskId &&
    !event.subAgentKey &&
    !event.btwId &&
    !['btw', 'explain'].includes(String(event.lane || '')) &&
    !['btw', 'explain'].includes(String(event.kind || ''))
  );
}

export function resolveChatComposerHistory(state: ChatTimelineState): {
  established: boolean;
  accessLevel?: ChatRunAccessLevel;
  model?: QueryModelOverride;
} {
  const runs = state.orderedNodeIds
    .map((id) => state.nodesById[id])
    .filter((node): node is ChatTimelineRunNode => node?.kind === 'run' && node.isMainRun !== false);
  const run = runs.find((node) => node.runId === state.activeRunId) ?? runs.at(-1);
  if (!run) return { established: false };
  let actual: QueryModelOverride = {};
  for (const id of state.orderedNodeIds) {
    const node = state.nodesById[id];
    if (node?.kind !== 'usage' || node.isMainRun === false || node.runId !== run.runId || !node.usageSummary) continue;
    actual = {
      ...actual,
      ...normalizeQueryModelOverride({
        key: node.usageSummary.modelKey,
        reasoningEffort: node.usageSummary.contextWindow.reasoningEffort,
        serviceTier: node.usageSummary.serviceTier
      })
    };
  }
  const model = { ...actual, ...run.queryModel };
  return {
    established: true,
    accessLevel: run.accessLevel,
    ...(model.key ? { model: { ...model, serviceTier: model.serviceTier || 'STANDARD' } } : {})
  };
}
