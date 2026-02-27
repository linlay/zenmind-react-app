import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { ChatSummary } from '../../../core/types/common';
import { fetchApiJson, fetchViewportHtml, submitFrontendToolApi } from '../../../core/network/apiClient';

function normalizeChatSummary(raw: ChatSummary): ChatSummary {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const chat = raw as ChatSummary;
  const firstAgentKey = String(chat.firstAgentKey || '').trim();
  const agentKey = String(chat.agentKey || '').trim();
  const firstAgentName = String(chat.firstAgentName || '').trim();
  const agentName = String(chat.agentName || '').trim();

  return {
    ...chat,
    firstAgentKey: firstAgentKey || agentKey,
    firstAgentName: firstAgentName || agentName
  };
}

export const chatApi = createApi({
  reducerPath: 'chatApi',
  baseQuery: fakeBaseQuery(),
  endpoints: (builder) => ({
    getChats: builder.query<ChatSummary[], string>({
      async queryFn(baseUrl) {
        try {
          const data = await fetchApiJson<ChatSummary[]>(baseUrl, '/api/ap/chats');
          const list = Array.isArray(data) ? data.map((item) => normalizeChatSummary(item)) : [];
          return { data: list };
        } catch (error) {
          return { error: error as Error };
        }
      }
    }),
    getChat: builder.query<
      {
        chatId?: string;
        chatName?: string;
        chatImageToken?: string;
        events: Record<string, unknown>[];
      },
      { baseUrl: string; chatId: string }
    >({
      async queryFn({ baseUrl, chatId }) {
        try {
          const query = `?chatId=${encodeURIComponent(chatId)}`;
          const data = await fetchApiJson<{
            chatId?: string;
            chatName?: string;
            chatImageToken?: string;
            events?: Record<string, unknown>[];
          }>(baseUrl, `/api/ap/chat${query}`);
          return {
            data: {
              chatId: String(data?.chatId || ''),
              chatName: String(data?.chatName || ''),
              chatImageToken: String(data?.chatImageToken || ''),
              events: Array.isArray(data?.events) ? data.events : []
            }
          };
        } catch (error) {
          return { error: error as Error };
        }
      }
    }),
    getViewportHtml: builder.query<string, { baseUrl: string; viewportKey: string }>({
      async queryFn({ baseUrl, viewportKey }) {
        try {
          const data = await fetchViewportHtml(baseUrl, viewportKey);
          return { data };
        } catch (error) {
          return { error: error as Error };
        }
      }
    }),
    submitFrontendTool: builder.mutation<
      { accepted?: boolean; detail?: string; status?: string },
      { baseUrl: string; runId?: string; toolId?: string; params?: Record<string, unknown> }
    >({
      async queryFn({ baseUrl, runId, toolId, params }) {
        try {
          const data = await submitFrontendToolApi(baseUrl, { runId, toolId, params });
          return { data };
        } catch (error) {
          return { error: error as Error };
        }
      }
    })
  })
});

export const {
  useLazyGetChatsQuery,
  useLazyGetChatQuery,
  useLazyGetViewportHtmlQuery,
  useSubmitFrontendToolMutation
} = chatApi;
