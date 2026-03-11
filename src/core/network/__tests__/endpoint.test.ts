import {
  DEFAULT_ENDPOINT_INPUT,
  getDefaultEndpointInput,
  normalizeEndpointInput,
  normalizePtyUrlInput,
  toBackendBaseUrl,
  toDefaultPtyWebUrl
} from '../endpoint';

describe('endpoint helpers', () => {
  const runtimeGlobal = globalThis as typeof globalThis & { window?: Window };
  const originalWindow = runtimeGlobal.window;
  const originalProxyBase = process.env.EXPO_PUBLIC_WEB_PROXY_BASE;
  const originalProxyForceAll = process.env.EXPO_PUBLIC_WEB_PROXY_FORCE_ALL;

  afterEach(() => {
    process.env.EXPO_PUBLIC_WEB_PROXY_BASE = originalProxyBase;
    process.env.EXPO_PUBLIC_WEB_PROXY_FORCE_ALL = originalProxyForceAll;
    if (originalWindow === undefined) {
      delete runtimeGlobal.window;
      return;
    }
    Object.defineProperty(runtimeGlobal, 'window', {
      configurable: true,
      writable: true,
      value: originalWindow
    });
  });

  it('normalizes endpoint input', () => {
    expect(normalizeEndpointInput('  api.example.com/')).toBe('api.example.com');
    expect(normalizeEndpointInput('')).toBe('');
  });

  it('uses empty default endpoint', () => {
    expect(getDefaultEndpointInput()).toBe(DEFAULT_ENDPOINT_INPUT);
    expect(DEFAULT_ENDPOINT_INPUT).toBe('');
  });

  it('builds backend url with local and remote default protocol', () => {
    expect(toBackendBaseUrl('')).toBe('');
    expect(toBackendBaseUrl('192.168.1.3:8080')).toBe('http://192.168.1.3:8080');
    expect(toBackendBaseUrl('api.example.com')).toBe('https://api.example.com');
  });

  it('creates default pty url from endpoint', () => {
    expect(toDefaultPtyWebUrl('')).toBe('');
    expect(toDefaultPtyWebUrl('api.example.com')).toBe('https://api.example.com/appterm');
    expect(toDefaultPtyWebUrl('http://localhost:8080')).toBe('http://localhost:11931/appterm');
  });

  it('normalizes pty path and full url', () => {
    expect(normalizePtyUrlInput('', '')).toBe('');
    expect(normalizePtyUrlInput('/pty', '')).toBe('');
    expect(normalizePtyUrlInput('/pty', 'api.example.com')).toBe('https://api.example.com/pty');
    expect(normalizePtyUrlInput('http://127.0.0.1:11949')).toBe('http://127.0.0.1:11949');
  });

  it('uses the web proxy for remote targets on localhost runtime', () => {
    process.env.EXPO_PUBLIC_WEB_PROXY_BASE = 'http://localhost:19080';
    Object.defineProperty(runtimeGlobal, 'window', {
      configurable: true,
      writable: true,
      value: { location: { hostname: 'localhost' } }
    });

    expect(toBackendBaseUrl('api.example.com')).toBe('http://localhost:19080');
    expect(toDefaultPtyWebUrl('api.example.com')).toBe('http://localhost:19080/appterm');
  });

  it('can force local targets through the web proxy', () => {
    process.env.EXPO_PUBLIC_WEB_PROXY_BASE = 'http://localhost:19080';
    process.env.EXPO_PUBLIC_WEB_PROXY_FORCE_ALL = '1';
    Object.defineProperty(runtimeGlobal, 'window', {
      configurable: true,
      writable: true,
      value: { location: { hostname: 'localhost' } }
    });

    expect(toBackendBaseUrl('127.0.0.1:11936')).toBe('http://localhost:19080');
    expect(toDefaultPtyWebUrl('127.0.0.1:11936')).toBe('http://localhost:19080/appterm');
  });
});
