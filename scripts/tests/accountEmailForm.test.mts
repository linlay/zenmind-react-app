import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import * as contract from '../../src/core/api/contracts/accountEmail.ts';
import { ApiError } from '../../src/core/api/apiError.ts';
import { defaultT } from '../../src/shared/i18n/translate.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const makeReceipt = () => ({ ok: true, expiresAt: new Date(Date.now() + 600_000).toISOString() });

test('email UI ignores delayed send after edits, survives token refresh, cancels on account switch and rechecks foreground countdown', async () => {
  let generation = 0;
  let account: { session: { accountId: string; deviceId: string } | null } = {
    session: { accountId: 'a', deviceId: 'phone' }
  };
  let sendResolve: ((value: ReturnType<typeof makeReceipt>) => void) | undefined;
  let sentSignal: AbortSignal | undefined;
  let foreground: ((state: string) => void) | undefined;
  let listeners = 0;
  const dependencies: Record<string, unknown> = {
    'react-native': {
      View: 'View',
      Text: 'Text',
      TextInput: 'Input',
      Pressable: 'Button',
      ActivityIndicator: 'Spinner',
      AppState: {
        currentState: 'active',
        addEventListener: (_name: string, fn: (state: string) => void) => {
          foreground = fn;
          listeners++;
          return {
            remove: () => {
              listeners--;
            }
          };
        }
      }
    },
    '@react-navigation/native': { useFocusEffect: (fn: () => () => void) => React.useEffect(fn, [fn]) },
    '../../core/api/apiError.ts': { ApiError },
    '../../core/api/contracts/accountEmail.ts': contract,
    '../../core/auth/useAccountAuth': { useAccountAuth: () => account },
    '../../core/auth/accountAuth.ts': { getAccountAuthGeneration: () => generation },
    '../../shared/i18n': { useT: () => defaultT },
    '../../shared/visual/AppThemeProvider': { useAppTheme: () => ({ theme: { colors: {} } }) },
    '../../shared/visual/className': { cn: (...v: unknown[]) => v.filter(Boolean).join(' ') },
    '../../core/api/services/accountEmailApi.ts': {
      accountEmailErrorKey: () => 'accountEmail.error.rate',
      requestEmailLoginCode: (_email: string, signal: AbortSignal) => {
        sentSignal = signal;
        return new Promise<ReturnType<typeof makeReceipt>>((resolve) => {
          sendResolve = resolve;
        });
      }
    }
  };
  const require = createRequire(import.meta.url);
  const exported: { EmailVerificationForm?: React.ComponentType<{ onSuccess: () => void }> } = {};
  const code = ts.transpileModule(
    readFileSync(new URL('../../src/features/auth/EmailVerificationForm.tsx', import.meta.url), 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
    }
  ).outputText;
  new Function('require', 'exports', code)((id: string) => dependencies[id] ?? require(id), exported);
  const Component = exported.EmailVerificationForm!;
  let renderer!: ReactTestRenderer;
  const input = () => renderer.root.findAllByType('Input')[0];
  const sendButton = () => renderer.root.findAllByType('Button')[0];
  await act(async () => {
    renderer = create(React.createElement(Component, { onSuccess: () => {} }));
  });
  try {
    await act(async () => input().props.onChangeText('Alice+tag@Example.COM'));
    await act(async () => sendButton().props.onPress());
    assert.equal(sentSignal?.aborted, false);
    // Refresh emits a new snapshot with the same account/generation. It must not abort the form.
    account = { session: { accountId: 'a', deviceId: 'phone' } };
    await act(async () => renderer.update(React.createElement(Component, { onSuccess: () => {} })));
    assert.equal(sentSignal?.aborted, false);
    await act(async () => input().props.onChangeText('other@example.com'));
    assert.equal(sentSignal?.aborted, true);
    await act(async () => sendResolve!(makeReceipt()));
    assert.equal(sendButton().props.disabled, false);
    await act(async () => sendButton().props.onPress());
    const receipt = makeReceipt();
    await act(async () => sendResolve!(receipt));
    assert.equal(sendButton().props.disabled, true);
    const beforeNow = Date.now;
    Date.now = () => beforeNow() + 60_001;
    try {
      await act(async () => foreground!('active'));
    } finally {
      Date.now = beforeNow;
    }
    assert.equal(sendButton().props.disabled, false);
    generation++;
    account = { session: { accountId: 'b', deviceId: 'phone' } };
    await act(async () => renderer.update(React.createElement(Component, { onSuccess: () => {} })));
    assert.equal(input().props.value, '');
    assert.equal(renderer.root.findAllByType('Input')[1].props.value, '');
    assert.equal(renderer.root.findAllByType('Button')[1].props.disabled, true);
  } finally {
    await act(async () => renderer.unmount());
  }
  assert.equal(listeners, 0);
});

