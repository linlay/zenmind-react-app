import { Agent, ChatSummary } from '../../core/types/common';

export function createRequestId(prefix = 'mobile'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function toHHMM(input: unknown): string {
  if (!input) return '';
  const date = new Date(input as string | number | Date);
  if (Number.isNaN(date.getTime())) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function getAgentKey(agent: Agent | null | undefined): string {
  if (!agent || typeof agent !== 'object') return '';
  return String(agent.key || agent.id || '').trim();
}

export function getAgentName(agent: Agent | null | undefined): string {
  if (!agent || typeof agent !== 'object') return '';
  return String(agent.name || getAgentKey(agent) || '').trim();
}

export function getChatTitle(chat: ChatSummary | null | undefined): string {
  if (!chat || typeof chat !== 'object') return '';
  return String(chat.chatName || chat.title || chat.chatId || '').trim();
}

export function getChatTimestamp(chat: ChatSummary | null | undefined): number {
  if (!chat || typeof chat !== 'object') return Date.now();
  const values = [chat.updatedAt, chat.updateTime, chat.createdAt, chat.timestamp];
  for (const value of values) {
    if (!value) continue;
    const ms = new Date(value as string | number | Date).getTime();
    if (!Number.isNaN(ms)) {
      return ms;
    }
  }
  return Date.now();
}

export function toDisplayText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
