import { Agent } from '../../../core/types/common';

export interface AgentsState {
  agents: Agent[];
  loading: boolean;
  error: string;
}