test('email UI allows its own login generation to finish and navigation succeeds', async () => {
  let generation = 0;
  let account: { session: { accountId: string; deviceId: string } | null } = { session: null };
  let finishLogin: (() => void) | undefined;
  let signal: AbortSignal | undefined;
  let navigated = false;
  const dependencies: Record<string, unknown> = {
    'react-native': {
      View: 'View',
      Text: 'Text',
      TextInput: 'Input',
      Pressable: 'Button',
      ActivityIndicator: 'Spinner',
      AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) }
    },
    '@react-navigation/native': { useFocusEffect: (fn: () => () => void) => React.useEffect(fn, [fn]) },
    '../../core/api/apiError.ts': { ApiError },
    '../../core/api/contracts/accountEmail.ts': contract,
    '../../core/auth/useAccountAuth': { useAccountAuth: () => account },
    '../../core/auth/accountAuth.ts': {
      getAccountAuthGeneration: () => generation,
      loginWithAccountEmail: (input: { signal: AbortSignal }) => {
        generation++;
        signal = input.signal;
        return new Promise<void>((resolve) => {
          finishLogin = resolve;
        });
      }
    },
    '../../shared/i18n': { useT: () => defaultT },
    '../../shared/visual/AppThemeProvider': { useAppTheme: () => ({ theme: { colors: {} } }) },
    '../../shared/visual/className': { cn: (...v: unknown[]) => v.filter(Boolean).join(' ') },
    '../../core/api/services/accountEmailApi.ts': {
      accountEmailErrorKey: () => 'accountEmail.error.network',
      requestEmailLoginCode: async () => makeReceipt()
    }
  };
  const require = createRequire(import.meta.url);
  const exported: {
    EmailVerificationForm?: React.ComponentType<{ onSuccess: () => void }>;
  } = {};
  const code = ts.transpileModule(
    readFileSync(new URL('../../src/features/auth/EmailVerificationForm.tsx', import.meta.url), 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
    }
  ).outputText;
  new Function('require', 'exports', code)((id: string) => dependencies[id] ?? require(id), exported);
  let renderer!: ReactTestRenderer;
  const props = {
    onSuccess: () => {
      navigated = true;
    }
  };
  await act(async () => {
    renderer = create(React.createElement(exported.EmailVerificationForm!, props));
  });
  try {
    await act(async () => renderer.root.findAllByType('Input')[0].props.onChangeText('a@example.com'));
    await act(async () => renderer.root.findAllByType('Button')[0].props.onPress());
    await act(async () => renderer.root.findAllByType('Input')[1].props.onChangeText('123456'));
    await act(async () => renderer.root.findAllByType('Button')[1].props.onPress());
    assert.equal(signal?.aborted, false);
    account = { session: { accountId: 'a', deviceId: 'phone' } };
    await act(async () => renderer.update(React.createElement(exported.EmailVerificationForm!, props)));
    assert.equal(signal?.aborted, false);
    await act(async () => finishLogin!());
    assert.equal(navigated, true);
  } finally {
    await act(async () => renderer.unmount());
  }
});
