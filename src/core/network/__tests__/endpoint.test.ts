import {
  DEFAULT_ENDPOINT_INPUT,
  getDefaultEndpointInput,
  normalizeEndpointInput,
  normalizePtyUrlInput,
  toBackendBaseUrl,
  toDefaultPtyWebUrl
} from '../endpoint';

describe('endpoint helpers', () => {
  it('normalizes endpoint input', () => {
    expect(normalizeEndpointInput('  agw.linlay.cc/')).toBe('agw.linlay.cc');
    expect(normalizeEndpointInput('')).toBe(getDefaultEndpointInput());
  });

  it('has a valid default endpoint', () => {
    expect(getDefaultEndpointInput()).toBe(DEFAULT_ENDPOINT_INPUT);
    expect(DEFAULT_ENDPOINT_INPUT.length > 0).toBe(true);
  });

  it('prefers environment endpoint override', () => {
    const original = process.env.EXPO_PUBLIC_AGW_ENDPOINT;
    try {
      process.env.EXPO_PUBLIC_AGW_ENDPOINT = 'https://example.test/';
      expect(getDefaultEndpointInput()).toBe('https://example.test');
    } finally {
      process.env.EXPO_PUBLIC_AGW_ENDPOINT = original;
    }
  });

  it('builds backend url with local and remote default protocol', () => {
    expect(toBackendBaseUrl('192.168.1.3:8080')).toBe('http://192.168.1.3:8080');
    expect(toBackendBaseUrl('agw.linlay.cc')).toBe('https://agw.linlay.cc');
  });

  it('creates default pty url from endpoint', () => {
    expect(toDefaultPtyWebUrl('agw.linlay.cc')).toBe('https://agw.linlay.cc:11949');
  });

  it('normalizes pty path and full url', () => {
    expect(normalizePtyUrlInput('/pty', 'agw.linlay.cc')).toBe('https://agw.linlay.cc/pty');
    expect(normalizePtyUrlInput('http://127.0.0.1:11949')).toBe('http://127.0.0.1:11949');
  });
});
