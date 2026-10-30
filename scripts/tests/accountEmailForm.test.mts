import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import * as contract from '../../src/core/api/contracts/accountEmail.ts';
import { defaultT } from '../../src/shared/i18n/translate.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const makeReceipt = () => ({ ok: true as const, expiresAt: new Date(Date.now() + 600_000).toISOString() });
const compiled = ts.transpileModule(readFileSync('src/features/auth/EmailVerificationForm.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
}).outputText;
type LoginInput = { email: string; code?: string; signal: AbortSignal };
async function fixture() {
  let generation = 0;
  let account: { session: { accountId: string } | null } = { session: null };
  let foreground!: () => void;
  let listeners = 0;
  let navigated = 0;
  const sends: AbortSignal[] = [];
  const logins: LoginInput[] = [];
  const behavior = { send: async () => makeReceipt(), login: async () => {} };
  const dependencies: Record<string, unknown> = {
    'react-native': {
      View: 'View',
      Text: 'Text',
      TextInput: 'Input',
      Pressable: 'Button',
      ActivityIndicator: 'Spinner',
      AppState: {
        currentState: 'active',
        addEventListener: (_name: string, fn: () => void) => {
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
    '../../core/api/contracts/accountEmail.ts': contract,
    '../../core/auth/useAccountAuth': { useAccountAuth: () => account },
    '../../core/auth/accountAuth.ts': {
      getAccountAuthGeneration: () => generation,
      loginWithAccountEmail: (input: LoginInput) => {
        generation++;
        logins.push(input);
        return behavior.login();
      }
    },
    '../../shared/i18n': { useT: () => defaultT },
    '../../shared/visual/AppThemeProvider': { useAppTheme: () => ({ theme: { colors: {} } }) },
    '../../shared/visual/className': { cn: (...v: unknown[]) => v.filter(Boolean).join(' ') },
    '../../core/api/services/accountEmailApi.ts': {
      accountEmailErrorKey: () => 'accountEmail.error.authentication',
      requestEmailLoginCode: (_email: string, signal: AbortSignal) => {
        sends.push(signal);
        return behavior.send();
      }
    }
  };
  const require = createRequire(import.meta.url);
  const exported = {} as { EmailVerificationForm: React.ComponentType<{ onSuccess: () => void }> };
  new Function('require', 'exports', compiled)((id: string) => dependencies[id] ?? require(id), exported);
  const props = {
    onSuccess: () => {
      navigated++;
    }
  };
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(exported.EmailVerificationForm, props));
  });
  return {
    renderer,
    behavior,
    sends,
    logins,
    email: () => renderer.root.findAllByType('Input')[0],
    secret: () => renderer.root.findAllByType('Input')[1],
    send: () => renderer.root.findAllByType('Button')[0],
    submit: () => renderer.root.findAllByType('Button').at(-1)!,
    foreground: () => foreground(),
    navigated: () => navigated,
    updateAccount: async (id: string, changeIdentity = false) => {
      if (changeIdentity) generation++;
      account = { session: { accountId: id } };
      await act(async () => renderer.update(React.createElement(exported.EmailVerificationForm, props)));
    },
    unmount: async () => {
      await act(async () => renderer.unmount());
      assert.equal(listeners, 0);
    }
  };
}

test('email edits cancel late sends, preserve cooldown and recheck foreground time', async () => {
  const f = await fixture();
  let resolve!: (value: ReturnType<typeof makeReceipt>) => void;
  f.behavior.send = () =>
    new Promise((r) => {
      resolve = r;
    });
  try {
    await act(async () => f.email().props.onChangeText('Alice+tag@Example.COM'));
    await act(async () => f.send().props.onPress());
    await f.updateAccount('a');
    assert.equal(f.sends[0].aborted, false);
    await act(async () => f.email().props.onChangeText('other@example.com'));
    assert.equal(f.sends[0].aborted, true);
    await act(async () => resolve(makeReceipt()));
    assert.equal(f.send().props.disabled, false);
    await act(async () => f.send().props.onPress());
    await act(async () => resolve(makeReceipt()));
    await act(async () => f.secret().props.onChangeText('123456'));
    await act(async () => f.email().props.onChangeText('another@example.com'));
    assert.equal(f.secret().props.value, '');
    assert.equal(f.send().props.disabled, true);
    const beforeNow = Date.now;
    try {
      Date.now = () => beforeNow() + 60_001;
      await act(async () => f.foreground());
      assert.equal(f.send().props.disabled, false);
    } finally {
      Date.now = beforeNow;
    }
    await f.updateAccount('b', true);
    assert.equal(f.email().props.value, '');
    assert.equal(f.submit().props.disabled, true);
  } finally {
    await f.unmount();
  }
});

test('email login preserves leading zeroes, rejects duplicate submits and accepts its own generation', async () => {
  const f = await fixture();
  let finish!: () => void;
  f.behavior.login = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  try {
    await act(async () => f.email().props.onChangeText('a@example.com'));
    await act(async () => f.send().props.onPress());
    assert.equal(f.email().props.accessibilityLabel, '邮箱地址');
    assert.equal(f.email().props.keyboardType, 'email-address');
    assert.equal(f.secret().props.autoComplete, 'one-time-code');
    await act(async () => f.secret().props.onChangeText('012345'));
    await act(async () => f.submit().props.onPress());
    await act(async () => f.submit().props.onPress());
    assert.equal(f.logins.length, 1);
    assert.equal(f.logins[0].code, '012345');
    await f.updateAccount('a');
    assert.equal(f.logins[0].signal.aborted, false);
    await act(async () => finish());
    assert.equal(f.navigated(), 1);
    assert.equal(f.secret().props.value, '');
  } finally {
    await f.unmount();
  }
});

test('unmount aborts a pending email login and discards its result', async () => {
  const f = await fixture();
  let finish!: () => void;
  f.behavior.login = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  await act(async () => f.email().props.onChangeText('a@example.com'));
  await act(async () => f.send().props.onPress());
  await act(async () => f.secret().props.onChangeText('123456'));
  await act(async () => f.submit().props.onPress());
  await f.unmount();
  assert.equal(f.logins[0].signal.aborted, true);
  await act(async () => finish());
  assert.equal(f.navigated(), 0);
});
