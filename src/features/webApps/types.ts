export type WebAppRuntimeStatus = 'stopped' | 'starting' | 'running' | 'error';

export type WebAppPublishStatus = 'not-configured' | 'ready' | 'publishing' | 'published' | 'unpublished' | 'error';

export type WebAppAvailability =
  | 'available'
  | 'not-published'
  | 'publishing'
  | 'desktop-offline'
  | 'webapp-stopped'
  | 'publish-error';

export type WebAppItem = {
  id: string;
  name: string;
  order: number;
  createdAt: number;
  updatedAt: number;
  runtimeStatus: WebAppRuntimeStatus;
  publishStatus: WebAppPublishStatus;
  availability: WebAppAvailability;
  publicUrl?: string;
};

export type WebAppCatalog = {
  desktopDeviceId: string;
  tunnelConnected: boolean;
  generatedAt: string;
  items: readonly WebAppItem[];
};

export type OpenableWebApp = WebAppItem & { publicUrl: string };

export type WebAppsConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export type WebAppsGatewayErrorCode =
  | 'desktop-required'
  | 'desktop-unavailable'
  | 'device-mismatch'
  | 'invalid-protocol';

export type WebAppsGatewayError = {
  code: WebAppsGatewayErrorCode;
  message: string;
};

export type WebAppsGatewayEvent =
  | { type: 'snapshot'; catalog: WebAppCatalog }
  | { type: 'upsert'; item: WebAppItem }
  | { type: 'remove'; appId: string }
  | { type: 'connection'; status: WebAppsConnectionStatus }
  | { type: 'error'; error: WebAppsGatewayError };

export type WebAppsGatewayCapabilities = {
  activate: boolean;
  pause: boolean;
};

export type WebAppsGateway = {
  capabilities: WebAppsGatewayCapabilities;
  open: (listener: (event: WebAppsGatewayEvent) => void) => void;
  refresh: (signal?: AbortSignal) => Promise<void>;
  close: () => void;
};

export type WebAppResidentLoadState = 'loading' | 'ready' | 'error' | 'terminated';

export type WebAppResident = {
  appId: string;
  launchUrl: string;
  url: string;
  generation: number;
  loadState: WebAppResidentLoadState;
};
