import { isRemoteEpochMillis } from '../../core/api/services/chatRemoteTimeProtocol.ts';
import { toText } from '../../core/api/services/chatEventProtocol.ts';
import { isMainChatRunEvent } from './timelineRunAccess.ts';
import type { ChatTimelineRunAnnouncement, ChatTimelineState } from './types.ts';

export function applyChatTimelineRunAnnouncement(
  state: ChatTimelineState,
  announcement: ChatTimelineRunAnnouncement
): ChatTimelineState {
  if (!announcement.runId || state.activeRunId !== announcement.runId) return state;
  const current = state.runAnnouncement;
  if (current?.runId === announcement.runId) {
    if (current.timestamp > announcement.timestamp) return state;
    if (current.timestamp === announcement.timestamp && current.taskId === announcement.taskId &&
        current.message === announcement.message) return state;
  }
  return { ...state, runAnnouncement: announcement, revision: state.revision + 1 };
}

export function applyChatTimelineRunAnnouncementSnapshot(
  state: ChatTimelineState,
  runId: string,
  snapshot: unknown
): ChatTimelineState {
  if (!runId || state.activeRunId !== runId) return state;
  const current = state.runAnnouncement?.runId === runId ? state.runAnnouncement : undefined;
  if (snapshot == null) {
    // The detail endpoint only reports the root activity. Keep any live subtask activity.
    return current?.message && !current.taskId
      ? applyChatTimelineRunAnnouncement(state, { ...current, message: '' })
      : state;
  }
  if (typeof snapshot !== 'object' || Array.isArray(snapshot)) return state;
  const { message, timestamp } = snapshot as Record<string, unknown>;
  if (typeof message !== 'string' || !isRemoteEpochMillis(timestamp) || (current && timestamp <= current.timestamp)) {
    return state;
  }
  return applyChatTimelineRunAnnouncement(state, { runId, taskId: '', timestamp, message: message.trim() });
}

export function clearChatTimelineRunAnnouncementForContent(
  state: ChatTimelineState,
  event: Record<string, unknown>,
  runId: string,
  timestamp: number
): ChatTimelineState {
  if (state.activeRunId !== runId) return state;
  const announcement = state.runAnnouncement;
  const taskId = toText(event.taskId);
  const matchesTask = taskId
    ? announcement?.taskId === taskId
    : !announcement?.taskId && isMainChatRunEvent(event, state.conversationId);
  return matchesTask ? applyChatTimelineRunAnnouncement(state, { runId, taskId, timestamp, message: '' }) : state;
}
