import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { Agent } from '../../../core/types/common';
import { fetchApiJson } from '../../../core/network/apiClient';

export const agentsApi = createApi({
  reducerPath: 'agentsApi',
  baseQuery: fakeBaseQuery(),
  endpoints: (builder) => ({
    getAgents: builder.query<Agent[], string>({
      async queryFn(baseUrl) {
        try {
          const data = await fetchApiJson<Agent[]>(baseUrl, '/api/ap/agents');
          return { data: Array.isArray(data) ? data : [] };
        } catch (error) {
          return { error: error as Error };
        }
      }
    })
  })
});

export const { useLazyGetAgentsQuery } = agentsApi;
