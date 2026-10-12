import * as contextReference from '../../src/features/chatPersistence/chatContextReference.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { transformSync } from '@babel/core';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { defaultT } from '../../src/shared/i18n/translate.ts';
import * as models from '../../src/features/chatPersistence/chatAttachmentModels.ts';
import * as selection from '../../src/features/chatPersistence/chatSelectionReference.ts';
const require = createRequire(import.meta.url);
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
function load(file: string, deps: Record<string, unknown>) {
  const url = new URL(`../../src/features/chatPersistence/${file}`, import.meta.url);
  const code = transformSync(readFileSync(url, 'utf8'), {
    filename: url.pathname,
    configFile: false,
    babelrc: false,
    presets: [['@babel/preset-typescript', { allExtensions: true, isTSX: true }]],
    plugins: [
      ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }],
      '@babel/plugin-transform-modules-commonjs'
    ]
  })!.code!;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (key: string) => deps[key] ?? require(key),
    module,
    module.exports
  );
  return module.exports as any;
}
test('native quote sheet requires an explicit range, captures only that text and clears it on attempted source edits', async () => {
  const { ChatSelectionSheet: Sheet } = load('components/ChatSelectionSheet.tsx', {
    'react-native': {
      KeyboardAvoidingView: 'KeyboardAvoidingView',
      Modal: 'Modal',
      Platform: { OS: 'android' },
      Pressable: 'Pressable',
      ScrollView: 'ScrollView',
      Text: 'Text',
      TextInput: 'TextInput',
      View: 'View'
    },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '../../../shared/components/ScreenHeader': {
      ScreenHeader: ({ leftActions, rightActions }: any) =>
        React.createElement('Header', null, ...leftActions, ...rightActions)
    },
    '../../../shared/i18n': { useT: () => defaultT },
    '../chatSelectionReference.ts': selection
  });
  const saved: any[] = [];
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      React.createElement(Sheet, {
        text: 'before 中😀文 after',
        selectRange: true,
        onSave: (...args: any[]) => {
          saved.push(args);
          return true;
        },
        onClose: () => {}
      }),
      { createNodeMock: () => ({ setNativeProps: () => {} }) }
    );
  });
  try {
    const save = () =>
      renderer.root
        .findAllByType('Pressable')
        .find((node) => node.findAllByType('Text').some((t) => t.props.children === defaultT('selection.save')))!;
    assert.equal(save().props.disabled, true);
    const source = renderer.root.findAllByType('TextInput')[0];
    assert.equal(source.props.showSoftInputOnFocus, false);
    await act(async () => source.props.onSelectionChange({ nativeEvent: { selection: { start: 7, end: 11 } } }));
    await act(async () => renderer.root.findAllByType('TextInput')[1].props.onChangeText('comment'));
    await act(async () => save().props.onPress());
    assert.deepEqual(saved, [['中😀文', 'comment', 'message']]);
    await act(async () => source.props.onChangeText('changed source'));
    assert.equal(save().props.disabled, true);
    await act(async () => renderer.unmount());
    const longText = 'a'.repeat(90_000) + '跨窗口😀' + 'b'.repeat(70_000);
    await act(async () => {
      renderer = create(
        React.createElement(Sheet, { text: longText, selectRange: true, onSave: () => true, onClose: () => {} })
      );
    });
    assert.ok(renderer.root.findAllByType('TextInput')[0].props.value.length <= 100_000);
    const next = renderer.root
      .findAllByType('Pressable')
      .find((node) => node.findAllByType('Text').some((t) => t.props.children === defaultT('selection.next')))!;
    await act(async () => next.props.onPress());
    const window = renderer.root.findAllByType('TextInput')[0].props.value;
    assert.equal(window, longText.slice(50_000, 150_000));
    await act(async () =>
      renderer.root
        .findAllByType('TextInput')[0]
        .props.onSelectionChange({ nativeEvent: { selection: { start: 40_000, end: 40_006 } } })
    );
    assert.ok(renderer.root.findAllByType('Text').some((node) => node.props.children === '跨窗口😀b'));
  } finally {
    await act(async () => renderer.unmount());
  }
});
test('draft quote numbering stays monotonic, restoration preserves multiple quotes and chat/run changes clear unsent state', async () => {
  const { useChatComposerAttachments: useAttachments } = load('useChatComposerAttachments.ts', {
    'expo-document-picker': {},
    'expo-image-picker': {},
    '../../core/api/services/uploadApi': {},
    '../../shared/i18n': { useT: () => defaultT },
    './chatAttachmentModels': models,
    './chatContextReference.ts': contextReference,
    './chatSelectionReference.ts': selection
  });
  let snapshot: any, renderer!: ReactTestRenderer;
  function Harness(props: any) {
    snapshot = useAttachments(props);
    return null;
  }
  await act(async () => {
    renderer = create(
      React.createElement(Harness, { conversationId: 'a', selectionScope: 'run-a', selectionStartIndex: 4 })
    );
  });
  try {
    await act(async () => {
      snapshot.addSelection('first', 'a', 'message');
      snapshot.addSelection('second', 'b', 'code');
    });
    assert.deepEqual(
      snapshot.attachments.map((a: any) => a.references[0].annotationIndex),
      [4, 5]
    );
    const first = snapshot.attachments[0],
      second = snapshot.attachments[1];
    await act(async () => snapshot.handleRemoveAttachment(first.attachmentId));
    await act(async () => snapshot.addSelection('third', '', 'message'));
    assert.equal(snapshot.attachments[1].references[0].annotationIndex, 6);
    await act(async () => snapshot.clearAttachments());
    await act(async () => snapshot.restoreAttachments([first, second]));
    assert.deepEqual(
      snapshot.attachments.map((a: any) => a.references[0].annotation),
      ['a', 'b']
    );
    await act(async () => snapshot.updateSelectionAnnotation(first.attachmentId, 'revised'));
    assert.equal(snapshot.attachments[0].references[0].annotation, 'revised');
    await act(async () =>
      renderer.update(React.createElement(Harness, { conversationId: 'a', selectionScope: 'next' }))
    );
    assert.equal(snapshot.attachments.length, 0);
    await act(async () => snapshot.addSelection('next', '', 'message'));
    assert.equal(snapshot.attachments[0].references[0].annotationIndex, 1);
    await act(async () =>
      renderer.update(React.createElement(Harness, { conversationId: 'b', selectionScope: 'next' }))
    );
    assert.equal(snapshot.attachments.length, 0);
    await act(async () => snapshot.addSelection('other', '', 'message'));
    assert.equal(snapshot.attachments[0].conversationId, 'b');
    assert.equal(snapshot.attachments[0].references[0].annotationIndex, 1);
    await act(async () => {
      snapshot.addContextReference({ type: 'chat', id: 'first', name: 'Same' });
      snapshot.addContextReference({ type: 'chat', id: 'second', name: 'Same' });
      snapshot.addContextReference({ type: 'chat', id: 'first', name: 'Same' });
    });
    assert.equal(snapshot.attachments.length, 3);
    assert.deepEqual(
      snapshot.attachments.filter((item: any) => item.kind === 'chat').map((item: any) => item.references[0].id),
      ['first', 'second']
    );
    const contexts = snapshot.attachments.filter((item: any) => item.kind === 'chat');
    await act(async () => snapshot.clearAttachments());
    await act(async () => snapshot.restoreAttachments(contexts));
    assert.equal(snapshot.attachments.length, 2);
  } finally {
    await act(async () => renderer.unmount());
  }
});

