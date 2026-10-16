import * as contextReference from '../../src/features/chatPersistence/chatContextReference.ts';
import * as resourceUrl from '../../src/core/api/resourceUrl.ts';
import * as chatSource from '../../src/features/chatPersistence/chatSource.ts';
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
function loadSelectionSheet(platform: 'android' | 'ios' = 'android') {
  return load('components/ChatSelectionSheet.tsx', {
    'react-native': {
      KeyboardAvoidingView: 'KeyboardAvoidingView',
      Modal: 'Modal',
      Platform: { OS: platform },
      Pressable: 'Pressable',
      ScrollView: 'ScrollView',
      Text: 'Text',
      TextInput: 'TextInput',
      View: 'View'
    },
    'react-native-safe-area-context': {
      SafeAreaView: 'SafeAreaView',
      useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 })
    },
    '../../../shared/components/ScreenHeader': {
      ScreenHeader: ({ leftActions, rightActions }: any) =>
        React.createElement('Header', null, ...leftActions, ...rightActions)
    },
    '../../../shared/i18n': { useT: () => defaultT },
    '../chatSelectionReference.ts': selection
  }).ChatSelectionSheet;
}

test('native quote sheet requires an explicit range, captures only that text and clears it on attempted source edits', async () => {
  const Sheet = loadSelectionSheet();
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
    await act(async () => source.props.onSelectionChange({ nativeEvent: { selection: { start: 7, end: 7 } } }));
    await act(async () => source.props.onChangeText(source.props.value));
    assert.equal(save().props.disabled, false);
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
    assert.equal(save().props.disabled, true);
    await act(async () =>
      renderer.root
        .findAllByType('TextInput')[0]
        .props.onSelectionChange({ nativeEvent: { selection: { start: 40_000, end: 40_006 } } })
    );
    assert.ok(renderer.root.findAllByType('Text').some((node) => node.props.children === '跨窗口😀b'));
    await act(async () =>
      renderer.root
        .findAllByType('TextInput')[0]
        .props.onSelectionChange({ nativeEvent: { selection: { start: 0, end: 50_001 } } })
    );
    assert.equal(save().props.disabled, true);
  } finally {
    await act(async () => renderer.unmount());
  }
});

for (const platform of ['android', 'ios'] as const) {
  test(`${platform} quote draft survives repeated focus changes and failed saves, replaces valid ranges and resets on scope changes`, async () => {
    const Sheet = loadSelectionSheet(platform);
    const text = 'before 中😀文 after';
    const saved: Array<[string, string, 'message' | 'code']> = [];
    const restored: unknown[] = [];
    let acceptSave = false;
    let closes = 0;
    const props = {
      text,
      selectRange: true,
      onSave: (...args: [string, string, 'message' | 'code']) => {
        saved.push(args);
        return acceptSave;
      },
      onClose: () => closes++
    };
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(React.createElement(Sheet, { ...props, key: 'a:next' }), {
        createNodeMock: () => ({ setNativeProps: (value: unknown) => restored.push(value) })
      });
    });
    const source = () => renderer.root.findAllByType('TextInput')[0];
    const comment = () => renderer.root.findAllByType('TextInput')[1];
    const save = () =>
      renderer.root
        .findAllByType('Pressable')
        .find((node) => node.findAllByType('Text').some((t) => t.props.children === defaultT('selection.save')))!;
    const select = async (start: number, end: number) => {
      await act(async () => source().props.onSelectionChange({ nativeEvent: { selection: { start, end } } }));
    };
    try {
      const avoider = renderer.root.findByType('KeyboardAvoidingView');
      assert.equal(avoider.props.behavior, 'padding');
      assert.equal(avoider.props.keyboardVerticalOffset, platform === 'ios' ? 24 : 0);
      assert.equal(comment().props.scrollEnabled, true);
      assert.equal(save().props.disabled, true);
      await select(7, 11);
      await act(async () => comment().props.onChangeText('?'));
      for (const caret of [7, 12, 0]) {
        await select(caret, caret);
        await act(async () => source().props.onChangeText(text));
        await act(async () => comment().props.onChangeText(`${comment().props.value}!`));
        assert.equal(save().props.disabled, false);
      }
      assert.equal(restored.length, 0);
      await act(async () => save().props.onPress());
      assert.deepEqual(saved, [['中😀文', '?!!!', 'message']]);
      assert.equal(closes, 0);
      assert.equal(save().props.disabled, false);
      await select(0, 6);
      await select(0, 9); // A nonempty range ending within an emoji must invalidate the old quote.
      assert.equal(save().props.disabled, true);
      await select(0, text.length + 1);
      assert.equal(save().props.disabled, true);
      await select(6, 7);
      assert.equal(save().props.disabled, true);
      await select(0, 6);
      acceptSave = true;
      await act(async () => save().props.onPress());
      assert.deepEqual(saved[1], ['before', '?!!!', 'message']);
      assert.equal(closes, 1);
      await act(async () => source().props.onChangeText('changed source'));
      assert.deepEqual(restored, [{ text }]);
      assert.equal(save().props.disabled, true);
      await select(7, 11);
      await act(async () => renderer.update(React.createElement(Sheet, { ...props, key: 'b:next' })));
      assert.equal(save().props.disabled, true);
      assert.equal(comment().props.value, '');
    } finally {
      await act(async () => renderer.unmount());
    }
  });
}

test('existing quote annotations remain editable and history references stay read-only', async () => {
  const Sheet = loadSelectionSheet();
  const saved: Array<[string, string, 'message' | 'code']> = [];
  let renderer!: ReactTestRenderer;
  const props = { text: 'quoted text', annotation: 'original', sourceKind: 'code', onClose: () => {} };
  await act(async () => {
    renderer = create(
      React.createElement(Sheet, {
        ...props,
        key: 'draft',
        onSave: (...args: [string, string, 'message' | 'code']) => {
          saved.push(args);
          return true;
        }
      })
    );
  });
  try {
    await act(async () => renderer.root.findByType('TextInput').props.onChangeText('updated'));
    const save = renderer.root
      .findAllByType('Pressable')
      .find((node) => node.findAllByType('Text').some((t) => t.props.children === defaultT('selection.save')))!;
    assert.equal(save.props.disabled, false);
    await act(async () => save.props.onPress());
    assert.deepEqual(saved, [['quoted text', 'updated', 'code']]);
    await act(async () => renderer.update(React.createElement(Sheet, { ...props, key: 'history' })));
    assert.equal(renderer.root.findAllByType('TextInput').length, 0);
    assert.equal(renderer.root.findAllByType('Pressable').length, 1);
  } finally {
    await act(async () => renderer.unmount());
  }
});
test('draft quote numbering stays monotonic, restoration preserves multiple quotes and chat/run changes clear unsent state', async () => {
  const { useChatComposerAttachments: useAttachments } = load('useChatComposerAttachments.ts', {
    'expo-document-picker': {},
    'expo-image-picker': {},
    '../../core/api/services/uploadApi': {},
    '../../core/api/resourceUrl': resourceUrl,
    './chatSource': chatSource,
    './cacheScope': { getChatCacheScopeId: () => 'test' },
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
