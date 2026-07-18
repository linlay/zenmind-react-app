import type { ConversationPreviewKind } from '../../markdown/previewRegistry';

export type { ConversationPreviewKind } from '../../markdown/previewRegistry';

export type ConversationPreviewTheme = 'light' | 'dark';
export type ConversationPreviewBridge = 'frontend-tool';

export type ConversationPreviewBridgeEvent =
  | { type: 'frontend_submit'; requestId: string; params: Record<string, unknown> }
  | { type: 'close' | 'done'; requestId: string };

export type ConversationPreviewRequest = {
  requestId: string;
  kind: ConversationPreviewKind;
  source: string;
  theme: ConversationPreviewTheme;
  mode: 'inline' | 'overlay';
  initialData?: unknown;
  bridge?: ConversationPreviewBridge;
};

export type ConversationPreviewEvent =
  | { type: 'ready'; requestId: string }
  | { type: 'resize'; requestId: string; height: number }
  | { type: 'error'; requestId: string; message: string }
  | ConversationPreviewBridgeEvent;

export type ConversationPreviewSurfaceProps = {
  active: boolean;
  cacheKey: string;
  heightBounds?: ConversationPreviewHeightBounds;
  initialData?: unknown;
  bridge?: ConversationPreviewBridge;
  kind: ConversationPreviewKind;
  mode: 'inline' | 'overlay';
  retryNonce: number;
  source: string;
  theme: ConversationPreviewTheme;
  onError: (message: string) => void;
  onBridgeEvent?: (event: ConversationPreviewBridgeEvent) => void;
  onReady: () => void;
};

export type ConversationPreviewHeightBounds = {
  initial: number;
  minimum: number;
  maximum: number;
};
