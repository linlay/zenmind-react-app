export const CHAT_CONVERSATION_FALLBACK_TITLE = '新对话';

const REMOTE_CHAT_CONVERSATION_PLACEHOLDER_TITLE = 'default';

export function resolveChatConversationTitleCandidate(
  ...candidates: unknown[]
): string | undefined {
  for (const candidate of candidates) {
    const title = String(candidate || '').trim();
    if (title && title.toLowerCase() !== REMOTE_CHAT_CONVERSATION_PLACEHOLDER_TITLE) {
      return title;
    }
  }

  return undefined;
}

export function resolveChatConversationStoredTitle(
  incomingTitle: unknown,
  currentTitle?: unknown,
): string {
  return (
    resolveChatConversationTitleCandidate(incomingTitle, currentTitle) ||
    CHAT_CONVERSATION_FALLBACK_TITLE
  );
}

export function resolveChatConversationDisplayTitle(value: unknown): string {
  return resolveChatConversationStoredTitle(value);
}
