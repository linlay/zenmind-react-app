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

describe('authAccountsStorage', () => {
  beforeEach(() => {
    storage.clear();
    jest.clearAllMocks();
  });

  function loadModule(): typeof import('../authAccountsStorage') {
    jest.resetModules();
    return require('../authAccountsStorage') as typeof import('../authAccountsStorage');
  }

  it('migrates legacy single-account token into stored accounts', async () => {
    const mod = loadModule();
    storage.set(mod.LEGACY_DEVICE_TOKEN_KEY, 'legacy-token');

    const result = await mod.loadStoredAccounts({
      migrationSettings: {
        endpointInput: 'demo.example.com',
        ptyUrlInput: 'https://demo.example.com/appterm'
      }
    });

    expect(result).toHaveLength(1);
    expect(result[0].deviceToken).toBe('legacy-token');
    expect(result[0].endpointInput).toBe('demo.example.com');
    expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith(mod.LEGACY_DEVICE_TOKEN_KEY);
  });

  it('overwrites duplicate account on endpoint + deviceId match', async () => {
    const mod = loadModule();

    await mod.upsertStoredAccount({
      accountId: mod.buildStoredAccountId('https://demo.example.com', 'dev-1'),
      username: 'old',
      deviceId: 'dev-1',
      deviceName: 'phone',
      endpointInput: 'https://demo.example.com',
      ptyUrlInput: 'https://demo.example.com/appterm',
      deviceToken: 'token-1',
      lastUsedAtMs: 1000
    });

    const result = await mod.upsertStoredAccount({
      accountId: mod.buildStoredAccountId('https://demo.example.com', 'dev-1'),
      username: 'new',
      deviceId: 'dev-1',
      deviceName: 'tablet',
      endpointInput: 'https://demo.example.com',
      ptyUrlInput: 'https://demo.example.com/appterm',
      deviceToken: 'token-2',
      lastUsedAtMs: 2000
    });

    expect(result).toHaveLength(1);
    expect(result[0].username).toBe('new');
    expect(result[0].deviceToken).toBe('token-2');
  });

  it('removes only the requested stored account', async () => {
    const mod = loadModule();

    await mod.saveStoredAccounts([
      {
        accountId: 'a',
        username: 'a',
        deviceId: 'dev-a',
        deviceName: 'phone',
        endpointInput: 'https://a.example.com',
        ptyUrlInput: 'https://a.example.com/appterm',
        deviceToken: 'token-a',
        lastUsedAtMs: 1000
      },
      {
        accountId: 'b',
        username: 'b',
        deviceId: 'dev-b',
        deviceName: 'phone',
        endpointInput: 'https://b.example.com',
        ptyUrlInput: 'https://b.example.com/appterm',
        deviceToken: 'token-b',
        lastUsedAtMs: 2000
      }
    ]);

    const result = await mod.removeStoredAccount('a');

    expect(result.map((item) => item.accountId)).toEqual(['b']);
  });
});
