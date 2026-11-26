import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const composerSource = readFileSync(
  new URL('../../src/features/chatPersistence/components/Composer.tsx', import.meta.url),
  'utf8'
);

test('composer uses the native TextInput placeholder instead of an animated overlay', () => {
  assert.match(composerSource, /placeholder=\{placeholderText\}/);
  assert.match(composerSource, /placeholderTextColor=\{theme\.colors\.textSecondary\}/);
  assert.doesNotMatch(composerSource, /placeholder=""/);
  assert.doesNotMatch(composerSource, /INPUT_PLACEHOLDER/);
  assert.doesNotMatch(composerSource, /placeholderStyle/);
});


import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { defaultT } from '../../src/shared/i18n/translate.ts';
const require = createRequire(import.meta.url);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

test('production composer has one primary operation, retains input while sending and focuses after submit', async () => {
  const code = ts.transpileModule(composerSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: Record<string, any> = {};
  const deps: Record<string, unknown> = {
    'react-native': { View: 'View', TextInput: 'TextInput', Pressable: 'Pressable', ActivityIndicator: 'Spinner', useWindowDimensions: () => ({ fontScale: 1 }) },
    './ComposerTextInput': { ComposerTextInput: 'TextInput' },
    '../../../shared/icons/AppIcon': { AppIcon: 'Icon' },
    '../../../shared/i18n': { useT: () => defaultT },
    '../../../shared/visual/AppThemeProvider': { useAppTheme: () => ({ theme: { colors: {} } }) },
    '../../../shared/visual/className': { cn: (...args: unknown[]) => args.filter(Boolean).join(' ') }
  };
  new Function('require', 'exports', code)((key: string) => deps[key] ?? require(key), exports);
  const calls: string[] = [];
  const props = { value: 'draft', onEdit() {}, content: null, toolbar: null, primaryAction: 'send',
    onSubmit: () => calls.push('submit'), onStop: () => calls.push('stop'), onResume: () => calls.push('resume') };
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(exports.Composer, props), { createNodeMock: () => ({ focus: () => calls.push('focus') }) }); });
  try {
    assert.equal(renderer.root.findAllByType('Pressable').length, 1);
    await act(async () => renderer.root.findByType('Pressable').props.onPress());
    assert.deepEqual(calls, ['submit', 'focus']);
    for (const primaryAction of ['sending', 'send-disabled', 'stop', 'resume']) {
      await act(async () => renderer.update(React.createElement(exports.Composer, { ...props, primaryAction })));
      assert.equal(renderer.root.findByType('TextInput').props.editable, true);
      await act(async () => renderer.root.findByType('Pressable').props.onPress());
    }
    assert.deepEqual(calls, ['submit', 'focus', 'stop', 'resume']);
  } finally { await act(async () => renderer.unmount()); }
});
