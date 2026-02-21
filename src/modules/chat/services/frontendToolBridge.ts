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
      type: 'auth_refresh_request';
      requestId: string;
      source: string;
    };

export function parseFrontendToolBridgeMessage(raw: unknown): FrontendToolBridgeMessage | null {
  const payload = parseWebViewBridgePayload(raw);
  if (!payload) {
    return null;
  }

  if (String(payload.type || '') === 'frontend_submit') {
    const params =
      payload.params && typeof payload.params === 'object'
        ? (payload.params as Record<string, unknown>)
        : {};
    return {
      type: 'frontend_submit',
      params
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
