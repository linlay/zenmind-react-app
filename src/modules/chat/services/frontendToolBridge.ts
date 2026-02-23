import {
  parseWebViewAuthRefreshRequest,
  parseWebViewBridgePayload
} from '../../../core/auth/webViewAuthBridge';

export type FrontendToolBridgeMessage =
  | {
      type: 'frontend_submit';
      params: Record<string, unknown>;
    }
  | {
      type: 'frontend_interacted';
    }
  | {
      type: 'frontend_ready';
    }
  | {
      type: 'frontend_layout';
      contentHeight: number;
    }
  | {
      type: 'auth_refresh_request';
      requestId: string;
      source: string;
    };

export function parseFrontendToolBridgeMessage(raw: unknown): FrontendToolBridgeMessage | null {
  const payload = parseWebViewBridgePayload(raw);
  if (!payload) {
    return null;
  }

  const payloadType = String(payload.type || '');
  if (payloadType === 'frontend_submit') {
    const params =
      payload.params && typeof payload.params === 'object'
        ? (payload.params as Record<string, unknown>)
        : {};
    return {
      type: 'frontend_submit',
      params
    };
  }

  if (String(payload.type || '') === 'frontend_interacted') {
    return {
      type: 'frontend_interacted'
    };
  }

  if (String(payload.type || '') === 'frontend_ready') {
    return {
      type: 'frontend_ready'
    };
  }

  if (payloadType === 'frontend_layout') {
    const contentHeight = Number(payload.contentHeight);
    if (!Number.isFinite(contentHeight) || contentHeight <= 0) {
      return null;
    }
    return {
      type: 'frontend_layout',
      contentHeight: Math.ceil(contentHeight)
    };
  }

  const authRequest = parseWebViewAuthRefreshRequest(payload);
  if (authRequest) {
    return {
      type: 'auth_refresh_request',
      requestId: authRequest.requestId,
      source: authRequest.source
    };
  }

  return null;
}
