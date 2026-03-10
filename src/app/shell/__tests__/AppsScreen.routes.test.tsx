import React from 'react';
import { act, create } from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';

import { AppsScreen } from '../pages/apps';

let mockSelectorState: Record<string, any> = {};
let mockAppsQueryResult: Record<string, any> = {};

jest.mock('../../store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: Record<string, any>) => unknown) => selector(mockSelectorState)
}));

jest.mock('../pages/apps/appsApi', () => ({
  useGetAppsQuery: () => mockAppsQueryResult
}));

jest.mock('../../../core/network/apiClient', () => ({
  formatError: (error: { message?: string } | undefined) => String(error?.message || 'error')
}));

jest.mock('react-native-webview', () => {
  const ReactLocal = require('react');
  const { View: ViewLocal } = require('react-native');
  return {
    WebView: ({ children, ...props }: { children?: React.ReactNode }) => ReactLocal.createElement(ViewLocal, props, children)
  };
});

function makeState(overrides: Partial<Record<string, any>> = {}) {
  return {
    user: {
      themeMode: 'light',
      endpointInput: 'https://api.example.com',
      ...overrides.user
    },
    ...overrides
  };
}

function createRuntime() {
  return {
    authAccessToken: 'token',
    authAccessExpireAtMs: Date.now() + 60_000,
    authTokenSignal: 1,
    onWebViewAuthRefreshRequest: jest.fn()
  };
}

async function renderAppsScreen() {
  mockSelectorState = makeState();
  const onBindNavigation = jest.fn();
  const onRouteFocus = jest.fn();
  const runtime = createRuntime();

  let tree: ReturnType<typeof create> | null = null;
  await act(async () => {
    tree = create(
      <NavigationContainer>
        <AppsScreen onBindNavigation={onBindNavigation} onRouteFocus={onRouteFocus} runtime={runtime} />
      </NavigationContainer>
    );
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  return {
    tree: tree as ReturnType<typeof create>,
    onBindNavigation,
    onRouteFocus,
    runtime
  };
}

describe('AppsScreen routes', () => {
  beforeEach(() => {
    mockAppsQueryResult = {
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
            lastFrontendLoadAt: '',
            lastBackendLoadAt: '',
            lastFrontendError: null,
            lastBackendError: null
          }
        ]
      },
      isLoading: false,
      isError: false,
      error: undefined
    };
  });

  it('shows loading, error, and empty list states', async () => {
    mockAppsQueryResult = { data: undefined, isLoading: true, isError: false, error: undefined };
    let screen = await renderAppsScreen();
    expect(screen.tree.root.findByProps({ testID: 'apps-list-loading' })).toBeTruthy();

    mockAppsQueryResult = { data: undefined, isLoading: false, isError: true, error: new Error('load failed') };
    screen = await renderAppsScreen();
    expect(screen.tree.root.findByProps({ testID: 'apps-list-error' })).toBeTruthy();

    mockAppsQueryResult = { data: { generatedAt: '', apps: [] }, isLoading: false, isError: false, error: undefined };
    screen = await renderAppsScreen();
    expect(screen.tree.root.findByProps({ testID: 'apps-list-empty' })).toBeTruthy();
  });

  it('navigates to webview detail with api-backed app data', async () => {
    const { tree, onRouteFocus } = await renderAppsScreen();

    expect(onRouteFocus).toHaveBeenCalledWith('AppsList', '', '');

    const card = tree.root.findByProps({ testID: 'apps-list-card-0' });
    await act(async () => {
      card.props.onPress();
      await Promise.resolve();
    });

    expect(onRouteFocus).toHaveBeenCalledWith('AppsWebView', 'cost', '记账');
    expect(tree.root.findByProps({ testID: 'apps-webview-page' })).toBeTruthy();
    const webView = tree.root.find((node) => node.props?.source?.uri === 'https://api.example.com/ma/cost/');
    expect(webView).toBeTruthy();
    expect(webView.props.injectedJavaScriptBeforeContentLoaded).toContain('apps_webview_bootstrap');
  });

  it('shows missing and fetch error states on detail route', async () => {
    let screen = await renderAppsScreen();
    const navigation = screen.onBindNavigation.mock.calls[0]?.[0];

    await act(async () => {
      navigation.navigate('AppsWebView', { appKey: 'missing' });
      await Promise.resolve();
    });

    expect(screen.tree.root.findByProps({ testID: 'apps-webview-missing-page' })).toBeTruthy();

    mockAppsQueryResult = { data: undefined, isLoading: false, isError: true, error: new Error('load failed') };
    screen = await renderAppsScreen();
    const nextNavigation = screen.onBindNavigation.mock.calls[0]?.[0];

    await act(async () => {
      nextNavigation.navigate('AppsWebView', { appKey: 'cost' });
      await Promise.resolve();
    });

    expect(screen.tree.root.findByProps({ testID: 'apps-webview-error-page' })).toBeTruthy();
  });
});
