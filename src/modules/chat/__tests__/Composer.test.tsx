import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Composer, WEBVIEW_BRIDGE_SCRIPT } from '../components/Composer';

jest.mock('expo-linear-gradient', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: ({ children, ...props }: { children?: React.ReactNode }) =>
      ReactLocal.createElement(View, props, children)
  };
});

jest.mock('react-native-webview', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    WebView: ({ children, ...props }: { children?: React.ReactNode }) =>
      ReactLocal.createElement(View, props, children)
  };
});

const baseTheme = {
  surfaceStrong: '#111',
  surface: '#222',
  border: '#333',
  text: '#fff',
  textMute: '#999',
  primary: '#0af',
  primaryDeep: '#08c',
  danger: '#f44'
};

const baseToolState = {
  runId: 'run-1',
  toolId: 'tool-1',
  toolKey: 'confirm_dialog',
  toolType: 'html',
  toolName: 'confirm_dialog',
  toolTimeout: 300000,
  toolParams: null,
  paramsReady: false,
  paramsError: '',
  argsText: '',
  toolInitDispatched: false,
  userInteracted: false,
  initAttempt: 0,
  initLastSentAtMs: undefined,
  viewportHtml: null,
  loading: false,
  loadError: ''
};

async function renderComposer(activeFrontendTool: Record<string, unknown>, onRetry?: () => void) {
  let tree: renderer.ReactTestRenderer | null = null;
  await act(async () => {
    tree = renderer.create(
      <Composer
        theme={baseTheme}
        composerText=""
        focused={false}
        onChangeText={() => {}}
        onFocus={() => {}}
        onBlur={() => {}}
        onSend={() => {}}
        onStop={() => {}}
        streaming={false}
        activeFrontendTool={activeFrontendTool as never}
        frontendToolBaseUrl="https://app.linlay.cc"
        frontendToolWebViewRef={{ current: null }}
        onFrontendToolMessage={() => {}}
        onFrontendToolLoad={() => {}}
        onFrontendToolRetry={onRetry || (() => {})}
      />
    );
  });
  return tree as renderer.ReactTestRenderer;
}

describe('Composer', () => {
  it('injects interaction probe bridge message forwarding', () => {
    expect(WEBVIEW_BRIDGE_SCRIPT).toContain('frontend_interacted');
    expect(WEBVIEW_BRIDGE_SCRIPT).toContain('frontend_ready');
    expect(WEBVIEW_BRIDGE_SCRIPT).toContain("['click', 'input', 'change', 'keydown', 'touchstart']");
  });

  it('shows retry button when frontend tool loadError exists', async () => {
    const onRetry = jest.fn();
    const tree = await renderComposer({ ...baseToolState, loadError: 'load failed' }, onRetry);

    const retryBtn = tree.root.findByProps({ testID: 'frontend-tool-retry-btn' });
    act(() => {
      retryBtn.props.onPress();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
    await act(async () => {
      tree.unmount();
    });
  });

  it('shows blocking params error state when paramsError exists', async () => {
    const tree = await renderComposer({
      ...baseToolState,
      viewportHtml: '<html><body>ok</body></html>',
      paramsError: '工具参数解析失败（严格 JSON）'
    });
    expect(tree.root.findByProps({ testID: 'frontend-tool-params-error' })).toBeTruthy();
    expect(tree.root.findAllByProps({ testID: 'frontend-tool-webview' }).length).toBeGreaterThan(0);
    await act(async () => {
      tree.unmount();
    });
  });
});
