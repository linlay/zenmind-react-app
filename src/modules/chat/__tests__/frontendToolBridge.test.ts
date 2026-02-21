import { parseFrontendToolBridgeMessage } from '../services/frontendToolBridge';

describe('frontendToolBridge', () => {
  it('parses frontend submit message', () => {
    const result = parseFrontendToolBridgeMessage({
      type: 'frontend_submit',
      params: {
        foo: 1
      }
    });

    expect(result).toEqual({
      type: 'frontend_submit',
      params: {
        foo: 1
      }
    });
  });

  it('parses auth refresh request message', () => {
    const result = parseFrontendToolBridgeMessage(
      JSON.stringify({
        type: 'auth_refresh_request',
        requestId: 'req-123',
        source: 'chat_tool'
      })
    );

    expect(result).toEqual({
      type: 'auth_refresh_request',
      requestId: 'req-123',
      source: 'chat_tool'
    });
  });

  it('returns null for unsupported message', () => {
    const result = parseFrontendToolBridgeMessage({
      type: 'unknown_event'
    });
    expect(result).toBeNull();
  });
});
