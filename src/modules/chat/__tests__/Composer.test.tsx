import React from 'react';
import renderer, { act } from 'react-test-renderer';
import * as ReactNative from 'react-native';
import { Composer, WEBVIEW_BRIDGE_SCRIPT } from '../components/Composer';

const { Alert, Platform, StyleSheet } = ReactNative;

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
  renderMode: 'webview',
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

async function renderComposer(
  activeFrontendTool: Record<string, unknown>,
  options?: {
    onRetry?: () => void;
    onNativeConfirmSubmit?: (params: Record<string, unknown>) => Promise<boolean>;
    onFrontendToolMessage?: (event: { nativeEvent: { data: string } }) => void;
  }
) {
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
        frontendToolBaseUrl="https://api.example.com"
        frontendToolWebViewRef={{ current: null }}
        onFrontendToolMessage={options?.onFrontendToolMessage || (() => {})}
        onFrontendToolLoad={() => {}}
        onFrontendToolRetry={options?.onRetry || (() => {})}
        onNativeConfirmSubmit={options?.onNativeConfirmSubmit || (() => Promise.resolve(false))}
      />
    );
  });
  return tree as renderer.ReactTestRenderer;
}

function getFrontendToolContainerMaxHeight(tree: renderer.ReactTestRenderer): number {
  const container = tree.root.findByProps({ testID: 'frontend-tool-container' });
  const merged = StyleSheet.flatten(container.props.style) as { maxHeight?: number } | undefined;
  return Number(merged?.maxHeight || 0);
}

function getFrontendToolContainerHeight(tree: renderer.ReactTestRenderer): number {
  const container = tree.root.findByProps({ testID: 'frontend-tool-container' });
  const merged = StyleSheet.flatten(container.props.style) as { height?: number } | undefined;
  return Number(merged?.height || 0);
}

