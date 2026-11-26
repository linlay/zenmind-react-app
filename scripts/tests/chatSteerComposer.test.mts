import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const source = readFileSync(
  new URL('../../src/features/chatPersistence/components/ChatDetailComposerCard.tsx', import.meta.url),
  'utf8'
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
}).outputText;
const deps: Record<string, unknown> = {
  'react-native': { Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View' },
  '../../../core/api/services/chatSkillsProtocol': { skillIdentity: (id: string) => id },
  '../../../shared/i18n': { useT: () => (key: string) => key },
  '../../../shared/icons/AppIcon': { AppIcon: 'AppIcon' },
  './Composer': { Composer: 'Composer' },
  './ChatComposerOptionRow': { ChatComposerOptionRow: 'Options' },
  './ChatAttachmentStrip': { ChatAttachmentStrip: 'Attachments' },
  './ChatPastedTextEditor': { ChatPastedTextEditor: 'Editor' }
};
const exports: Record<string, React.ComponentType<Record<string, unknown>>> = {};
new Function('require', 'exports', compiled)((key: string) => deps[key] ?? require(key), exports);

test('composer queues input; only each queued row exposes manual guide and local cancel', async () => {
  const actions: string[] = [];
  const base = {
    draft: { input: 'new input', pastes: [] },
    attachments: [],
    errorText: '',
    steerAvailable: true,
    steerRunId: 'run',
    primaryAction: 'send',
    composerOptions: {
      settingsKey: 'chat',
      selectedSkills: [],
      interaction: { attachment: { skills: true } },
      inputReady: true
    },
    onQueueSteer: () => actions.push('queue'),
    onSteer: (id: string) => actions.push(`guide:${id}`),
    onRestoreSteer: (id: string) => actions.push(`restore:${id}`),
    onSubmit: () => actions.push('query')
  };
  const record = {
    steerId: 'selected',
    runId: 'run',
    message: 'previous input',
    attachments: [],
    phase: 'queued',
    runEnded: false
  };
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(exports.ChatDetailComposerCard, { ...base, pendingSteers: [record] }));
  });
  const presses = () => renderer.root.findAllByType('Pressable');
  await act(async () => {
    renderer.root.findByType('Composer').props.onSubmit();
  });
  assert.deepEqual(actions, ['queue']);
  const guide = presses().find((node) => node.props.accessibilityLabel === 'composer.steer')!;
  assert.equal(guide.props.disabled, false);
  await act(async () => {
    guide.props.onPress();
  });
  const cancel = presses().find((node) =>
    node.findAllByType('Text').some((text) => text.props.children === 'common.cancel')
  )!;
  await act(async () => {
    cancel.props.onPress();
  });
  assert.deepEqual(actions, ['queue', 'guide:selected', 'restore:selected']);
  for (const phase of ['sending', 'accepted', 'unknown']) {
    await act(async () => {
      renderer.update(
        React.createElement(exports.ChatDetailComposerCard, { ...base, pendingSteers: [{ ...record, phase }] })
      );
    });
    assert.equal(presses().length, 0, `${phase} must not expose guide or cancel as an unsent message`);
  }
  for (const steerRunId of ['', 'another-run']) {
    await act(async () => {
      renderer.update(
        React.createElement(exports.ChatDetailComposerCard, { ...base, steerRunId, pendingSteers: [record] })
      );
    });
    assert.equal(presses().find((node) => node.props.accessibilityLabel === 'composer.steer')!.props.disabled, true);
    assert.equal(presses().length, 2, 'cancel remains available when target cannot accept guidance');
  }
  await act(async () => {
    renderer.update(
      React.createElement(exports.ChatDetailComposerCard, { ...base, pendingSteers: [{ ...record, runEnded: true }] })
    );
  });
  assert.equal(presses().length, 2, 'ended queued item keeps one cancel action, without duplicate recovery');
  assert.equal(presses().find((node) => node.props.accessibilityLabel === 'composer.steer')!.props.disabled, true);
  await act(async () => {
    renderer.unmount();
  });
});
