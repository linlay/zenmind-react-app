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

describe('settingsStorage', () => {
  beforeEach(() => {
    storage.clear();
    jest.clearAllMocks();
  });

  function loadModule(): typeof import('../settingsStorage') {
    jest.resetModules();
    return require('../settingsStorage') as typeof import('../settingsStorage');
  }

  it('purges v1/v2 settings keys and legacy device token key on load', async () => {
    const module = loadModule();
    storage.set(module.PREVIOUS_STORAGE_KEY, JSON.stringify({ endpointInput: 'legacy.example.com' }));
    storage.set(module.LEGACY_STORAGE_KEY, JSON.stringify({ endpointInput: 'legacy-v1.example.com' }));
    storage.set('app_device_token_v1', 'legacy-device-token');

    const result = await module.loadSettings();

    expect(result.endpointInput).toBe(module.buildDefaultSettings().endpointInput);
    expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith(module.PREVIOUS_STORAGE_KEY);
    expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith(module.LEGACY_STORAGE_KEY);
    expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('app_device_token_v1');
  });

  it('reads and writes settings from v3 storage key', async () => {
    const module = loadModule();

    await module.saveSettings({
      themeMode: 'dark',
      endpointInput: 'demo.example.com',
      ptyUrlInput: 'https://demo.example.com/appterm',
      selectedAgentKey: 'demo',
      activeDomain: 'terminal'
    });

    const loaded = await module.loadSettings();
    expect(loaded.themeMode).toBe('dark');
    expect(loaded.endpointInput).toBe('demo.example.com');
    expect(loaded.ptyUrlInput).toBe('https://demo.example.com/appterm');
    expect(loaded.activeDomain).toBe('terminal');
  });
});
