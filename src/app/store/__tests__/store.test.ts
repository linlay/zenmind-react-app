jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {})
  }
}));

describe('store', () => {
  it('does not register a duplicate teams reducer at root level', () => {
    const { store } = require('../store') as typeof import('../store');
    const state = store.getState() as Record<string, unknown>;
    expect(state).toHaveProperty('chat');
    expect(state).not.toHaveProperty('teams');
  });
});
