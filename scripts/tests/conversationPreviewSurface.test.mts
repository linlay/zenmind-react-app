import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';
import type { WebViewProps } from 'react-native-webview';
import type { ConversationPreviewSurfaceProps } from '../../src/shared/components/conversationPreview/types.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  readFileSync(
    new URL('../../src/shared/components/conversationPreview/PreviewSurface.native.tsx', import.meta.url),
    'utf8'
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }
).outputText;

function fixture(os: 'android' | 'ios') {
  let requestId = 'first-preview';
  let mounts = 0;
  function WebView() {
    React.useEffect(() => {
      mounts++;
    }, []);
    return null;
  }
  const dependencies: Record<string, unknown> = {
    react: React,
    'react-native': {
      ActivityIndicator: 'Spinner',
      Platform: { OS: os },
      StyleSheet: { create: (styles: unknown) => styles },
      View: 'View'
    },
    'react-native-webview': { WebView },
    '../../i18n': { useT: () => (key: string) => key },
    '../../visual/AppThemeProvider': { useAppTheme: () => ({ theme: { colors: {} } }) },
    './useConversationPreviewRuntime': {
      useConversationPreviewRuntime: () => ({
        handleRawEvent: () => {},
        height: 240,
        requestId,
        runtimeHtml: '<html></html>',
        serializedRequest: '{}'
      })
    }
  };
  const exported: { PreviewSurface?: React.ComponentType<ConversationPreviewSurfaceProps> } = {};
  new Function('require', 'exports', compiled)((id: string) => dependencies[id] ?? require(id), exported);
  return {
    Component: exported.PreviewSurface!,
    WebView,
    getMounts: () => mounts,
    nextRequest: () => {
      requestId = 'replacement-preview';
    }
  };
}

for (const os of ['android', 'ios'] as const) {
  test(`${os} preview preserves its Cookie policy when mounted, replaced, and reactivated`, async () => {
    const f = fixture(os);
    const props: ConversationPreviewSurfaceProps = {
      active: true,
      cacheKey: 'preview',
      kind: 'mermaid',
      mode: 'inline',
      retryNonce: 0,
      source: 'graph TD; A-->B',
      theme: 'light',
      onError: () => {},
      onReady: () => {}
    };
    let renderer!: ReactTestRenderer;
    const assertPolicy = () => {
      const webView = renderer.root.findByType(f.WebView).props as WebViewProps;
      // Android incognito clears the app-wide CookieManager; iOS uses a separate nonpersistent store.
      assert.equal(webView.incognito, os === 'ios');
      assert.equal(webView.sharedCookiesEnabled, false);
      assert.equal(webView.thirdPartyCookiesEnabled, false);
      assert.equal(webView.domStorageEnabled, false);
      assert.equal(webView.cacheEnabled, false);
      assert.deepEqual(webView.source, { html: '<html></html>', baseUrl: 'about:blank' });
    };
    try {
      await act(async () => {
        renderer = create(React.createElement(f.Component, props));
      });
      assertPolicy();
      f.nextRequest();
      await act(async () =>
        renderer.update(React.createElement(f.Component, { ...props, kind: 'html', mode: 'overlay' }))
      );
      assertPolicy();
      assert.equal(f.getMounts(), 2);
      await act(async () => renderer.update(React.createElement(f.Component, { ...props, active: false })));
      assert.equal(renderer.root.findAllByType(f.WebView).length, 0);
      await act(async () => renderer.update(React.createElement(f.Component, { ...props, kind: 'echarts' })));
      assertPolicy();
      assert.equal(f.getMounts(), 3);
    } finally {
      if (renderer) await act(async () => renderer.unmount());
    }
  });
}
