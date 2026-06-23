export type WsTransportNamespace = 'ap' | 'd';

export type AgentPlatformWsTransportConfig = {
  kind: 'agent-platform';
  backendUrl: string;
  accessToken: string;
};

export type DesktopWsTransportConfig = {
  kind: 'desktop-ws';
  wsUrl: string;
  tokenMode: 'query' | 'subprotocol';
  accessToken: string;
  namespace: WsTransportNamespace;
};

export type WsTransportConfig = AgentPlatformWsTransportConfig | DesktopWsTransportConfig;
