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
      useWindowDimensions: () => ({ width: 400, height: 800 }),
      Keyboard: { isVisible: () => false, dismiss: () => {}, addListener: () => ({ remove: () => {} }) }
    },
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
test('production access menu disables pending run choices while future defaults stay independent', async () => {
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
    await act(async () => withLabel(defaultT('composer.runtimeAccess.sending'))[0].props.onPress());
    const full = withLabel(defaultT('composer.query.access.full_access'));
    assert.equal(full.length, 2);
    assert.equal(full[0].props.disabled, true);
    assert.equal(full[1].props.disabled, false);
    await act(async () => full[0].props.onPress());
    assert.deepEqual(runtime, []);
    await act(async () => full[1].props.onPress());
    assert.deepEqual(future, ['full_access']);
    assert.deepEqual(runtime, []);
    await act(async () =>
      renderer.update(React.createElement(Row, { ...props, runtimeAccess: { runId: 'run', level: 'auto_approve' } }))
    );
    await act(async () =>
      withLabel(
        `${defaultT('composer.runtimeAccess.current')} · ${defaultT('composer.query.access.auto_approve')}`
      )[0].props.onPress()
    );
    await act(async () => withLabel(defaultT('composer.query.access.full_access'))[0].props.onPress());
    assert.deepEqual(runtime, ['full_access']);
    assert.deepEqual(future, ['full_access']);
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
    const chip = renderer.root.findAllByType('Pressable')[0];
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
