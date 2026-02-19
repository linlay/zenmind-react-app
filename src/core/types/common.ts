export type ThemeMode = 'light' | 'dark';
export type DomainMode = 'chat' | 'terminal' | 'agents' | 'user';

export interface Agent {
  key?: string;
  id?: string;
  name?: string;
  [key: string]: unknown;
}

export interface ChatSummary {
  chatId?: string;
  chatName?: string;
  title?: string;
  firstAgentKey?: string;
  updatedAt?: string | number;
  updateTime?: string | number;
  createdAt?: string | number;
  timestamp?: string | number;
  [key: string]: unknown;
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
  type: 'agw_frontend_submit';
  params?: Record<string, unknown>;
}

export interface ToolInitMessage {
  type: 'agw_tool_init';
  data: {
    runId?: string;
    toolId?: string;
    toolKey?: string;
    toolType?: string;
    toolTimeout?: number | null;
    params?: Record<string, unknown>;
  };
}
