import { configureStore } from '@reduxjs/toolkit';
import { appsApi } from '../appsApi';
import { resolveAppWebViewUrl } from '../helpers';

jest.mock('../../../../../core/auth/appAuth', () => ({
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

describe('appsApi', () => {
  const getAccessToken = require('../../../../../core/auth/appAuth').getAccessToken as jest.Mock;

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
        [appsApi.reducerPath]: appsApi.reducer
      },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(appsApi.middleware)
    });
  }

  it('normalizes apps payload and preserves nullable error fields', async () => {
    const store = createTestStore();
    const fetchMock = globalThis.fetch as unknown as jest.Mock;
    getAccessToken.mockResolvedValue('token-1');
    fetchMock.mockResolvedValue(
      mockResponse(200, {
        code: 0,
        data: {
          generatedAt: '2026-03-09T11:02:03.655Z',
          apps: [
            {
              key: 'cost',
              name: '记账',
              description: '按日期记录个人开销的轻量应用',
              effectiveMode: 'dev',
              mountPath: '/cost',
              apiBase: '/cost/api',
              publicMountPath: '/ma/cost',
              publicApiBase: '/ma/cost/api',
              frontendStatus: 'active',
              backendStatus: 'active',
              status: 'active',
              lastFrontendLoadAt: '2026-03-09T04:18:08.688Z',
              lastBackendLoadAt: '2026-03-09T04:18:08.689Z',
              lastFrontendError: null,
              lastBackendError: null
            }
          ]
        }
      })
    );

    const request = store.dispatch(appsApi.endpoints.getApps.initiate());
    const result = await request;

    expect(result.data).toEqual({
      generatedAt: '2026-03-09T11:02:03.655Z',
      apps: [
        {
          key: 'cost',
          name: '记账',
          description: '按日期记录个人开销的轻量应用',
          effectiveMode: 'dev',
          mountPath: '/cost',
          apiBase: '/cost/api',
          publicMountPath: '/ma/cost',
          publicApiBase: '/ma/cost/api',
          frontendStatus: 'active',
          backendStatus: 'active',
          status: 'active',
          lastFrontendLoadAt: '2026-03-09T04:18:08.688Z',
          lastBackendLoadAt: '2026-03-09T04:18:08.689Z',
          lastFrontendError: null,
          lastBackendError: null
        }
      ]
    });
    request.unsubscribe();
    store.dispatch(appsApi.util.resetApiState());
  });

  it('builds webview url with publicMountPath before mountPath', () => {
    const url = resolveAppWebViewUrl(
      {
        key: 'cost',
        name: '记账',
        description: '',
        effectiveMode: 'dev',
        mountPath: '/cost',
        apiBase: '/cost/api',
        publicMountPath: '/ma/cost',
        publicApiBase: '/ma/cost/api',
        frontendStatus: 'active',
        backendStatus: 'active',
        status: 'active',
        lastFrontendLoadAt: '',
        lastBackendLoadAt: '',
        lastFrontendError: null,
        lastBackendError: null
      },
      'api.example.test'
    );

    expect(url).toBe('https://api.example.test/ma/cost');
  });
});
