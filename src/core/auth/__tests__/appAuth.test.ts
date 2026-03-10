const SETTINGS_KEY = 'mobile_app_settings_v3';
const ACCOUNTS_KEY = 'mobile_auth_accounts_v1';

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

function seedActiveStoredAccount(options: {
  accountId?: string;
  endpointInput?: string;
  ptyUrlInput?: string;
  username?: string;
  deviceId?: string;
  deviceName?: string;
  deviceToken?: string;
  lastUsedAtMs?: number;
}) {
  const endpointInput = options.endpointInput || 'https://example.test';
  const deviceId = options.deviceId || 'dev-1';
  const accountId = options.accountId || `${endpointInput}::${deviceId}`;

  storage.set(
    SETTINGS_KEY,
    JSON.stringify({
      themeMode: 'light',
      endpointInput,
      ptyUrlInput: options.ptyUrlInput || `${endpointInput}/appterm`,
      selectedAgentKey: '',
      activeDomain: 'chat',
      activeAccountId: accountId
    })
  );
  storage.set(
    ACCOUNTS_KEY,
    JSON.stringify([
      {
        accountId,
        username: options.username || 'mobile',
        deviceId,
        deviceName: options.deviceName || 'phone',
        endpointInput,
        ptyUrlInput: options.ptyUrlInput || `${endpointInput}/appterm`,
        deviceToken: options.deviceToken || 'device-token-1',
        lastUsedAtMs: options.lastUsedAtMs || Date.now()
      }
    ])
  );

  return accountId;
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

  it('accepts accessTokenExpireAt field from backend responses', async () => {
    const auth = loadAppAuth();
    const fetchMock = globalThis.fetch as unknown as jest.Mock;

    fetchMock
      .mockResolvedValueOnce(
        mockResponse(200, {
          username: 'mobile',
          deviceId: 'dev-1',
          deviceName: 'phone',
          accessToken: 'token-1',
          accessTokenExpireAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          deviceToken: 'device-token-1'
        })
      )
      .mockResolvedValueOnce(
        mockResponse(200, {
          deviceId: 'dev-1',
          accessToken: 'token-2',
          accessTokenExpireAt: new Date(Date.now() + 25 * 60_000).toISOString(),
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

  it('prefers accessTokenExpireAtMs over string expire fields', async () => {
    const auth = loadAppAuth();
    const fetchMock = globalThis.fetch as unknown as jest.Mock;
    const prioritizedMs = Date.now() + 20 * 60_000;

    fetchMock.mockResolvedValueOnce(
      mockResponse(200, {
        username: 'mobile',
        deviceId: 'dev-1',
        deviceName: 'phone',
        accessToken: 'token-priority',
        accessTokenExpireAtMs: prioritizedMs,
        accessTokenExpireAt: new Date(Date.now() + 60_000).toISOString(),
        accessExpireAt: new Date(Date.now() + 60_000).toISOString(),
        deviceToken: 'device-token-1'
      })
    );

    await auth.loginWithMasterPassword(baseUrl, 'master', 'device');
    const token = await auth.ensureFreshAccessToken(baseUrl, {
      minValidityMs: 10 * 60_000,
      jitterMs: 0,
      failureMode: 'soft'
    });

    expect(token).toBe('token-priority');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('normalizes high-precision ISO timestamps with nanosecond fraction', async () => {
    const auth = loadAppAuth();
    const fetchMock = globalThis.fetch as unknown as jest.Mock;

    fetchMock.mockResolvedValueOnce(
      mockResponse(200, {
        username: 'mobile',
        deviceId: 'dev-1',
        deviceName: 'phone',
        accessToken: 'token-nano',
        accessTokenExpireAt: '2026-02-23T14:30:55.620066428Z',
        deviceToken: 'device-token-1'
      })
    );

    await auth.loginWithMasterPassword(baseUrl, 'master', 'device');
    expect(auth.getCurrentSession()?.accessExpireAtMs).toBe(new Date('2026-02-23T14:30:55.620Z').getTime());
  });

  it('falls back to short validity window when expire field is invalid', async () => {
    const auth = loadAppAuth();
    const fetchMock = globalThis.fetch as unknown as jest.Mock;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    fetchMock.mockResolvedValueOnce(
      mockResponse(200, {
        username: 'mobile',
        deviceId: 'dev-1',
        deviceName: 'phone',
        accessToken: 'token-invalid-expire',
        accessTokenExpireAt: 'not-a-time',
        deviceToken: 'device-token-1'
      })
    );

    await auth.loginWithMasterPassword(baseUrl, 'master', 'device');
    const token = await auth.ensureFreshAccessToken(baseUrl, {
      minValidityMs: 2 * 60_000,
      jitterMs: 0,
      failureMode: 'soft'
    });

    expect(token).toBe('token-invalid-expire');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('shares one refresh request for concurrent hard refresh calls', async () => {
    seedActiveStoredAccount({});
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

  it('stores login result into saved accounts and activeAccountId', async () => {
    const auth = loadAppAuth();
    const fetchMock = globalThis.fetch as unknown as jest.Mock;

    fetchMock.mockResolvedValueOnce(
      mockResponse(200, {
        username: 'tester',
        deviceId: 'dev-9',
        deviceName: 'ipad',
        accessToken: 'token-login',
        accessExpireAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        deviceToken: 'device-token-9'
      })
    );

    await auth.loginWithMasterPassword(baseUrl, 'master', 'device');

    const accounts = await auth.listStoredAccounts();
    const active = await auth.getActiveStoredAccount();

    expect(accounts).toHaveLength(1);
    expect(accounts[0].deviceId).toBe('dev-9');
    expect(active?.deviceId).toBe('dev-9');
    expect(JSON.parse(String(storage.get(SETTINGS_KEY) || '{}')).activeAccountId).toBe(accounts[0].accountId);
  });

  it('switches to another saved account and restores its session', async () => {
    const auth = loadAppAuth();
    const fetchMock = globalThis.fetch as unknown as jest.Mock;

    storage.set(
      SETTINGS_KEY,
      JSON.stringify({
        themeMode: 'light',
        endpointInput: 'https://one.example.test',
        ptyUrlInput: 'https://one.example.test/appterm',
        selectedAgentKey: '',
        activeDomain: 'chat',
        activeAccountId: 'https://one.example.test::dev-1'
      })
    );
    storage.set(
      ACCOUNTS_KEY,
      JSON.stringify([
        {
          accountId: 'https://one.example.test::dev-1',
          username: 'one',
          deviceId: 'dev-1',
          deviceName: 'phone',
          endpointInput: 'https://one.example.test',
          ptyUrlInput: 'https://one.example.test/appterm',
          deviceToken: 'token-one',
          lastUsedAtMs: 1
        },
        {
          accountId: 'https://two.example.test::dev-2',
          username: 'two',
          deviceId: 'dev-2',
          deviceName: 'tablet',
          endpointInput: 'https://two.example.test',
          ptyUrlInput: 'https://two.example.test/appterm',
          deviceToken: 'token-two',
          lastUsedAtMs: 2
        }
      ])
    );

    fetchMock.mockResolvedValueOnce(
      mockResponse(200, {
        deviceId: 'dev-2',
        accessToken: 'token-restored',
        accessExpireAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        deviceToken: 'token-two-next'
      })
    );

    const session = await auth.switchActiveAccount('https://two.example.test::dev-2');

    expect(session?.deviceId).toBe('dev-2');
    expect((await auth.getActiveStoredAccount())?.accountId).toBe('https://two.example.test::dev-2');
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
    expect((await auth.listStoredAccounts())).toHaveLength(1);
  });

  it('clears only the active account when hard refresh fails', async () => {
    const auth = loadAppAuth();
    const fetchMock = globalThis.fetch as unknown as jest.Mock;

    storage.set(
      SETTINGS_KEY,
      JSON.stringify({
        themeMode: 'light',
        endpointInput: 'https://one.example.test',
        ptyUrlInput: 'https://one.example.test/appterm',
        selectedAgentKey: '',
        activeDomain: 'chat',
        activeAccountId: 'https://one.example.test::dev-1'
      })
    );
    storage.set(
      ACCOUNTS_KEY,
      JSON.stringify([
        {
          accountId: 'https://one.example.test::dev-1',
          username: 'one',
          deviceId: 'dev-1',
          deviceName: 'phone',
          endpointInput: 'https://one.example.test',
          ptyUrlInput: 'https://one.example.test/appterm',
          deviceToken: 'token-one',
          lastUsedAtMs: 1
        },
        {
          accountId: 'https://two.example.test::dev-2',
          username: 'two',
          deviceId: 'dev-2',
          deviceName: 'tablet',
          endpointInput: 'https://two.example.test',
          ptyUrlInput: 'https://two.example.test/appterm',
          deviceToken: 'token-two',
          lastUsedAtMs: 2
        }
      ])
    );

    fetchMock.mockResolvedValueOnce(mockResponse(500, { error: 'refresh failed' }));

    const result = await auth.getAccessToken('https://one.example.test', true);

    expect(result).toBeNull();
    expect(auth.getCurrentSession()).toBeNull();
    expect((await auth.listStoredAccounts()).map((item) => item.accountId)).toEqual(['https://two.example.test::dev-2']);
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

  it('logout removes only the current account', async () => {
    const auth = loadAppAuth();
    const fetchMock = globalThis.fetch as unknown as jest.Mock;

    storage.set(
      SETTINGS_KEY,
      JSON.stringify({
        themeMode: 'light',
        endpointInput: 'https://one.example.test',
        ptyUrlInput: 'https://one.example.test/appterm',
        selectedAgentKey: '',
        activeDomain: 'chat',
        activeAccountId: 'https://one.example.test::dev-1'
      })
    );
    storage.set(
      ACCOUNTS_KEY,
      JSON.stringify([
        {
          accountId: 'https://one.example.test::dev-1',
          username: 'one',
          deviceId: 'dev-1',
          deviceName: 'phone',
          endpointInput: 'https://one.example.test',
          ptyUrlInput: 'https://one.example.test/appterm',
          deviceToken: 'token-one',
          lastUsedAtMs: 1
        },
        {
          accountId: 'https://two.example.test::dev-2',
          username: 'two',
          deviceId: 'dev-2',
          deviceName: 'tablet',
          endpointInput: 'https://two.example.test',
          ptyUrlInput: 'https://two.example.test/appterm',
          deviceToken: 'token-two',
          lastUsedAtMs: 2
        }
      ])
    );

    fetchMock
      .mockResolvedValueOnce(
        mockResponse(200, {
          deviceId: 'dev-1',
          accessToken: 'token-one-access',
          accessExpireAt: new Date(Date.now() + 10 * 60_000).toISOString(),
          deviceToken: 'token-one'
        })
      )
      .mockResolvedValueOnce(mockResponse(200, { ok: true }));

    await auth.restoreSession('https://one.example.test');
    await auth.logoutCurrentDevice('https://one.example.test');

    expect((await auth.listStoredAccounts()).map((item) => item.accountId)).toEqual(['https://two.example.test::dev-2']);
    expect(await auth.getActiveStoredAccount()).toBeNull();
  });
});
