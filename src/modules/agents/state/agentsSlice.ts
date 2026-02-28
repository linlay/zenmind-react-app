import { PayloadAction, createSlice } from '@reduxjs/toolkit';
import { Agent } from '../../../core/types/common';
import { AgentsState } from '../types/agents';

const initialState: AgentsState = {
  agents: [],
  loading: false,
  error: ''
};

const agentsSlice = createSlice({
  name: 'agents',
  initialState,
  reducers: {
    setAgents(state, action: PayloadAction<Agent[]>) {
      state.agents = action.payload;
    },
    setAgentsLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    setAgentsError(state, action: PayloadAction<string>) {
      state.error = action.payload;
    }
  }
});

export const { setAgents, setAgentsLoading, setAgentsError } = agentsSlice.actions;
export default agentsSlice.reducer;
