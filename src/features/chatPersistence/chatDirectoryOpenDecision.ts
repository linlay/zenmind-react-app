import { normalizePersistedConversationReadState } from './chatReadState.ts';

export type ChatDirectoryLatestConversationSummary = {
  unreadCount: number;
  isRead?: number | boolean | null;
  readAt?: number | null;
  readRunId?: string | null;
  lastMessageStatus: string;
  activeRunId?: string | null;
};

export function isActiveTimelinePayload(payloadJson: string | null | undefined): boolean {
  if (!payloadJson) {
    return false;
  }

  try {
    const parsed = JSON.parse(payloadJson) as {
      lifecycle?: unknown;
      streaming?: unknown;
    };
    return parsed?.lifecycle === 'active' || parsed?.streaming === true;
  } catch {
    return false;
  }
}

export function shouldOpenLatestConversationFromSummary(
  summary: ChatDirectoryLatestConversationSummary
): boolean {
  const read = normalizePersistedConversationReadState(summary);

  return (
    !read.isRead ||
    summary.lastMessageStatus === 'pending' ||
    Boolean(String(summary.activeRunId || '').trim())
  );
}
