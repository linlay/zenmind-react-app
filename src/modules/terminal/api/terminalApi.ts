import { createApi } from '@reduxjs/toolkit/query/react';
import { authBaseQuery } from '../../../core/network/authBaseQuery';
import { CreateTerminalSessionResponse, TerminalSessionItem } from '../types/terminal';
import { resolveTerminalSessionsBaseUrl } from '../utils/sessionUrl';

interface TerminalApiArg {
  ptyWebUrl: string;
}

function requireStringField(raw: unknown, fieldName: string): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) {
    throw new Error(`sessions response missing required field: ${fieldName}`);
  }
  return value;
}

function normalizeSessionItem(raw: unknown): TerminalSessionItem {
  if (!raw || typeof raw !== 'object') {
    throw new Error('sessions response item is not an object');
  }
  const item = raw as Record<string, unknown>;
  return {
    sessionId: requireStringField(item.sessionId, 'sessionId'),
    title: requireStringField(item.title, 'title'),
    wsUrl: typeof item.wsUrl === 'string' ? item.wsUrl : undefined,
    sessionType: typeof item.sessionType === 'string' ? item.sessionType : undefined,
    toolId: typeof item.toolId === 'string' ? item.toolId : undefined,
    workdir: typeof item.workdir === 'string' ? item.workdir : undefined,
    startedAt: typeof item.startedAt === 'string' ? item.startedAt : undefined,
    connectionState: typeof item.connectionState === 'string' ? item.connectionState : undefined
  };
}

function normalizeCreateSessionResponse(raw: unknown): CreateTerminalSessionResponse {
  if (!raw || typeof raw !== 'object') {
    throw new Error('create session response is not an object');
  }
  const data = raw as Record<string, unknown>;
  return {
    sessionId: requireStringField(data.sessionId, 'sessionId'),
    wsUrl: typeof data.wsUrl === 'string' ? data.wsUrl : undefined,
    startedAt: typeof data.startedAt === 'string' ? data.startedAt : undefined
  };
}

export const terminalApi = createApi({
  reducerPath: 'terminalApi',
  baseQuery: authBaseQuery,
  tagTypes: ['TerminalSessions'],
  endpoints: (builder) => ({
    listTerminalSessions: builder.query<TerminalSessionItem[], TerminalApiArg>({
      query: ({ ptyWebUrl }) => ({
        url: '',
        absoluteUrl: `${resolveTerminalSessionsBaseUrl(ptyWebUrl)}/sessions`
      }),
      transformResponse: (data: unknown) => (Array.isArray(data) ? data.map(normalizeSessionItem) : []),
      providesTags: ['TerminalSessions']
    }),
    createTerminalSession: builder.mutation<CreateTerminalSessionResponse, TerminalApiArg>({
      query: ({ ptyWebUrl }) => ({
        url: '',
        absoluteUrl: `${resolveTerminalSessionsBaseUrl(ptyWebUrl)}/sessions`,
        method: 'POST'
      }),
      transformResponse: (data: unknown) => normalizeCreateSessionResponse(data),
      invalidatesTags: ['TerminalSessions']
    })
  })
});

export const { useLazyListTerminalSessionsQuery, useCreateTerminalSessionMutation } = terminalApi;
