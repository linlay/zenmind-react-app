import {
  WebViewAuthRefreshCoordinator,
  createWebViewAuthRefreshResultMessage,
  parseWebViewAuthRefreshRequest
} from '../webViewAuthBridge';

describe('webViewAuthBridge', () => {
  it('parses refresh request with fallback request id', () => {
    const result = parseWebViewAuthRefreshRequest({
      type: 'auth_refresh_request',
      source: 'chat'
    });

    expect(result).not.toBeNull();
    expect(result?.type).toBe('auth_refresh_request');
    expect(result?.source).toBe('chat');
    expect(result?.requestId.length).toBeGreaterThan(0);
  });

  it('keeps one in-flight refresh for concurrent calls', async () => {
    const refreshFn = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve('token-shared'), 20);
        })
    );
    const coordinator = new WebViewAuthRefreshCoordinator(refreshFn);

    const [a, b, c] = await Promise.all([coordinator.refresh(), coordinator.refresh(), coordinator.refresh()]);

    expect(a.ok).toBe(true);
    expect(a.accessToken).toBe('token-shared');
    expect(b.accessToken).toBe('token-shared');
    expect(c.accessToken).toBe('token-shared');
    expect(refreshFn).toHaveBeenCalledTimes(1);
  });

  it('builds refresh result message with request id', () => {
    const message = createWebViewAuthRefreshResultMessage('req-1', {
      ok: false,
      error: 'expired'
    });

    expect(message.type).toBe('auth_refresh_result');
    expect(message.requestId).toBe('req-1');
    expect(message.ok).toBe(false);
    expect(message.error).toBe('expired');
  });
});
