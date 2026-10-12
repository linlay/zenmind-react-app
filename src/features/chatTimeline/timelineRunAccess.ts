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
  let accessUpdate = chosen.lifecycle === 'active' ? current.accessUpdate : undefined;
  if (accessUpdate?.phase === 'unknown' && (confirmed.accessLevelVersion ?? 0) > accessUpdate.baselineVersion)
    accessUpdate = undefined;
  if (
    chosen.accessLevel === confirmed.accessLevel &&
    chosen.accessLevelVersion === confirmed.accessLevelVersion &&
    chosen.accessUpdate === accessUpdate
  )
    return chosen;
  return {
    ...chosen,
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