describe('Composer', () => {
  it('injects interaction probe bridge message forwarding', () => {
    expect(WEBVIEW_BRIDGE_SCRIPT).toContain('frontend_interacted');
    expect(WEBVIEW_BRIDGE_SCRIPT).toContain('frontend_ready');
    expect(WEBVIEW_BRIDGE_SCRIPT).toContain('frontend_layout');
    expect(WEBVIEW_BRIDGE_SCRIPT).toContain("['click', 'input', 'change', 'keydown', 'touchstart']");
    expect(WEBVIEW_BRIDGE_SCRIPT).not.toContain('frontend_submit');
  });

  it('shows retry button when frontend tool loadError exists', async () => {
    const onRetry = jest.fn();
    const tree = await renderComposer({ ...baseToolState, loadError: 'load failed' }, { onRetry });

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

  it('renders native confirm dialog without webview', async () => {
    const tree = await renderComposer({
      ...baseToolState,
      renderMode: 'native_confirm_dialog',
      paramsReady: true,
      toolParams: {
        question: '你希望去哪种类型的城市旅行？',
        options: ['海滨城市', '历史文化名城'],
        allowFreeText: false
      }
    });
    expect(tree.root.findByProps({ testID: 'native-confirm-dialog-root' })).toBeTruthy();
    expect(tree.root.findAllByProps({ testID: 'frontend-tool-webview' }).length).toBe(0);
    await act(async () => {
      tree.unmount();
    });
  });

  it('uses 80% viewport maxHeight for native confirm dialog on ios', async () => {
    const originalOs = Platform.OS;
    (Platform as { OS: string }).OS = 'ios';
    const dimensionsSpy = jest.spyOn(ReactNative.Dimensions, 'get').mockImplementation(() => ({
      width: 390,
      height: 1000,
      scale: 2,
      fontScale: 1
    }));

    try {
      const tree = await renderComposer({
        ...baseToolState,
        toolId: 'tool-ios-height',
        renderMode: 'native_confirm_dialog',
        paramsReady: true,
        toolParams: {
          question: '请输入你的方案',
          options: [],
          allowFreeText: true
        }
      });
      expect(getFrontendToolContainerMaxHeight(tree)).toBe(800);
      await act(async () => {
        tree.unmount();
      });
    } finally {
      dimensionsSpy.mockRestore();
      (Platform as { OS: string }).OS = originalOs;
    }
  });

  it('uses 80% viewport maxHeight for native confirm dialog on web', async () => {
    const originalOs = Platform.OS;
    (Platform as { OS: string }).OS = 'web';
    const dimensionsSpy = jest.spyOn(ReactNative.Dimensions, 'get').mockImplementation(() => ({
      width: 1200,
      height: 900,
      scale: 1,
      fontScale: 1
    }));

    try {
      const tree = await renderComposer({
        ...baseToolState,
        toolId: 'tool-web-height',
        renderMode: 'native_confirm_dialog',
        paramsReady: true,
        toolParams: {
          question: '请输入你的方案',
          options: [],
          allowFreeText: true
        }
      });
      expect(getFrontendToolContainerMaxHeight(tree)).toBe(720);
      await act(async () => {
        tree.unmount();
      });
    } finally {
      dimensionsSpy.mockRestore();
      (Platform as { OS: string }).OS = originalOs;
    }
  });

  it('uses 80% viewport maxHeight for native confirm dialog on android', async () => {
    const originalOs = Platform.OS;
    (Platform as { OS: string }).OS = 'android';
    const dimensionsSpy = jest.spyOn(ReactNative.Dimensions, 'get').mockImplementation(() => ({
      width: 390,
      height: 1000,
      scale: 2,
      fontScale: 1
    }));

    try {
      const tree = await renderComposer({
        ...baseToolState,
        toolId: 'tool-android-height',
        renderMode: 'native_confirm_dialog',
        paramsReady: true,
        toolParams: {
          question: '请输入你的方案',
          options: [],
          allowFreeText: true
        }
      });
      expect(getFrontendToolContainerMaxHeight(tree)).toBe(800);
      await act(async () => {
        tree.unmount();
      });
    } finally {
      dimensionsSpy.mockRestore();
      (Platform as { OS: string }).OS = originalOs;
    }
  });

  it('clamps native confirm dialog measured content height between min and 80% viewport', async () => {
    const originalOs = Platform.OS;
    (Platform as { OS: string }).OS = 'ios';
    const dimensionsSpy = jest.spyOn(ReactNative.Dimensions, 'get').mockImplementation(() => ({
      width: 390,
      height: 1000,
      scale: 2,
      fontScale: 1
    }));

    try {
      const tree = await renderComposer({
        ...baseToolState,
        toolId: 'tool-native-measure',
        renderMode: 'native_confirm_dialog',
        paramsReady: true,
        toolParams: {
          question: '请输入你的方案',
          options: ['选项A', '选项B'],
          allowFreeText: true
        }
      });
      expect(getFrontendToolContainerHeight(tree)).toBe(320);

      const scroll = tree.root.findByProps({ testID: 'native-confirm-dialog-scroll' });
      await act(async () => {
        scroll.props.onContentSizeChange(300, 260);
      });
      expect(getFrontendToolContainerHeight(tree)).toBe(320);

      await act(async () => {
        scroll.props.onContentSizeChange(300, 540);
      });
      expect(getFrontendToolContainerHeight(tree)).toBe(540);

      await act(async () => {
        scroll.props.onContentSizeChange(300, 980);
      });
      expect(getFrontendToolContainerHeight(tree)).toBe(800);

      await act(async () => {
        tree.unmount();
      });
    } finally {
      dimensionsSpy.mockRestore();
      (Platform as { OS: string }).OS = originalOs;
    }
  });

  it('uses webview layout message to update container height and clamp to viewport max', async () => {
    const originalOs = Platform.OS;
    (Platform as { OS: string }).OS = 'ios';
    const dimensionsSpy = jest.spyOn(ReactNative.Dimensions, 'get').mockImplementation(() => ({
      width: 390,
      height: 1000,
      scale: 2,
      fontScale: 1
    }));
    const onFrontendToolMessage = jest.fn();

    try {
      const tree = await renderComposer(
        {
          ...baseToolState,
          toolId: 'tool-webview-layout',
          renderMode: 'webview',
          viewportHtml: '<html><body><div style="height:1200px">layout</div></body></html>'
        },
        { onFrontendToolMessage }
      );
      expect(getFrontendToolContainerHeight(tree)).toBe(800);

      const webview = tree.root.findByProps({ testID: 'frontend-tool-webview' });
      await act(async () => {
        webview.props.onMessage({
          nativeEvent: {
            data: JSON.stringify({
              type: 'frontend_layout',
              contentHeight: 460
            })
          }
        });
      });
      expect(getFrontendToolContainerHeight(tree)).toBe(460);
      expect(onFrontendToolMessage).not.toHaveBeenCalled();

      await act(async () => {
        webview.props.onMessage({
          nativeEvent: {
            data: JSON.stringify({
              type: 'frontend_layout',
              contentHeight: 1200
            })
          }
        });
      });
      expect(getFrontendToolContainerHeight(tree)).toBe(800);
      expect(onFrontendToolMessage).not.toHaveBeenCalled();

      await act(async () => {
        webview.props.onMessage({
          nativeEvent: {
            data: JSON.stringify({
              type: 'frontend_submit',
              params: {
                ok: true
              }
            })
          }
        });
      });
      expect(onFrontendToolMessage).toHaveBeenCalledTimes(1);

      await act(async () => {
        tree.unmount();
      });
    } finally {
      dimensionsSpy.mockRestore();
      (Platform as { OS: string }).OS = originalOs;
    }
  });

  it('submits option immediately for native confirm dialog when allowFreeText is false', async () => {
    const onNativeConfirmSubmit = jest.fn().mockResolvedValue(true);
    const tree = await renderComposer(
      {
        ...baseToolState,
        renderMode: 'native_confirm_dialog',
        paramsReady: true,
        toolParams: {
          question: '去哪里？',
          options: ['海滨城市', '历史文化名城'],
          allowFreeText: false
        }
      },
      { onNativeConfirmSubmit }
    );

    const optionBtn = tree.root.findByProps({ testID: 'native-confirm-dialog-option-1' });
    await act(async () => {
      optionBtn.props.onPress();
    });

    expect(onNativeConfirmSubmit).toHaveBeenCalledWith({
      selectedOption: '历史文化名城',
      selectedIndex: 1,
      freeText: '',
      isCustom: false
    });
    await act(async () => {
      tree.unmount();
    });
  });

  it('does not call system alert on android and still submits option', async () => {
    const onNativeConfirmSubmit = jest.fn().mockResolvedValue(true);
    const originalOs = Platform.OS;
    (Platform as { OS: string }).OS = 'android';
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    try {
      const tree = await renderComposer(
        {
          ...baseToolState,
          toolId: 'tool-android-alert',
          renderMode: 'native_confirm_dialog',
          paramsReady: true,
          toolParams: {
            question: '去哪里？',
            options: ['海滨城市', '历史文化名城'],
            allowFreeText: false
          }
        },
        { onNativeConfirmSubmit }
      );

      expect(alertSpy).not.toHaveBeenCalled();
      const optionBtn = tree.root.findByProps({ testID: 'native-confirm-dialog-option-1' });
      await act(async () => {
        optionBtn.props.onPress();
      });

      expect(onNativeConfirmSubmit).toHaveBeenCalledWith({
        selectedOption: '历史文化名城',
        selectedIndex: 1,
        freeText: '',
        isCustom: false
      });

      await act(async () => {
        tree.unmount();
      });
    } finally {
      alertSpy.mockRestore();
      (Platform as { OS: string }).OS = originalOs;
    }
  });

  it('submits custom text for native confirm dialog when allowFreeText is true', async () => {
    const onNativeConfirmSubmit = jest.fn().mockResolvedValue(true);
    const tree = await renderComposer(
      {
        ...baseToolState,
        renderMode: 'native_confirm_dialog',
        paramsReady: true,
        toolParams: {
          question: '请输入你的方案',
          options: ['选项A', '选项B'],
          allowFreeText: true
        }
      },
      { onNativeConfirmSubmit }
    );

    const input = tree.root.findByProps({ testID: 'native-confirm-dialog-free-text-input' });
    await act(async () => {
      input.props.onChangeText('  杭州西湖一日游  ');
    });

    const submitBtn = tree.root.findByProps({ testID: 'native-confirm-dialog-submit-btn' });
    await act(async () => {
      submitBtn.props.onPress();
    });

    expect(onNativeConfirmSubmit).toHaveBeenCalledWith({
      selectedOption: '杭州西湖一日游',
      selectedIndex: -1,
      freeText: '杭州西湖一日游',
      isCustom: true
    });
    await act(async () => {
      tree.unmount();
    });
  });

  it('shows native confirm error and blocks submit when paramsError exists', async () => {
    const onNativeConfirmSubmit = jest.fn().mockResolvedValue(true);
    const tree = await renderComposer(
      {
        ...baseToolState,
        renderMode: 'native_confirm_dialog',
        paramsReady: false,
        paramsError: '工具参数解析失败（严格 JSON）'
      },
      { onNativeConfirmSubmit }
    );

    expect(tree.root.findByProps({ testID: 'native-confirm-dialog-error' })).toBeTruthy();
    expect(tree.root.findAllByProps({ testID: 'native-confirm-dialog-submit-btn' }).length).toBe(0);
    expect(onNativeConfirmSubmit).not.toHaveBeenCalled();
    await act(async () => {
      tree.unmount();
    });
  });
});
