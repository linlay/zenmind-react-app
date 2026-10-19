import { isRemoteEpochMillis } from '../../core/api/services/chatRemoteTimeProtocol.ts';
import { getChatTimelineRun } from './timelineRunAccess.ts';
import type { ChatTimelineRunNode, ChatTimelineState } from './types.ts';
export type ChatRunFeedback = { type: 'thumbs_down'; comment: string; at: number };
export function readChatRunFeedback(input: Record<string, unknown>): ChatRunFeedback | null | undefined {
  if (!Object.hasOwn(input, 'feedbackType')) return null; // Backend omits all feedback fields after clear.
  if (input.feedbackType === '' || input.feedbackType === null || input.feedbackType === 'clear') return null;
  if (input.feedbackType !== 'thumbs_down' || !isRemoteEpochMillis(input.feedbackAt)) return undefined;
  return {
    type: 'thumbs_down',
    comment: typeof input.feedbackComment === 'string' ? input.feedbackComment : '',
    at: input.feedbackAt
  };
}
export function applyChatTimelineRunFeedback(
  state: ChatTimelineState,
  runId: string,
  input: { feedback?: ChatRunFeedback | null; pending?: ChatTimelineRunNode['feedbackPending'] | null }
): ChatTimelineState {
  const node = getChatTimelineRun(state, runId);
  if (!node) return state;
  const feedback = Object.hasOwn(input, 'feedback') ? input.feedback : node.feedback;
  const feedbackPending = input.pending === null ? undefined : (input.pending ?? node.feedbackPending);
  if (feedback === node.feedback && feedbackPending === node.feedbackPending) return state;
  return {
    ...state,
    revision: state.revision + 1,
    nodesById: { ...state.nodesById, [node.id]: { ...node, feedback, feedbackPending } }
  };
}
export function mergeRunFeedbackMetadata(
  chosen: ChatTimelineRunNode,
  current: ChatTimelineRunNode,
  incoming: ChatTimelineRunNode,
  preserveCurrent: boolean
): ChatTimelineRunNode {
  const feedback =
    current.feedbackPending || (preserveCurrent && current.feedback !== undefined) || incoming.feedback === undefined
      ? current.feedback
      : incoming.feedback;
  if (chosen.feedback === feedback && chosen.feedbackPending === current.feedbackPending) return chosen;
  return { ...chosen, feedback, feedbackPending: current.feedbackPending };
}
