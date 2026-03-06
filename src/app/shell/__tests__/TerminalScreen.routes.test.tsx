import React from 'react';
import { act, create } from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';

import { TerminalScreen } from '../pages/terminal';

let mockSelectorState: Record<string, any> = {};

jest.mock('../../store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: Record<string, any>) => unknown) => selector(mockSelectorState)
}));

jest.mock('../../../modules/terminal/screens/TerminalScreen', () => {
  const ReactLocal = require('react');
  const { View: ViewLocal } = require('react-native');
  return {
    TerminalScreen: () => ReactLocal.createElement(ViewLocal, { testID: 'mock-terminal-route-detail' })
  };
});

function makeState(overrides: Partial<Record<string, any>> = {}) {
  return {
    user: {
      themeMode: 'light',
      ...overrides.user
    },
    ...overrides
  };
}

function createRuntime() {
  return {
    sessions: [{ sessionId: 's-1', title: 'session-1' }],
    loading: false,
    error: '',
    activeSessionId: 's-1',
    currentWebViewUrl: 'https://api.example.com/appterm?session_id=s-1',
    onRefreshSessions: jest.fn().mockResolvedValue(undefined),
    onCreateSession: jest.fn(),
    onOpenSession: jest.fn(),
    authAccessToken: 'token',
    authAccessExpireAtMs: Date.now() + 60_000,
    authTokenSignal: 1,
    onTerminalUrlChange: jest.fn(),
    onWebViewAuthRefreshRequest: jest.fn()
  };
}

async function renderTerminalScreen(runtime = createRuntime()) {
  mockSelectorState = makeState();
  const onBindNavigation = jest.fn();
  const onRouteFocus = jest.fn();

  let tree: ReturnType<typeof create> | null = null;
  await act(async () => {
    tree = create(
      <NavigationContainer>
        <TerminalScreen onBindNavigation={onBindNavigation} onRouteFocus={onRouteFocus} runtime={runtime} />
      </NavigationContainer>
    );
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  return {
    tree: tree as ReturnType<typeof create>,
    runtime,
    onBindNavigation,
    onRouteFocus
  };
}

describe('TerminalScreen routes', () => {
  it('syncs focus to list and pushes detail route when selecting a session', async () => {
    const { tree, runtime, onRouteFocus } = await renderTerminalScreen();

    expect(onRouteFocus).toHaveBeenCalledWith('TerminalList');

    const sessionItem = tree.root.findByProps({ testID: 'terminal-session-item-0' });
    await act(async () => {
      sessionItem.props.onPress();
      await Promise.resolve();
    });

    expect(runtime.onOpenSession).toHaveBeenCalledWith('s-1');
    expect(onRouteFocus).toHaveBeenCalledWith('TerminalDetail');
    expect(tree.root.findByProps({ testID: 'mock-terminal-route-detail' })).toBeTruthy();
  });

  it('opens detail route when creating a session', async () => {
    const { tree, runtime } = await renderTerminalScreen();

    const createButton = tree.root.findByProps({ testID: 'terminal-sessions-create-btn' });
    await act(async () => {
      createButton.props.onPress();
      await Promise.resolve();
    });

    expect(runtime.onCreateSession).toHaveBeenCalled();
    expect(tree.root.findByProps({ testID: 'mock-terminal-route-detail' })).toBeTruthy();
  });

  it('supports navigating to terminal drive route and reports focus', async () => {
    const { tree, onBindNavigation, onRouteFocus } = await renderTerminalScreen();
    const navigation = onBindNavigation.mock.calls[0]?.[0];

    expect(navigation).toBeTruthy();

    await act(async () => {
      navigation.navigate('TerminalDrive');
      await Promise.resolve();
    });

    expect(onRouteFocus).toHaveBeenCalledWith('TerminalDrive');
    expect(tree.root.findByProps({ testID: 'terminal-drive-page' })).toBeTruthy();
  });
});
