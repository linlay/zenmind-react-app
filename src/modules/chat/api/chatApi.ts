import { createApi } from '@reduxjs/toolkit/query/react';
import { ChatSummary, TeamSummary } from '../../../core/types/common';
import { authBaseQuery } from '../../../core/network/authBaseQuery';

interface ChatSummaryApiPayload {
  chatId?: string;
  chatName?: string;
  title?: string;
  teamId?: string;
  agentKey?: string;
  agentName?: string;
  firstAgentKey?: string;
  firstAgentName?: string;
  lastRunContent?: string;
  lastRunId?: string;
  readStatus?: number;
  readAt?: string | number | null;
  updatedAt?: string | number;
  createdAt?: string | number;
}

interface TeamSummaryApiPayload {
  agentKeys?: string[];
  icon?: {
    name?: string;
    color?: string;
  };
  meta?: {
    defaultAgentKey?: string;
    defaultAgentKeyValid?: boolean;
    invalidAgentKeys?: string[];
  };
  teamId?: string;
  name?: string;
}

function normalizeChatSummary(raw: ChatSummaryApiPayload): ChatSummary {
  if (!raw || typeof raw !== 'object') {
    return {
      chatId: '',
      chatName: '',
      agentKey: '',
      agentName: '',
      firstAgentKey: '',
      firstAgentName: ''
    };
  }
  const chat = raw as ChatSummaryApiPayload;
  const firstAgentKey = String(chat.firstAgentKey || '').trim();
  const agentKey = String(chat.agentKey || '').trim();
  const firstAgentName = String(chat.firstAgentName || '').trim();
  const agentName = String(chat.agentName || '').trim();
  const chatId = String(chat.chatId || '').trim();
  const chatName = String(chat.chatName || chat.title || chatId || '').trim();

  return {
    chatId,
    chatName,
    title: typeof chat.title === 'string' ? chat.title : undefined,
    teamId: typeof chat.teamId === 'string' ? chat.teamId : undefined,
    agentKey,
    agentName,
    firstAgentKey: firstAgentKey || agentKey,
    firstAgentName: firstAgentName || agentName,
    lastRunContent: typeof chat.lastRunContent === 'string' ? chat.lastRunContent : undefined,
    lastRunId: typeof chat.lastRunId === 'string' ? chat.lastRunId : undefined,
    readStatus: typeof chat.readStatus === 'number' ? chat.readStatus : undefined,
    readAt: chat.readAt ?? undefined,
    updatedAt: chat.updatedAt,
    createdAt: chat.createdAt
  };
}

function normalizeTeamSummary(raw: TeamSummaryApiPayload): TeamSummary {
  if (!raw || typeof raw !== 'object') {
    return {
      agentKeys: [],
      teamId: '',
      name: ''
    };
  }
  const team = raw as TeamSummaryApiPayload;

  return {
    agentKeys: Array.isArray(team.agentKeys) ? team.agentKeys.map((item) => String(item || '').trim()).filter(Boolean) : [],
    icon:
      team.icon && typeof team.icon === 'object'
        ? {
            name: typeof team.icon.name === 'string' ? team.icon.name : undefined,
            color: typeof team.icon.color === 'string' ? team.icon.color : undefined
          }
        : undefined,
    meta: team.meta
      ? {
          defaultAgentKey: String(team.meta.defaultAgentKey || ''),
          defaultAgentKeyValid: Boolean(team.meta.defaultAgentKeyValid),
          invalidAgentKeys: Array.isArray(team.meta.invalidAgentKeys)
            ? team.meta.invalidAgentKeys.map((item) => String(item || '').trim()).filter(Boolean)
            : []
        }
      : undefined,
    teamId: String(team.teamId || '').trim(),
    name: String(team.name || '').trim()
  };
}

export const chatApi = createApi({
  reducerPath: 'chatApi',
  baseQuery: authBaseQuery,
  tagTypes: ['Chats', 'Teams', 'Chat'],
  endpoints: (builder) => ({
    getChats: builder.query<ChatSummary[], void>({
      query: () => ({ url: '/api/ap/chats' }),
      transformResponse: (data: unknown) =>
        Array.isArray(data) ? data.map((item) => normalizeChatSummary((item || {}) as ChatSummaryApiPayload)) : [],
      providesTags: ['Chats']
    }),
    getTeams: builder.query<TeamSummary[], void>({
      query: () => ({ url: '/api/ap/teams' }),
      transformResponse: (data: unknown) =>
        Array.isArray(data) ? data.map((item) => normalizeTeamSummary((item || {}) as TeamSummaryApiPayload)) : [],
      providesTags: ['Teams']
    }),
    getChat: builder.query<
      {
        chatId?: string;
        chatName?: string;
        chatImageToken?: string;
        events: Record<string, unknown>[];
      },
      { chatId: string }
    >({
      query: ({ chatId }) => ({ url: '/api/ap/chat', params: { chatId } }),
      transformResponse: (data: unknown) => {
        const chat = (data || {}) as {
          chatId?: string;
          chatName?: string;
          chatImageToken?: string;
          events?: Record<string, unknown>[];
        };
        return {
          chatId: String(chat.chatId || ''),
          chatName: String(chat.chatName || ''),
          chatImageToken: String(chat.chatImageToken || ''),
          events: Array.isArray(chat.events) ? chat.events : []
        };
      },
      providesTags: (_result, _error, arg) => [{ type: 'Chat', id: arg.chatId }]
    }),
    getViewportHtml: builder.query<string, { viewportKey: string }>({
      query: ({ viewportKey }) => ({
        url: '/api/ap/viewport',
        params: { viewportKey },
        responseType: 'viewportHtml'
      })
    }),
    submitFrontendTool: builder.mutation<
      { accepted?: boolean; detail?: string; status?: string },
      { runId?: string; toolId?: string; params?: Record<string, unknown> }
    >({
      query: ({ runId, toolId, params }) => ({
        url: '/api/ap/submit',
        method: 'POST',
        body: { runId, toolId, params }
      }),
      invalidatesTags: ['Chats']
    })
  })
});

export const {
  useLazyGetChatsQuery,
  useLazyGetTeamsQuery,
  useLazyGetChatQuery,
  useLazyGetViewportHtmlQuery,
  useSubmitFrontendToolMutation
} = chatApi;
