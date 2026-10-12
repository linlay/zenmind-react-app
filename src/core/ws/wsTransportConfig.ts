export type WsTransportNamespace = 'ap' | 'd';

export type AgentPlatformWsTransportConfig = {
  kind: 'agent-platform';
  backendUrl: string;
  accessTokenProvider?: () => Promise<string>;
  wsUrl?: string;
  accessToken: string;
  connectionKey?: string;
};

export type DesktopWsTransportConfig = {
  kind: 'desktop-ws';
  wsUrl: string;
  tokenMode: 'query' | 'subprotocol';
  accessToken: string;
  /** Supplies a fresh one-time credential for physical reconnects. Never persisted. */
  accessTokenProvider?: () => Promise<string>;
  namespace: WsTransportNamespace;
  connectionKey?: string;
};

export type WsTransportConfig = AgentPlatformWsTransportConfig | DesktopWsTransportConfig;
