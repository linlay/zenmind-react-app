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

export function toSmartTime(input: unknown): string {
  if (!input) return '';
  const date = new Date(input as string | number | Date);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const time = `${hh}:${mm}`;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (target.getTime() === today.getTime()) return time;
  if (target.getTime() === yesterday.getTime()) return `昨天 ${time}`;
  if (date.getFullYear() === now.getFullYear()) {
    const M = String(date.getMonth() + 1).padStart(2, '0');
    const D = String(date.getDate()).padStart(2, '0');
    return `${M}/${D} ${time}`;
  }
  const Y = date.getFullYear();
  const M = String(date.getMonth() + 1).padStart(2, '0');
  const D = String(date.getDate()).padStart(2, '0');
  return `${Y}/${M}/${D} ${time}`;
}

export function getAgentKey(agent: Agent | null | undefined): string {
  if (!agent || typeof agent !== 'object') return '';
  return String(agent.key || agent.id || '').trim();
}

export function getAgentName(agent: Agent | null | undefined): string {
  if (!agent || typeof agent !== 'object') return '';
  return String(agent.name || getAgentKey(agent) || '').trim();
}

function pickFirstNonEmpty(values: unknown[]): string {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function parseDate(input: unknown): Date | null {
  if (!input) return null;
  const date = new Date(input as string | number | Date);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getChatTitle(chat: ChatSummary | null | undefined): string {
  if (!chat || typeof chat !== 'object') return '';
  return pickFirstNonEmpty([chat.chatName, chat.title, chat.chatId]);
}

export function getChatAgentName(chat: ChatSummary | null | undefined): string {
  if (!chat || typeof chat !== 'object') return '未知智能体';
  return pickFirstNonEmpty([chat.firstAgentName, '未知智能体']);
}

export function formatChatListTime(chat: ChatSummary | null | undefined, nowInput?: Date): string {
  if (!chat || typeof chat !== 'object') return '--';
  const date = parseDate(chat.updatedAt);
  if (!date) return '--';

  const now = nowInput || new Date();
  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (targetDate.getTime() === todayDate.getTime()) {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  if (date.getFullYear() === now.getFullYear()) {
    return `${month}-${day}`;
  }
  return `${date.getFullYear()}-${month}-${day}`;
}

export function getChatTimestamp(chat: ChatSummary | null | undefined): number {
  if (!chat || typeof chat !== 'object') return 0;
  const date = parseDate(chat.updatedAt) || parseDate(chat.createdAt);
  return date ? date.getTime() : 0;
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
