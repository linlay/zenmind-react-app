import { configureStore } from '@reduxjs/toolkit';
import { agentsApi } from '../agentsApi';

jest.mock('../../../../core/auth/appAuth', () => ({
  getAccessToken: jest.fn()
}));

function mockResponse(status: number, body: unknown): Response {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => payload
  } as unknown as Response;
}

describe('agentsApi', () => {
  const getAccessToken = require('../../../../core/auth/appAuth').getAccessToken as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (globalThis.fetch as unknown as jest.Mock) = jest.fn();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  function createTestStore() {
    return configureStore({
      reducer: {
        user: () => ({
          endpointInput: 'api.example.test',
          ptyUrlInput: '',
          themeMode: 'light'
        }),
        [agentsApi.reducerPath]: agentsApi.reducer
      },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(agentsApi.middleware)
    });
  }

  it('deduplicates concurrent identical requests through RTK Query cache', async () => {
    const store = createTestStore();
    const fetchMock = globalThis.fetch as unknown as jest.Mock;
    getAccessToken.mockResolvedValue('token-1');
    fetchMock.mockResolvedValue(
      mockResponse(200, {
        code: 0,
        data: [{ key: 'agent-1', name: 'Planner', role: 'assistant' }]
      })
    );

    const requestA = store.dispatch(agentsApi.endpoints.getAgents.initiate());
    const requestB = store.dispatch(agentsApi.endpoints.getAgents.initiate());
    const [first, second] = await Promise.all([requestA, requestB]);

    expect(first.data).toEqual([{ key: 'agent-1', name: 'Planner', role: 'assistant' }]);
    expect(second.data).toEqual([{ key: 'agent-1', name: 'Planner', role: 'assistant' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    requestA.unsubscribe();
    requestB.unsubscribe();
    store.dispatch(agentsApi.util.resetApiState());
  });

  it('refreshes token and retries once after a 401 response', async () => {
    const store = createTestStore();
    const fetchMock = globalThis.fetch as unknown as jest.Mock;
    getAccessToken.mockResolvedValueOnce('token-stale').mockResolvedValueOnce('token-fresh');
    fetchMock
      .mockResolvedValueOnce(mockResponse(401, { error: 'expired' }))
      .mockResolvedValueOnce(
        mockResponse(200, {
          code: 0,
          data: [{ id: 'agent-2', name: 'Research', role: 'assistant' }]
        })
      );

    const request = store.dispatch(agentsApi.endpoints.getAgents.initiate());
    const result = await request;

    expect(result.data).toEqual([
      {
        key: 'agent-2',
        id: 'agent-2',
        name: 'Research',
        role: 'assistant',
        icon: undefined,
        iconName: undefined,
        iconColor: undefined,
        meta: undefined,
        agentIconName: undefined,
        agentIconColor: undefined,
        avatarName: undefined,
        avatarBgColor: undefined,
        bgColor: undefined
      }
    ]);
    expect(getAccessToken).toHaveBeenNthCalledWith(1, 'https://api.example.test', false);
    expect(getAccessToken).toHaveBeenNthCalledWith(2, 'https://api.example.test', true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    request.unsubscribe();
    store.dispatch(agentsApi.util.resetApiState());
  });
});
