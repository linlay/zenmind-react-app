import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { transformSync } from '@babel/core';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import * as skills from '../../src/core/api/services/chatSkillsProtocol.ts';
import { defaultT } from '../../src/shared/i18n/translate.ts';
import { cn } from '../../src/shared/visual/className.ts';
const require = createRequire(import.meta.url);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const catalog = skills.normalizeChatSkills(
  {
    skills: [
      { id: 'office/pdf', displayName: 'PDF', configured: false },
      { id: 'OFFICE/PDF', name: 'duplicate' },
      { id: 'office/doc', name: 'Document', configured: true },
      { id: 'solo', name: 'Solo' }
    ],
    pinned: ['solo', 'office'],
    packages: [
      {
        id: 'office',
        name: 'Office',
        skills: [{ id: 'office/pdf' }, { id: 'office/doc' }, { id: 'missing' }, { id: 'OFFICE/PDF' }],
        missingSkillIds: ['missing'],
        status: 'incomplete'
      }
    ]
  },
  [{ id: 'custom', displayName: 'Custom' }, { id: 'OFFICE/PDF' }]
);

test('catalog merges configured skills, preserves full package member IDs and removes duplicates', () => {
  assert.equal(catalog.skills.length, 4);
  assert.equal(catalog.skills[0].id, 'solo');
  assert.equal(catalog.skills.find((s) => s.id === 'office/pdf')?.configured, true);
  assert.deepEqual(catalog.packages[0].members, ['office/pdf', 'office/doc']);
  assert.equal(catalog.packages[0].incomplete, true);
  assert.deepEqual(skills.resolveSkillIds([' OFFICE/PDF ', 'office/pdf', 'custom'], catalog), ['office/pdf', 'custom']);
  assert.throws(() => skills.resolveSkillIds(['missing'], catalog), /no longer available/);
});
test('package and individual selections dedupe, preserve other selections and use IDs rather than labels', () => {
  const selected = skills.toggleSkills(['solo', 'office/pdf'], catalog.packages[0].members);
  assert.deepEqual(selected, ['solo', 'office/pdf', 'office/doc']);
  assert.deepEqual(skills.toggleSkills(selected, catalog.packages[0].members), ['solo']);
  assert.deepEqual(skills.normalizeSkillIds([' PDF ', 'pdf', 'office/pdf', ' ']), ['PDF', 'office/pdf']);
});

test('production virtual skill menu searches full IDs, expands packages and sends concrete selections', async () => {
  const file = new URL('../../src/features/chatPersistence/components/ChatComposerSkillsMenu.tsx', import.meta.url);
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
      TextInput: 'TextInput',
      FlatList: 'FlatList'
    },
    '../../../core/api/services/chatSkillsProtocol': skills,
    '../../../shared/i18n': { useT: () => defaultT },
    '../../../shared/icons/AppIcon': { AppIcon: 'AppIcon' },
    '../../../shared/visual/className': { cn }
  };
  new Function('require', 'module', 'exports', transformed!.code!)(
    (key: string) => deps[key] ?? require(key),
    module,
    module.exports
  );
  const Menu = (module.exports as any).ChatComposerSkillsMenu;
  const selections: string[][] = [];
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      React.createElement(Menu, {
        catalog,
        selected: [],
        loading: false,
        error: '',
        onRetry: () => {},
        onToggle: (ids: string[]) => selections.push(ids)
      })
    );
  });
  try {
    let list = renderer.root.findByType('FlatList');
    assert.equal(list.props.initialNumToRender, 8);
    assert.equal(list.props.data[0].skill.id, 'solo');
    assert.equal(list.props.data.filter((row: any) => row.skill?.id === 'office/pdf').length, 0);
    let row: ReactTestRenderer;
    await act(async () => {
      row = create(list.props.renderItem({ item: list.props.data.find((row: any) => row.pkg) }));
    });
    const checkbox = row!.root.findAllByType('Pressable')[0];
    await act(async () => checkbox.props.onPress());
    assert.deepEqual(selections, [['office/pdf', 'office/doc']]);
    await act(async () => row!.unmount());
    await act(async () => renderer.root.findByType('TextInput').props.onChangeText('office/pdf'));
    list = renderer.root.findByType('FlatList');
    assert.equal(list.props.data.length, 2);
    assert.equal(list.props.data[1].skill.id, 'office/pdf');
  } finally {
    await act(async () => renderer.unmount());
  }
});

test('production option row keeps skill search open on keyboard show and closes it on Agent change', async () => {
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
  const events = new Map<string, () => void>();
  let dismissed = 0;
  const module = { exports: {} };
  const deps: Record<string, unknown> = {
    'react-native': {
      View: 'View',
      Text: 'Text',
      Pressable: 'Pressable',
      Modal: 'Modal',
      ScrollView: 'ScrollView',
      useWindowDimensions: () => ({ width: 400, height: 800 }),
      Keyboard: {
        isVisible: () => false,
        dismiss: () => {
          dismissed++;
        },
        addListener: (name: string, fn: () => void) => {
          events.set(name, fn);
          return { remove: () => events.delete(name) };
        }
      }
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
  const Row = (module.exports as any).ChatComposerOptionRow;
  const props = {
    skillsEnabled: true,
    skillsDisabled: false,
    skillsCatalog: catalog,
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
    onAccessLevelChange: () => {},
    onModelOverrideChange: () => {}
  };
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(Row, props), {
      createNodeMock: () => ({ measureInWindow: (fn: any) => fn(16, 600, 368, 48) })
    });
  });
  try {
    const chip = renderer.root
      .findAllByType('Pressable')
      .find((item) =>
        item.findAllByType('Text').some((text) => text.props.children === defaultT('composer.skills.title'))
      )!;
    assert.equal(chip.props.disabled, false);
    await act(async () => chip.props.onPress());
    assert.equal(renderer.root.findAllByType('SkillsMenu').length, 1);
    await act(async () => events.get('keyboardDidShow')!());
    assert.equal(renderer.root.findAllByType('SkillsMenu').length, 1);
    await act(async () => renderer.update(React.createElement(Row, { ...props, agentKey: 'other' })));
    assert.equal(renderer.root.findAllByType('SkillsMenu').length, 0);
    assert.equal(dismissed, 1);
  } finally {
    await act(async () => renderer.unmount());
  }
});
