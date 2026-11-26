import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { transformSync } from '@babel/core';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);

function loadSourceSheet() {
  const file = new URL('../../src/features/chatPersistence/components/AccountSourceSheet.tsx', import.meta.url);
  const code = transformSync(readFileSync(file, 'utf8'), {
    filename: file.pathname,
    configFile: false,
    babelrc: false,
    presets: [['@babel/preset-typescript', { allExtensions: true, isTSX: true }]],
    plugins: [
      ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }],
      '@babel/plugin-transform-modules-commonjs'
    ]
  })!.code!;
  const deps: Record<string, unknown> = {
    'react-native': {
      ActivityIndicator: 'Spinner',
      Pressable: 'Button',
      ScrollView: 'Scroll',
      Text: 'Text',
      View: 'View',
      useWindowDimensions: () => ({ height: 800 }),
      PanResponder: { create: (handlers: unknown) => ({ panHandlers: handlers }) }
    },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 23 }) },
    '../../../core/auth/useCloudAuth': { useCloudAuth: () => ({ status: 'missing' }) },
    '../../../core/auth/activeDesktop': { subscribeActiveDesktop: () => () => {}, getSelectedSource: () => null },
    '../cloudAccess': { verifyDefaultCloud() {} },
    '../../../shared/icons/AppIcon': { AppIcon: 'Icon' },
    '../../../shared/i18n': { useT: () => (key: string) => key },
    './ChatBottomSheet': { ChatBottomSheet: 'BottomSheet' }
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (key: string) => deps[key] ?? require(key),
    module,
    module.exports
  );
  return (module.exports as { AccountSourceSheet: React.ComponentType<Record<string, unknown>> }).AccountSourceSheet;
}

for (const mode of ['account', 'cloud']) {
  test(`source ${mode} login waits for dismissal and the source sheet can reopen`, async () => {
    const Sheet = loadSourceSheet();
    const logins: string[] = [];
    let closes = 0;
    const props = {
      visible: true,
      loggedIn: false,
      devices: [],
      selectedId: '',
      loading: false,
      switchingId: null,
      error: '',
      onClose: () => closes++,
      onRefresh() {},
      onSelect() {},
      onLogin: (value: string) => logins.push(value)
    };
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(React.createElement(Sheet, props));
    });
    try {
      const sheet = () => renderer.root.findByType('BottomSheet');
      const label = mode === 'cloud' ? 'cloud.login' : 'auth.mode.account';
      const button = renderer.root
        .findAllByType('Button')
        .find((node) => node.findAllByType('Text').some((text) => text.props.children === label))!;
      await act(async () => button.props.onPress());
      assert.equal(sheet().props.visible, false);
      assert.deepEqual(logins, [], 'do not navigate over a still-present native modal');
      await act(async () => {
        renderer.update(React.createElement(Sheet, { ...props, visible: false }));
      });
      await act(async () => sheet().props.onDismiss());
      assert.deepEqual(logins, [mode]);
      await act(async () => renderer.update(React.createElement(Sheet, props)));
      assert.equal(sheet().props.visible, true);
      assert.equal(sheet().props.panelStyle.paddingBottom, 23);
      await act(async () => sheet().props.onClose());
      assert.equal(closes, 1, 'backdrop and system-back keep the existing close callback');
      await act(async () => {
        renderer.update(React.createElement(Sheet, { ...props, visible: false }));
      });
      await act(async () => sheet().props.onDismiss());
      assert.deepEqual(logins, [mode], 'a normal dismissal must not replay the login action');
    } finally {
      await act(async () => renderer.unmount());
    }
  });
}
