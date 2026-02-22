export interface TerminalSessionItem {
  sessionId: string;
  title: string;
  wsUrl?: string;
  sessionType?: string;
  toolId?: string;
  workdir?: string;
  startedAt?: string;
  connectionState?: string;
}

export interface CreateTerminalSessionResponse {
  sessionId: string;
  wsUrl?: string;
  startedAt?: string;
}

export interface TerminalState {
  ptyReloadKey: number;
  ptyLoading: boolean;
  ptyLoadError: string;
  activeSessionId: string;
  openNewSessionNonce: number;
}
