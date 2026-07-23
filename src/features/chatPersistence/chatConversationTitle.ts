export const CHAT_CONVERSATION_FALLBACK_TITLE = '新对话';

const REMOTE_CHAT_CONVERSATION_PLACEHOLDER_TITLE = 'default';

function normalizeTitle(value: unknown): string {
  return String(value || '').trim();
}

export function resolveChatConversationDisplayTitle(value: unknown): string {
  const title = normalizeTitle(value);
  return title && title.toLowerCase() !== REMOTE_CHAT_CONVERSATION_PLACEHOLDER_TITLE
    ? title
    : CHAT_CONVERSATION_FALLBACK_TITLE;
}

export function resolveRemoteChatConversationTitle(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    const title = normalizeTitle(candidate);
    if (title && title.toLowerCase() !== REMOTE_CHAT_CONVERSATION_PLACEHOLDER_TITLE) {
      return title;
    }
  }

  return CHAT_CONVERSATION_FALLBACK_TITLE;
}

export function resolveFirstUserChatConversationTitle(content: unknown): string {
  return normalizeTitle(content) || CHAT_CONVERSATION_FALLBACK_TITLE;
}
