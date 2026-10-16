export type WsTransportNamespace = 'ap' | 'd';

export type AgentPlatformWsTransportConfig = {
  kind: 'agent-platform';
  backendUrl: string;
  accessTokenProvider?: (forceRefresh?: boolean) => Promise<string>;
  wsUrl?: string;
  accessToken: string;
  connectionKey?: string;
};

export type DesktopWsTransportConfig = {
  kind: 'desktop-ws';
  /** Platform identity from the verified Desktop credential, distinct from the Hub directory ID. */
  platformDeviceId?: string;
  wsUrl: string;
  tokenMode: 'query' | 'subprotocol';
  accessToken: string;
  /** Resolves the selected Desktop credential from the in-memory provider. */
  accessTokenProvider?: (forceRefresh?: boolean) => Promise<string>;
  requestHeadersProvider?: () => Promise<Record<string, string>>;
  namespace: WsTransportNamespace;
  connectionKey?: string;
};

export type WsTransportConfig = AgentPlatformWsTransportConfig | DesktopWsTransportConfig;
