export type ChatProtocolEventFamily =
  | 'ack'
  | 'incoming'
  | 'summary'
  | 'read'
  | 'unread'
  | 'read_all'
  | 'conversation_remove'
  | 'run'
  | 'assistant_content'
  | 'awaiting'
  | 'reasoning'
  | 'planning'
  | 'tool'
  | 'artifact'
  | 'action'
  | 'plan'
  | 'task'
  | 'usage'
  | 'context'
  | 'request'
  | 'heartbeat'
  | 'live'
  | 'unknown';

export function toText(value: unknown): string {
  return String(value || '').trim();
}

export function toFiniteNumber(value: unknown, fallback = Date.now()): number {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric;
  }

  const text = toText(value);
  if (!text) {
    return fallback;
  }

  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeEventType(rawType: unknown): string {
  const type = toText(rawType);
  if (!type) {
    return '';
  }

  const aliasMap: Record<string, string> = {
    'message.start': 'content.start',
    'message.delta': 'content.delta',
    'message.end': 'content.end',
    'answer.start': 'content.start',
    'answer.delta': 'content.delta',
    'answer.end': 'content.end',
    'response.start': 'content.start',
    'response.delta': 'content.delta',
    'response.end': 'content.end',
    'content.complete': 'content.end',
    'content.done': 'content.end',
    'message.complete': 'content.end',
    'message.done': 'content.end',
    'run.started': 'run.start',
    'run.completed': 'run.complete',
    'run.done': 'run.complete',
    'run.finish': 'run.complete',
    'run.finished': 'run.complete',
    'run.failed': 'run.error',
    'run.fail': 'run.error',
    'run.canceled': 'run.cancel',
    'run.cancelled': 'run.cancel',
    'conversation.read': 'chat.read',
    'chat.mark_read': 'chat.read',
    'conversation.unread': 'chat.unread',
    'chat.mark_unread': 'chat.unread',
    'chat.readAll': 'chat.read_all',
    'chat.read.all': 'chat.read_all',
    'chat.mark_read_all': 'chat.read_all',
    'conversation.read_all': 'chat.read_all',
    'agent.read_all': 'chat.read_all',
  };

  return aliasMap[type] || type;
}

export function extractConversationId(event: Record<string, unknown>): string {
  return toText(event.conversationId || event.chatId || event.roomId);
}

export function extractTitle(event: Record<string, unknown>): string {
  return toText(event.chatName || event.title || event.name);
}

export function extractAgentKey(event: Record<string, unknown>): string {
  return toText(event.agentKey || event.agentId || event.key);
}

export function extractTeamId(event: Record<string, unknown>): string {
  return toText(event.teamId || event.teamID);
}

export function extractEventText(event: Record<string, unknown>): string {
  if (typeof event.delta === 'string') {
    return event.delta;
  }
  if (typeof event.text === 'string') {
    return event.text;
  }
  if (typeof event.content === 'string') {
    return event.content;
  }
  if (typeof event.message === 'string') {
    return event.message;
  }
  if (typeof event.prompt === 'string') {
    return event.prompt;
  }
  if (typeof event.question === 'string') {
    return event.question;
  }
  if (typeof event.answer === 'string') {
    return event.answer;
  }
  return '';
}

export function extractMessageRole(event: Record<string, unknown>): 'user' | 'assistant' {
  return toText(event.role) === 'user' ? 'user' : 'assistant';
}

export function isAssistantContentEvent(type: string): boolean {
  return (
    type === 'content.start' ||
    type === 'content.delta' ||
    type === 'content.snapshot' ||
    type === 'content.end'
  );
}

export function isSummaryLikeEvent(event: Record<string, unknown>): boolean {
  return (
    event.lastRunContent !== undefined ||
    event.lastMessageText !== undefined ||
    event.unreadRunCount !== undefined ||
    event.unreadCount !== undefined ||
    event.readStatus !== undefined ||
    event.read !== undefined ||
    event.chatName !== undefined ||
    event.title !== undefined
  );
}

export function isChatReadEvent(type: string): boolean {
  return type === 'chat.read';
}

export function isChatUnreadEvent(type: string): boolean {
  return type === 'chat.unread';
}

export function isChatReadAllEvent(type: string): boolean {
  return type === 'chat.read_all';
}

export function isConversationRemovalEvent(type: string): boolean {
  return type === 'chat.deleted' || type === 'chat.archived';
}

export function buildAssistantMessageId(
  conversationId: string,
  event: Record<string, unknown>
): string {
  const runId = toText(event.runId);
  const contentId =
    toText(event.contentId) ||
    toText(event.messageId) ||
    toText(event.serverMessageId) ||
    toText(event.requestId) ||
    'content';

  return `assistant:${conversationId}:${runId || 'run'}:${contentId}`;
}

export function buildFallbackAssistantMessageId(conversationId: string, runId: unknown): string {
  return `assistant:${conversationId}:${toText(runId) || 'run'}:content`;
}

export function classifyChatProtocolEvent(event: Record<string, unknown>): ChatProtocolEventFamily {
  const type = normalizeEventType(event.type);
  if (!type) {
    return 'unknown';
  }

  if (type === 'heartbeat') {
    return 'heartbeat';
  }
  if (type === 'live.connected') {
    return 'live';
  }
  if (type === 'chat.message.ack') {
    return 'ack';
  }
  if (type === 'chat.message.received') {
    return 'incoming';
  }
  if (isChatReadAllEvent(type)) {
    return 'read_all';
  }
  if (isChatReadEvent(type)) {
    return 'read';
  }
  if (isChatUnreadEvent(type)) {
    return 'unread';
  }
  if (isConversationRemovalEvent(type)) {
    return 'conversation_remove';
  }
  if (
    type === 'run.start' ||
    type === 'run.complete' ||
    type === 'run.cancel' ||
    type === 'run.error'
  ) {
    return 'run';
  }
  if (isAssistantContentEvent(type)) {
    return 'assistant_content';
  }
  if (type === 'awaiting.ask' || type === 'awaiting.answer') {
    return 'awaiting';
  }
  if (type.startsWith('reasoning.')) {
    return 'reasoning';
  }
  if (type.startsWith('planning.')) {
    return 'planning';
  }
  if (type.startsWith('tool.')) {
    return 'tool';
  }
  if (type === 'artifact.publish') {
    return 'artifact';
  }
  if (type.startsWith('action.')) {
    return 'action';
  }
  if (type.startsWith('plan.')) {
    return 'plan';
  }
  if (type.startsWith('task.')) {
    return 'task';
  }
  if (type === 'usage.snapshot') {
    return 'usage';
  }
  if (type.startsWith('context.compact.')) {
    return 'context';
  }
  if (type.startsWith('request.')) {
    return 'request';
  }
  if (isSummaryLikeEvent(event)) {
    return 'summary';
  }
  return 'unknown';
}
