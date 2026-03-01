import { fetchApiJson } from '../../../core/network/apiClient';
import { ChatSummary } from '../../../core/types/common';
import {
  CachedChatDetail,
  getMaxLastRunId,
  listCachedChats,
  upsertChatDetail,
  upsertChatSummaries
} from './chatCacheDb';

interface ChatDetailResponse {
  chatId?: string;
  chatName?: string;
  chatImageToken?: string;
  events?: Record<string, unknown>[];
}

interface SyncResult {
  chats: ChatSummary[];
  updatedChatIds: string[];
}

function normalizeChatSummary(raw: ChatSummary): ChatSummary {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const chatId = String(raw.chatId || '').trim();
  const firstAgentKey = String(raw.firstAgentKey || '').trim();
  const agentKey = String(raw.agentKey || '').trim();
  const firstAgentName = String(raw.firstAgentName || '').trim();
  const agentName = String(raw.agentName || '').trim();

  return {
    ...raw,
    chatId,
    chatName: String(raw.chatName || raw.title || chatId || '').trim(),
    firstAgentKey: firstAgentKey || agentKey,
    firstAgentName: firstAgentName || agentName
  };
}

function normalizeChatDetail(chatId: string, data: ChatDetailResponse): CachedChatDetail {
  return {
    chatId,
    chatName: String(data?.chatName || '').trim(),
    chatImageToken: String(data?.chatImageToken || '').trim(),
    events: Array.isArray(data?.events) ? data.events : [],
    detailUpdatedAt: Date.now()
  };
}

export async function fetchAndCacheChatDetail(baseUrl: string, chatIdInput: string): Promise<CachedChatDetail> {
  const chatId = String(chatIdInput || '').trim();
  if (!chatId) {
    return {
      chatId: '',
      chatName: '',
      chatImageToken: '',
      events: [],
      detailUpdatedAt: Date.now()
    };
  }

  const query = `?chatId=${encodeURIComponent(chatId)}`;
  const data = await fetchApiJson<ChatDetailResponse>(baseUrl, `/api/ap/chat${query}`);
  const normalized = normalizeChatDetail(chatId, data);
  await upsertChatDetail(normalized);
  return normalized;
}

export async function syncChatsIncremental(baseUrl: string): Promise<SyncResult> {
  if (!baseUrl) {
    const chats = await listCachedChats();
    return { chats, updatedChatIds: [] };
  }

  const lastRunId = await getMaxLastRunId();
  const query = lastRunId ? `?lastRunId=${encodeURIComponent(lastRunId)}` : '';

  const data = await fetchApiJson<ChatSummary[]>(baseUrl, `/api/ap/chats${query}`);
  const updates = Array.isArray(data)
    ? data
        .map((item) => normalizeChatSummary(item))
        .filter((item) => String(item.chatId || '').trim())
    : [];

  if (updates.length) {
    await upsertChatSummaries(updates);

    for (const item of updates) {
      const chatId = String(item.chatId || '').trim();
      if (!chatId) {
        continue;
      }

      try {
        await fetchAndCacheChatDetail(baseUrl, chatId);
      } catch (error) {
        if (__DEV__) {
          console.warn(`[chatSync] fetch detail failed for ${chatId}:`, error);
        }
      }
    }
  }

  const chats = await listCachedChats();
  return {
    chats,
    updatedChatIds: updates.map((item) => String(item.chatId || '').trim()).filter(Boolean)
  };
}
