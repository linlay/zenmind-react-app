import { PayloadAction, createSlice } from '@reduxjs/toolkit';
import { Agent } from '../../../core/types/common';
import { getAgentKey } from '../../../shared/utils/format';
import { AgentsState } from '../types/agents';

const initialState: AgentsState = {
  agents: [],
  selectedAgentKey: '',
  loading: false,
  error: ''
};

const agentsSlice = createSlice({
  name: 'agents',
  initialState,
  reducers: {
    setAgents(state, action: PayloadAction<Agent[]>) {
      state.agents = action.payload;
      if (state.selectedAgentKey && action.payload.some((agent) => getAgentKey(agent) === state.selectedAgentKey)) {
        return;
      }
      state.selectedAgentKey = getAgentKey(action.payload[0]) || '';
    },
    setSelectedAgentKey(state, action: PayloadAction<string>) {
      state.selectedAgentKey = action.payload;
    },
    setAgentsLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    setAgentsError(state, action: PayloadAction<string>) {
      state.error = action.payload;
    }
  }
});

export const { setAgents, setSelectedAgentKey, setAgentsLoading, setAgentsError } = agentsSlice.actions;
export default agentsSlice.reducer;
