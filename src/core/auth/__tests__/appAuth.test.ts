const DEVICE_TOKEN_KEY = 'app_device_token_v1';

const storage = new Map<string, string>();
const mockAsyncStorage = {
  getItem: jest.fn(async (key: string) => (storage.has(key) ? storage.get(key) || null : null)),
  setItem: jest.fn(async (key: string, value: string) => {
    storage.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    storage.delete(key);
  })
};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: mockAsyncStorage
}));

function mockResponse(status: number, body: unknown): Response {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => payload
  } as unknown as Response;
}

describe('appAuth', () => {
  const baseUrl = 'https://example.test';

  beforeEach(() => {
    storage.clear();
    jest.clearAllMocks();
    (globalThis.fetch as unknown as jest.Mock) = jest.fn();
  });

  function loadAppAuth(): typeof import('../appAuth') {
    jest.resetModules();
    return require('../appAuth') as typeof import('../appAuth');
  }

  it('refreshes near-expiry token via ensureFreshAccessToken', async () => {
    const auth = loadAppAuth();
    const fetchMock = globalThis.fetch as unknown as jest.Mock;

    fetchMock
      .mockResolvedValueOnce(
        mockResponse(200, {
          username: 'mobile',
          deviceId: 'dev-1',
          deviceName: 'phone',
          accessToken: 'token-1',
          accessExpireAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          deviceToken: 'device-token-1'
        })
      )
      .mockResolvedValueOnce(
        mockResponse(200, {
          deviceId: 'dev-1',
          accessToken: 'token-2',
          accessExpireAt: new Date(Date.now() + 25 * 60_000).toISOString(),
          deviceToken: 'device-token-1'
        })
      );

    await auth.loginWithMasterPassword(baseUrl, 'master', 'device');
    const token = await auth.ensureFreshAccessToken(baseUrl, {
      minValidityMs: 20 * 60_000,
      jitterMs: 0,
      failureMode: 'soft'
    });

    expect(token).toBe('token-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shares one refresh request for concurrent hard refresh calls', async () => {
    storage.set(DEVICE_TOKEN_KEY, 'device-token-1');
    const auth = loadAppAuth();
    const fetchMock = globalThis.fetch as unknown as jest.Mock;

    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve(
              mockResponse(200, {
                deviceId: 'dev-1',
                accessToken: 'token-async',
                accessExpireAt: new Date(Date.now() + 10 * 60_000).toISOString(),
                deviceToken: 'device-token-1'
              })
            );
          }, 20);
        })
    );

    const [a, b, c] = await Promise.all([
      auth.getAccessToken(baseUrl, true),
      auth.getAccessToken(baseUrl, true),
      auth.getAccessToken(baseUrl, true)
    ]);

    expect(a).toBe('token-async');
    expect(b).toBe('token-async');
    expect(c).toBe('token-async');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps existing session when soft refresh fails', async () => {
    const auth = loadAppAuth();
    const fetchMock = globalThis.fetch as unknown as jest.Mock;

    fetchMock
      .mockResolvedValueOnce(
        mockResponse(200, {
          username: 'mobile',
          deviceId: 'dev-1',
          deviceName: 'phone',
          accessToken: 'token-old',
          accessExpireAt: new Date(Date.now() + 10 * 60_000).toISOString(),
          deviceToken: 'device-token-1'
        })
      )
      .mockResolvedValueOnce(mockResponse(500, { error: 'refresh failed' }));

    await auth.loginWithMasterPassword(baseUrl, 'master', 'device');
    const result = await auth.ensureFreshAccessToken(baseUrl, {
      forceRefresh: true,
      failureMode: 'soft',
      jitterMs: 0
    });

    expect(result).toBeNull();
    expect(auth.getCurrentSession()?.accessToken).toBe('token-old');
    expect(mockAsyncStorage.removeItem).not.toHaveBeenCalled();
  });

  it('clears session when hard refresh fails', async () => {
    const auth = loadAppAuth();
    const fetchMock = globalThis.fetch as unknown as jest.Mock;

    fetchMock
      .mockResolvedValueOnce(
        mockResponse(200, {
          username: 'mobile',
          deviceId: 'dev-1',
          deviceName: 'phone',
          accessToken: 'token-old',
          accessExpireAt: new Date(Date.now() + 10 * 60_000).toISOString(),
          deviceToken: 'device-token-1'
        })
      )
      .mockResolvedValueOnce(mockResponse(500, { error: 'refresh failed' }));

    await auth.loginWithMasterPassword(baseUrl, 'master', 'device');
    const result = await auth.getAccessToken(baseUrl, true);

    expect(result).toBeNull();
    expect(auth.getCurrentSession()).toBeNull();
    expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith(DEVICE_TOKEN_KEY);
  });

  it('retries in hard mode after a failed in-flight soft refresh', async () => {
    const auth = loadAppAuth();
    const fetchMock = globalThis.fetch as unknown as jest.Mock;

    fetchMock
      .mockResolvedValueOnce(
        mockResponse(200, {
          username: 'mobile',
          deviceId: 'dev-1',
          deviceName: 'phone',
          accessToken: 'token-old',
          accessExpireAt: new Date(Date.now() + 10 * 60_000).toISOString(),
          deviceToken: 'device-token-1'
        })
      )
      .mockResolvedValueOnce(mockResponse(500, { error: 'soft failed' }))
      .mockResolvedValueOnce(mockResponse(500, { error: 'hard failed' }));

    await auth.loginWithMasterPassword(baseUrl, 'master', 'device');
    const softPromise = auth.ensureFreshAccessToken(baseUrl, {
      forceRefresh: true,
      failureMode: 'soft',
      jitterMs: 0
    });
    const hardPromise = auth.getAccessToken(baseUrl, true);

    const [softResult, hardResult] = await Promise.all([softPromise, hardPromise]);
    expect(softResult).toBeNull();
    expect(hardResult).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(auth.getCurrentSession()).toBeNull();
  });

  it('retries once after 401 in authorizedFetch', async () => {
    const auth = loadAppAuth();
    const fetchMock = globalThis.fetch as unknown as jest.Mock;

    fetchMock
      .mockResolvedValueOnce(
        mockResponse(200, {
          username: 'mobile',
          deviceId: 'dev-1',
          deviceName: 'phone',
          accessToken: 'token-old',
          accessExpireAt: new Date(Date.now() + 10 * 60_000).toISOString(),
          deviceToken: 'device-token-1'
        })
      )
      .mockResolvedValueOnce(mockResponse(401, { error: 'expired' }))
      .mockResolvedValueOnce(
        mockResponse(200, {
          deviceId: 'dev-1',
          accessToken: 'token-new',
          accessExpireAt: new Date(Date.now() + 10 * 60_000).toISOString(),
          deviceToken: 'device-token-1'
        })
      )
      .mockResolvedValueOnce(mockResponse(200, { ok: true }));

    await auth.loginWithMasterPassword(baseUrl, 'master', 'device');
    const response = await auth.authorizedFetch(baseUrl, '/api/demo');

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect((fetchMock.mock.calls[1][1].headers as Record<string, string>).Authorization).toBe('Bearer token-old');
    expect((fetchMock.mock.calls[3][1].headers as Record<string, string>).Authorization).toBe('Bearer token-new');
  });
});
