import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { ChatSummary } from '../../../core/types/common';
import { fetchApiJson, fetchViewportHtml, submitFrontendToolApi } from '../../../core/network/apiClient';

export const chatApi = createApi({
  reducerPath: 'chatApi',
  baseQuery: fakeBaseQuery(),
  endpoints: (builder) => ({
    getChats: builder.query<ChatSummary[], string>({
      async queryFn(baseUrl) {
        try {
          const data = await fetchApiJson<ChatSummary[]>(baseUrl, '/api/chats');
          return { data: Array.isArray(data) ? data : [] };
        } catch (error) {
          return { error: error as Error };
        }
      }
    }),
    getChat: builder.query<{ events: Record<string, unknown>[] }, { baseUrl: string; chatId: string }>({
      async queryFn({ baseUrl, chatId }) {
        try {
          const query = `?chatId=${encodeURIComponent(chatId)}`;
          const data = await fetchApiJson<{ events?: Record<string, unknown>[] }>(baseUrl, `/api/chat${query}`);
          return { data: { events: Array.isArray(data?.events) ? data.events : [] } };
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
