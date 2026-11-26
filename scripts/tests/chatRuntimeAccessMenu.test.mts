import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { transformSync } from '@babel/core';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { defaultT } from '../../src/shared/i18n/translate.ts';
import { cn } from '../../src/shared/visual/className.ts';
const require = createRequire(import.meta.url);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function loadRow() {
  const file = new URL('../../src/features/chatPersistence/components/ChatComposerOptionRow.tsx', import.meta.url);
  const transformed = transformSync(readFileSync(file, 'utf8'), {
    filename: file.pathname,
    configFile: false,
    babelrc: false,
    presets: [['@babel/preset-typescript', { allExtensions: true, isTSX: true }]],
    plugins: [
      ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }],
      '@babel/plugin-transform-modules-commonjs'
    ]
  });
  const module = { exports: {} };
  const deps: Record<string, unknown> = {
    'react-native': {
      View: 'View',
      Text: 'Text',
      Pressable: 'Pressable',
      Modal: 'Modal',
      ScrollView: 'ScrollView',
      KeyboardAvoidingView: 'KeyboardAvoidingView',
      Switch: 'Switch',
      useWindowDimensions: () => ({ width: 400, height: 800 }),
      Keyboard: { isVisible: () => false, dismiss: () => {}, addListener: () => ({ remove: () => {} }) }
    },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 20, left: 0, right: 0 }) },
    './ChatComposerSheet': { ChatComposerSheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => visible ? React.createElement('Modal', {}, children) : null },
    './ChatComposerSkillsMenu': { ChatComposerSkillsMenu: 'SkillsMenu' },
    '../../../shared/i18n': { useT: () => defaultT },
    '../../../shared/visual/className': { cn },
    '../../../shared/icons/AppIcon': { AppIcon: 'Icon' },
    '../../../shared/visual/AppThemeProvider': { useAppTheme: () => ({ theme: { colors: { shadow: '#000' } } }) },
    '../../../shared/visual/foundation': { appVisualTokens: { iconSizes: { sm: 16, md: 20 } } }
  };
  new Function('require', 'module', 'exports', transformed!.code!)(
    (key: string) => deps[key] ?? require(key),
    module,
    module.exports
  );
  return (module.exports as any).ChatComposerOptionRow;
}
test('production access menu updates current run only and prevents unconfirmed future permission changes', async () => {
  const Row = loadRow();
  const runtime: string[] = [],
    future: string[] = [];
  const props = {
    skillsEnabled: false,
    skillsDisabled: false,
    skillsCatalog: null,
    selectedSkills: [],
    skillsLoading: false,
    skillsError: '',
    onLoadSkills: () => {},
    onToggleSkills: () => {},
    accessLevel: 'default',
    agentKey: 'agent',
    modelOverride: {},
    modelOptionsLoading: false,
    modelOptionsSnapshot: null,
    onAccessLevelChange: (value: string) => future.push(value),
    onModelOverrideChange: () => {},
    runtimeAccess: { runId: 'run', level: 'auto_approve', phase: 'sending' },
    onRuntimeAccessChange: (value: string) => runtime.push(value)
  };
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(Row, props), {
      createNodeMock: () => ({ measureInWindow: (fn: any) => fn(16, 600, 368, 48) })
    });
  });
  const withLabel = (label: string) =>
    renderer.root
      .findAllByType('Pressable')
      .filter((item) => item.findAllByType('Text').some((text) => text.props.children === label));
  try {
    await act(async () => withLabel(defaultT('composer.executionSettings'))[0].props.onPress());
    const full = withLabel(defaultT('composer.query.access.full_access'));
    assert.equal(full.length, 1);
    assert.equal(full[0].props.disabled, true);
    await act(async () => full[0].props.onPress());
    assert.deepEqual(runtime, []);
    assert.deepEqual(future, []);
    assert.deepEqual(runtime, []);
    await act(async () =>
      renderer.update(React.createElement(Row, { ...props, runtimeAccess: { runId: 'run', level: 'auto_approve' } }))
    );
    await act(async () => withLabel(defaultT('composer.query.access.full_access'))[0].props.onPress());
    assert.deepEqual(runtime, ['full_access']);
    assert.deepEqual(future, []);
  } finally {
    await act(async () => renderer.unmount());
  }
});

