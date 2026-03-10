export type ThemeMode = 'light' | 'dark';
export type DomainMode = 'chat' | 'apps' | 'terminal' | 'drive' | 'user';

export interface Agent {
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
  [key: string]: unknown;
}

export interface ChatSummary {
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
  [key: string]: unknown;
}

export interface TeamSummary {
  agentKeys?: string[];
  icon?: {
    name?: string;
    color?: string;
  };
  meta?: {
    defaultAgentKey: string;
    defaultAgentKeyValid: boolean;
      invalidAgentKeys: string[];
  };
  teamId?: string;
  name?: string;
}

export interface AppSettings {
  themeMode: ThemeMode;
  endpointInput: string;
  ptyUrlInput: string;
  selectedAgentKey: string;
  activeDomain: DomainMode;
}

export interface ApiEnvelope<T> {
  code: number;
  msg?: string;
  data: T;
}

export interface FrontendSubmitMessage {
  type: 'frontend_submit';
  params?: Record<string, unknown>;
}

export interface ToolInitMessage {
  type: 'tool_init';
  data: {
    runId?: string;
    toolId?: string;
    toolKey?: string;
    toolType?: string;
    toolTimeout?: number | null;
    params?: Record<string, unknown>;
  };
}

export interface WebSocketMessage {
  type: string;
  payload: Record<string, unknown>;
}
