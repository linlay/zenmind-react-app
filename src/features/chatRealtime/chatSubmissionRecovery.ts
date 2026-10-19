import type { ChatTimelineMessageNode, ChatTimelineState } from '../chatTimeline/types.ts';

export function getLatestFailedChatSubmission(state: ChatTimelineState): ChatTimelineMessageNode | null {
  if (state.activeRunId || state.awaiting?.status === 'ask') return null;
  for (let index = state.orderedNodeIds.length - 1; index >= 0; index--) {
    const node = state.nodesById[state.orderedNodeIds[index]];
    if (node?.kind !== 'message' || node.role !== 'user' || node.messageVariant !== 'default') continue;
    return node.deliveryStatus === 'failed' && node.clientMessageId && !node.runId ? node : null;
  }
  return null;
}

/** Only an explicit pre-acceptance rejection permits recovery without a history check. */
export function getRecoverableChatSubmission(state: ChatTimelineState): ChatTimelineMessageNode | null {
  const node = getLatestFailedChatSubmission(state);
  const status = node?.errorDetail?.status ?? 0;
  return node && node.errorReason !== 'submission_unconfirmed' && status >= 400 && status < 500 && status !== 408
    ? node
    : null;
}