test('empty/failed model catalogs stay openable and retryable without replacing a missing selected model', async () => {
  const Row = loadRow();
  let refreshes = 0;
  const selected: unknown[] = [];
  const props = {
    skillsEnabled: false,
    skillsDisabled: false,
    selectedSkills: [],
    onLoadSkills() {},
    onToggleSkills() {},
    accessLevelEnabled: false,
    accessLevel: 'default',
    agentKey: 'agent',
    modelEnabled: true,
    modelDisabled: false,
    modelOptionsLoading: false,
    modelOptionsSnapshot: { models: [], reasoningEfforts: [], serviceTiers: [] },
    modelOptionsError: 'catalog offline',
    modelOverride: { key: 'missing-selected-model' },
    onRefreshModels() {
      refreshes++;
    },
    onAccessLevelChange() {},
    onModelOverrideChange(value: unknown) {
      selected.push(value);
    }
  };
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(Row, props), {
      createNodeMock: () => ({ measureInWindow: (fn: any) => fn(16, 600, 368, 48) })
    });
  });
  const text = (label: string) => renderer.root.findAllByType('Text').find((item) => item.props.children === label);
  try {
    const chip = renderer.root.findAllByType('Pressable').find((item) => item.props.accessibilityLabel === 'missing-selected-model')!;
    assert.equal(chip.props.disabled, false);
    await act(async () => chip.props.onPress());
    assert.ok(text('catalog offline'));
    assert.ok(text(defaultT('composer.query.model.selectedUnavailable')));
    await act(async () => text(defaultT('composer.query.model.refresh'))!.parent!.props.onPress());
    assert.equal(refreshes, 1);
    assert.deepEqual(selected, []);
    await act(async () => renderer.update(React.createElement(Row, { ...props, modelDisabled: true })));
    assert.equal(renderer.root.findAllByType('Modal').length, 0);
  } finally {
    await act(async () => renderer.unmount());
  }
});

test('model settings stage one draft, cancel discards it, and failed apply retains it for retry', async () => {
  const Row = loadRow(), saves: unknown[] = [];
  let succeed = false;
  const props = {
    skillsEnabled: false, skillsDisabled: false, selectedSkills: [], onLoadSkills() {}, onToggleSkills() {},
    accessLevelEnabled: false, accessLevel: 'default', agentKey: 'agent', modelEnabled: true, modelDisabled: false,
    modelOptionsLoading: false,
    modelOptionsSnapshot: { models: [{ key:'old', name:'Old', serviceTiers:['STANDARD'] }, { key:'new', name:'New', serviceTiers:['STANDARD'] }], reasoningEfforts:[], serviceTiers:[] },
    modelOverride: { key:'old', serviceTier:'STANDARD' }, onRefreshModels() {}, onAccessLevelChange() {},
    onModelOverrideChange: async (value: unknown) => { saves.push(value); return succeed; }
  };
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(React.createElement(Row, props), { createNodeMock: () => ({ measureInWindow: (fn: any) => fn(16,600,368,48) }) }); });
  const press = async (label: string, last = false) => {
    const items = renderer.root.findAllByType('Pressable').filter(item => item.findAllByType('Text').some(text => text.props.children === label));
    await act(async () => { await items[last ? items.length - 1 : 0].props.onPress(); });
  };
  try {
    await press('Old'); await press('Old', true); await press('New');
    assert.deepEqual(saves, []);
    await press(defaultT('common.cancel'));
    assert.equal(renderer.root.findAllByType('Modal').length, 0);
    await press('Old'); await press('Old', true); await press('New');
    await press(defaultT('common.apply'));
    assert.equal(renderer.root.findAllByType('Modal').length, 1);
    assert.deepEqual(saves, [{ key:'new', serviceTier:'STANDARD' }]);
    succeed = true;
    await press(defaultT('common.apply'));
    assert.deepEqual(saves[1], saves[0]);
    assert.equal(renderer.root.findAllByType('Modal').length, 0);
  } finally { await act(async () => renderer.unmount()); }
});
