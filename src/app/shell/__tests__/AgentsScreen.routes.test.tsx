import React from 'react';
import { act, create } from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';

import { THEMES } from '../../../core/constants/theme';
import { AgentsScreen } from '../pages/agents';

jest.mock('../../../modules/agents/screens/AgentsScreen', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    AgentsScreen: () => ReactLocal.createElement(View, { testID: 'mock-agents-route-list' })
  };
});

function createRuntime() {
  return {
    theme: THEMES.light,
    selectedAgentKey: 'agent-1',
    onSubmitPublish: jest.fn(),
    onClosePublish: jest.fn()
  };
}

async function renderAgentsScreen(runtime = createRuntime()) {
  const onBindNavigation = jest.fn();
  const onRouteFocus = jest.fn();

  let tree: ReturnType<typeof create> | null = null;
  await act(async () => {
    tree = create(
      <NavigationContainer>
        <AgentsScreen onBindNavigation={onBindNavigation} onRouteFocus={onRouteFocus} runtime={runtime} />
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

describe('AgentsScreen routes', () => {
  it('syncs focus to list and pushes publish route', async () => {
    const { tree, onBindNavigation, onRouteFocus } = await renderAgentsScreen();

    expect(onRouteFocus).toHaveBeenCalledWith('AgentsList');
    expect(tree.root.findByProps({ testID: 'mock-agents-route-list' })).toBeTruthy();

    const navigation = onBindNavigation.mock.calls.at(-1)?.[0];
    await act(async () => {
      navigation.navigate('AgentsPublish');
      await Promise.resolve();
    });

    expect(onRouteFocus).toHaveBeenCalledWith('AgentsPublish');
    expect(tree.root.findByProps({ testID: 'agents-publish-page' })).toBeTruthy();
  });

  it('returns to list for close, cancel, and submit actions', async () => {
    const { tree, runtime, onBindNavigation } = await renderAgentsScreen();
    const navigation = onBindNavigation.mock.calls.at(-1)?.[0];

    const openPublish = async () => {
      await act(async () => {
        navigation.navigate('AgentsPublish');
        await Promise.resolve();
      });
    };

    await openPublish();
    act(() => {
      tree.root.findByProps({ testID: 'shell-publish-close-btn' }).props.onPress();
    });
    expect(runtime.onClosePublish).toHaveBeenCalledTimes(1);
    expect(tree.root.findByProps({ testID: 'mock-agents-route-list' })).toBeTruthy();

    await openPublish();
    act(() => {
      tree.root.findByProps({ testID: 'shell-publish-cancel-btn' }).props.onPress();
    });
    expect(runtime.onClosePublish).toHaveBeenCalledTimes(2);
    expect(tree.root.findByProps({ testID: 'mock-agents-route-list' })).toBeTruthy();

    await openPublish();
    act(() => {
      tree.root.findByProps({ testID: 'shell-publish-submit-btn' }).props.onPress();
    });
    expect(runtime.onSubmitPublish).toHaveBeenCalledTimes(1);
    expect(tree.root.findByProps({ testID: 'mock-agents-route-list' })).toBeTruthy();
  });
});
