import { getChatTimelineRun } from './timelineRunAccess.ts';
import type { ChatDerivation } from '../../core/api/services/chatDerivationProtocol.ts';
import type { ChatTimelineState } from './types.ts';
export function applyChatTimelineRunDerivation(
  state: ChatTimelineState,
  runId: string,
  derivation: ChatDerivation | undefined
): ChatTimelineState {
  const node = getChatTimelineRun(state, runId);
  if (!node || node.derivation === derivation) return state;
  return {
    ...state,
    revision: state.revision + 1,
    nodesById: { ...state.nodesById, [node.id]: { ...node, derivation } }
  };
}
