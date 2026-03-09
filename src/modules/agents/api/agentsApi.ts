import { createApi } from '@reduxjs/toolkit/query/react';
import { Agent } from '../../../core/types/common';
import { authBaseQuery } from '../../../core/network/authBaseQuery';

interface AgentApiPayload {
  key?: string;
  id?: string;
  name?: string;
  role?: string;
  icon?: string | { name?: string; color?: string };
  iconName?: string;
  iconColor?: string;
  meta?: {
    role?: string;
  };
  agentIconName?: string;
  agentIconColor?: string;
  avatarName?: string;
  avatarBgColor?: string;
  bgColor?: string;
}

function normalizeAgent(raw: AgentApiPayload): Agent {
  const key = String(raw?.key || raw?.id || '').trim();
  const name = String(raw?.name || key || 'Unnamed').trim();
  return {
    key,
    id: String(raw?.id || '').trim() || undefined,
    name,
    role: String(raw?.role || raw?.meta?.role || 'assistant').trim(),
    icon: raw?.icon,
    iconName: typeof raw?.iconName === 'string' ? raw.iconName : undefined,
    iconColor: typeof raw?.iconColor === 'string' ? raw.iconColor : undefined,
    meta: raw?.meta,
    agentIconName: typeof raw?.agentIconName === 'string' ? raw.agentIconName : undefined,
    agentIconColor: typeof raw?.agentIconColor === 'string' ? raw.agentIconColor : undefined,
    avatarName: typeof raw?.avatarName === 'string' ? raw.avatarName : undefined,
    avatarBgColor: typeof raw?.avatarBgColor === 'string' ? raw.avatarBgColor : undefined,
    bgColor: typeof raw?.bgColor === 'string' ? raw.bgColor : undefined
  };
}

export const agentsApi = createApi({
  reducerPath: 'agentsApi',
  baseQuery: authBaseQuery,
  tagTypes: ['Agents'],
  endpoints: (builder) => ({
    getAgents: builder.query<Agent[], void>({
      query: () => ({ url: '/api/ap/agents' }),
      transformResponse: (data: unknown) =>
        Array.isArray(data) ? data.map((item) => normalizeAgent((item || {}) as AgentApiPayload)) : [],
      providesTags: ['Agents']
    })
  })
});

export const { useLazyGetAgentsQuery } = agentsApi;
