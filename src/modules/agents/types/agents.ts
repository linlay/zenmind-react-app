import { Agent } from '../../../core/types/common';

export interface AgentsState {
  agents: Agent[];
  selectedAgentKey: string;
  loading: boolean;
  error: string;
}