test('native context picker preserves same-title IDs, loads pages on demand and discards a closed request', async () => {
  let resolve!: (value: any) => void,
    calls = 0;
  const { ChatContextReferencePicker: Picker } = load('components/ChatContextReferencePicker.tsx', {
    'react-native': {
      ActivityIndicator: 'Spinner',
      FlatList: 'FlatList',
      Modal: 'Modal',
      Pressable: 'Pressable',
      Text: 'Text',
      TextInput: 'TextInput',
      View: 'View'
    },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '../../../shared/components/ScreenHeader': { ScreenHeader: 'Header' },
    '../../../shared/i18n': { useT: () => defaultT },
    '../../chatRealtime/chatSyncService': {
      chatSyncService: {
        listReferenceChats: async () => {
          calls++;
          return new Promise((done) => (resolve = done));
        }
      }
    }
  });
  const selected: any[] = [];
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      React.createElement(Picker, {
        conversationId: 'a',
        onSelect: (item: any) => {
          selected.push(item);
          return true;
        },
        onClose: () => {}
      })
    );
  });
  await act(async () =>
    resolve({
      items: [
        { id: 'first', name: 'Same' },
        { id: 'second', name: 'Same' }
      ],
      nextCursor: 'older'
    })
  );
  const list = renderer.root.findByType('FlatList');
  assert.equal(list.props.data.length, 2);
  await act(async () => list.props.renderItem({ item: list.props.data[1] }).props.onPress());
  assert.equal(selected[0].id, 'second');
  assert.equal(calls, 1);
  await act(async () => renderer.unmount());
  await act(async () => {
    renderer = create(React.createElement(Picker, { conversationId: 'b', onSelect: () => true, onClose: () => {} }));
  });
  await act(async () => renderer.unmount());
  await act(async () => resolve({ items: [{ id: 'stale', name: 'Stale' }], nextCursor: null }));
  assert.equal(calls, 2);
});
