import { buildPtyWebUrlWithSessionId, resolveTerminalSessionsBaseUrl } from '../utils/sessionUrl';

describe('sessionUrl', () => {
  it('resolves sessions base url from pty url', () => {
    expect(resolveTerminalSessionsBaseUrl('https://demo.example.com/appterm')).toBe('https://demo.example.com/appterm/api');
    expect(resolveTerminalSessionsBaseUrl('http://127.0.0.1:11931/appterm?x=1')).toBe('http://127.0.0.1:11931/appterm/api');
  });

  it('injects session id into pty url', () => {
    expect(buildPtyWebUrlWithSessionId('https://demo.example.com/appterm', 'abc')).toBe('https://demo.example.com/appterm?sessionId=abc');
    expect(buildPtyWebUrlWithSessionId('https://demo.example.com/appterm?foo=1', 'abc')).toBe('https://demo.example.com/appterm?foo=1&sessionId=abc');
  });

  it('injects new-session modal query params when nonce exists', () => {
    expect(buildPtyWebUrlWithSessionId('https://demo.example.com/appterm', 'abc', { openNewSessionNonce: 9 }))
      .toBe('https://demo.example.com/appterm?sessionId=abc&openNewSession=1&openNonce=9');
  });

  it('removes session id when empty', () => {
    expect(buildPtyWebUrlWithSessionId('https://demo.example.com/appterm?foo=1&sessionId=abc', '')).toBe('https://demo.example.com/appterm?foo=1');
  });

  it('removes open modal query params when nonce is missing', () => {
    expect(
      buildPtyWebUrlWithSessionId(
        'https://demo.example.com/appterm?foo=1&sessionId=abc&openNewSession=1&openNonce=12',
        'abc'
      )
    ).toBe('https://demo.example.com/appterm?foo=1&sessionId=abc');
  });
});
