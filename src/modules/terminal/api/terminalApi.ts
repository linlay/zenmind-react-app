import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { getAccessToken } from '../../../core/auth/appAuth';
import { parseErrorMessage } from '../../../core/network/errorUtils';
import { CreateTerminalSessionResponse, TerminalSessionItem } from '../types/terminal';
import { resolveTerminalSessionsBaseUrl } from '../utils/sessionUrl';

interface TerminalApiArg {
  backendUrl: string;
  ptyWebUrl: string;
}

async function fetchTerminalAuthedJson<T>(backendUrl: string, absoluteUrl: string, options: RequestInit = {}): Promise<T> {
  const execute = async (accessToken: string): Promise<Response> => {
    const headers = new Headers(options.headers ?? undefined);
    headers.set('Authorization', `Bearer ${accessToken}`);
    return fetch(absoluteUrl, { ...options, headers });
  };

  const token = await getAccessToken(backendUrl);
  if (!token) {
    throw new Error('未登录或设备令牌已失效，请重新登录');
  }

  let response = await execute(token);
  if (response.status === 401) {
    const refreshed = await getAccessToken(backendUrl, true);
    if (refreshed) {
      response = await execute(refreshed);
    }
  }

  const bodyText = await response.text();
  let payload: unknown = null;
  if (bodyText) {
    try {
      payload = JSON.parse(bodyText);
    } catch {
      throw new Error(`Invalid JSON response: ${bodyText.slice(0, 180)}`);
    }
  }

  if (!response.ok) {
    throw new Error(parseErrorMessage(response.status, payload));
  }

  return payload as T;
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
  baseQuery: fakeBaseQuery(),
  endpoints: (builder) => ({
    listTerminalSessions: builder.query<TerminalSessionItem[], TerminalApiArg>({
      async queryFn({ backendUrl, ptyWebUrl }) {
        try {
          const base = resolveTerminalSessionsBaseUrl(ptyWebUrl);
          const data = await fetchTerminalAuthedJson<unknown>(backendUrl, `${base}/sessions`);
          const list = Array.isArray(data) ? data.map(normalizeSessionItem) : [];
          return { data: list };
        } catch (error) {
          return { error: error as Error };
        }
      }
    }),
    createTerminalSession: builder.mutation<CreateTerminalSessionResponse, TerminalApiArg>({
      async queryFn({ backendUrl, ptyWebUrl }) {
        try {
          const base = resolveTerminalSessionsBaseUrl(ptyWebUrl);
          const data = await fetchTerminalAuthedJson<unknown>(backendUrl, `${base}/sessions`, {
            method: 'POST'
          });
          return { data: normalizeCreateSessionResponse(data) };
        } catch (error) {
          return { error: error as Error };
        }
      }
    })
  })
});

export const {
  useLazyListTerminalSessionsQuery,
  useCreateTerminalSessionMutation
} = terminalApi;
