import type { ConversationPreviewKind } from '../../markdown/previewRegistry';

export type { ConversationPreviewKind } from '../../markdown/previewRegistry';

export type ConversationPreviewTheme = 'light' | 'dark';

export type ConversationPreviewRequest = {
  requestId: string;
  kind: ConversationPreviewKind;
  source: string;
  theme: ConversationPreviewTheme;
  mode: 'inline' | 'overlay';
  initialData?: unknown;
};

export type ConversationPreviewEvent =
  | { type: 'ready'; requestId: string }
  | { type: 'resize'; requestId: string; height: number }
  | { type: 'error'; requestId: string; message: string };

export type ConversationPreviewSurfaceProps = {
  active: boolean;
  cacheKey: string;
  heightBounds?: ConversationPreviewHeightBounds;
  initialData?: unknown;
  kind: ConversationPreviewKind;
  mode: 'inline' | 'overlay';
  retryNonce: number;
  source: string;
  theme: ConversationPreviewTheme;
  onError: (message: string) => void;
  onReady: () => void;
};

export type ConversationPreviewHeightBounds = {
  initial: number;
  minimum: number;
  maximum: number;
};
