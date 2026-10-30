import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';
import { defaultT } from '../../src/shared/i18n/translate.ts';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const compiled = ts.transpileModule(readFileSync('src/features/auth/EnterpriseLogin.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
}).outputText;
async function fixture(os = 'ios') {
  let gen = 0,
    completions = 0,
    navigations = 0,
    cancellations = 0;
  const behavior = { complete: async () => {} };
  const signals: AbortSignal[] = [];
  const deps: Record<string, unknown> = {
    '@react-navigation/native': { useFocusEffect: (fn: () => () => void) => React.useEffect(fn, [fn]) },
    'react-native': {
      ActivityIndicator: 'Spinner',
      Platform: { OS: os },
      Pressable: 'Button',
      Text: 'Text',
      View: 'View'
    },
    'react-native-webview': { WebView: 'WebView' },
    '../../core/auth/authConfig': { readEnterpriseApiBaseUrl: () => 'https://sso.test' },
    '../../core/auth/accountAuth': {
      getAccountAuthGeneration: () => gen,
      beginEnterpriseAccountLogin: async () => {
        gen++;
      },
      completeEnterpriseAccountLogin: async (generation: number, signal: AbortSignal) => {
        assert.equal(generation, gen);
        completions++;
        signals.push(signal);
        await behavior.complete();
      },
      cancelEnterpriseAccountLogin: async () => {
        gen++;
        cancellations++;
      }
    },
    '../../shared/i18n': { useT: () => defaultT },
    '../../shared/visual/AppThemeProvider': { useAppTheme: () => ({ theme: { colors: {} } }) }
  };
  const exported = {} as { EnterpriseLogin: React.ComponentType<{ onSuccess: () => void }> };
  const require = createRequire(import.meta.url);
  new Function('require', 'exports', compiled)((key: string) => deps[key] ?? require(key), exported);
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      React.createElement(exported.EnterpriseLogin, {
        onSuccess: () => {
          navigations++;
        }
      })
    );
  });
  return {
    renderer,
    behavior,
    signals,
    completions: () => completions,
    navigations: () => navigations,
    cancellations: () => cancellations,
    replaceGeneration: () => {
      gen++;
    },
    webview: () => renderer.root.findByType('WebView'),
    unmount: async () => {
      await act(async () => renderer.unmount());
    }
  };
}

test('SSO accepts only an exact completion origin/path and success does not run cancellation cleanup', async () => {
  const f = await fixture();
  try {
    assert.equal(f.webview().props.source.uri, 'https://sso.test/api/login/oidc/start');
    assert.equal(f.webview().props.onMessage, undefined);
    assert.equal(f.webview().props.injectedJavaScript, undefined);
    for (const url of ['', 'invalid-url', 'https://sso.test.evil/', 'https://sso.test/login', 'https://sso.test/other'])
      await act(async () => f.webview().props.onNavigationStateChange({ url, loading: false }));
    assert.equal(f.completions(), 0);
    await act(async () => f.webview().props.onNavigationStateChange({ url: 'https://sso.test/', loading: false }));
    assert.equal(f.completions(), 1);
    assert.equal(f.navigations(), 1);
  } finally {
    await f.unmount();
  }
  assert.equal(f.cancellations(), 0);
});

test('repeated navigation events cannot duplicate verification; closing discards its result', async () => {
  const f = await fixture();
  let finish!: () => void;
  f.behavior.complete = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  await act(async () => f.webview().props.onNavigationStateChange({ url: 'https://sso.test/', loading: false }));
  await act(async () => f.webview().props.onNavigationStateChange({ url: 'https://sso.test/', loading: false }));
  assert.equal(f.completions(), 1);
  await f.unmount();
  assert.equal(f.signals[0].aborted, true);
  await act(async () => finish());
  assert.equal(f.navigations(), 0);
  assert.equal(f.cancellations(), 1);
});

test('failure exposes a retry and a replaced authentication generation cannot navigate', async () => {
  const f = await fixture();
  f.behavior.complete = async () => {
    throw new Error('failed');
  };
  await act(async () => f.webview().props.onNavigationStateChange({ url: 'https://sso.test/', loading: false }));
  assert.equal(f.renderer.root.findAllByType('WebView').length, 0);
  assert.equal(f.renderer.root.findAllByType('Button').length, 1);
  f.behavior.complete = async () => {
    f.replaceGeneration();
  };
  await act(async () => f.renderer.root.findByType('Button').props.onPress());
  await act(async () => f.webview().props.onNavigationStateChange({ url: 'https://sso.test/', loading: false }));
  assert.equal(f.navigations(), 0);
  await f.unmount();
});

test('web preview does not start a native SSO attempt', async () => {
  const f = await fixture('web');
  assert.equal(f.renderer.root.findAllByType('WebView').length, 0);
  assert.equal(f.cancellations(), 0);
  await f.unmount();
});
