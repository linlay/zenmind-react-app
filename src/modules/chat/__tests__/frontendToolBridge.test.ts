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

  it('parses frontend interacted message', () => {
    const result = parseFrontendToolBridgeMessage({
      type: 'frontend_interacted'
    });

    expect(result).toEqual({
      type: 'frontend_interacted'
    });
  });

  it('parses frontend ready message', () => {
    const result = parseFrontendToolBridgeMessage(
      JSON.stringify({
        type: 'frontend_ready'
      })
    );

    expect(result).toEqual({
      type: 'frontend_ready'
    });
  });

  it('parses agw_frontend_submit as frontend_submit', () => {
    const result = parseFrontendToolBridgeMessage({
      type: 'agw_frontend_submit',
      params: { selectedOption: '海滨城市', selectedIndex: 1, freeText: '', isCustom: false }
    });
    expect(result).toEqual({
      type: 'frontend_submit',
      params: { selectedOption: '海滨城市', selectedIndex: 1, freeText: '', isCustom: false }
    });
  });

  it('returns null for unsupported message', () => {
    const result = parseFrontendToolBridgeMessage({
      type: 'unknown_event'
    });
    expect(result).toBeNull();
  });
});
