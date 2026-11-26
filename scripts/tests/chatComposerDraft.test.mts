import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendComposerDraft,
  applyComposerTextEdit,
  createComposerDraft,
  editComposerPaste,
  serializeComposerDraft,
  shouldCollapseComposerPaste,
  type ChatComposerDraft,
  type ComposerTextEdit
} from '../../src/features/chatPersistence/chatComposerDraft.ts';

function edit(
  draft: ChatComposerDraft,
  start: number,
  end: number,
  replacement: string,
  paste?: { id: string; text: string }
) {
  const event: ComposerTextEdit = {
    text: draft.input.slice(0, start) + replacement + draft.input.slice(end),
    eventCount: 1,
    start,
    end,
    replacement,
    selectionStart: start + replacement.length,
    selectionEnd: start + replacement.length,
    ...(paste ? { pastedText: paste.text } : {})
  };
  return applyComposerTextEdit(draft, event, paste?.id || 'unused');
}

test('system paste threshold counts UTF-16 and CRLF/CR/LF lines; typing and IME never fold by size', () => {
  assert.equal(shouldCollapseComposerPaste('a'.repeat(1999)), false);
  assert.equal(shouldCollapseComposerPaste('a'.repeat(2000)), true);
  for (const newline of ['\r\n', '\r', '\n']) {
    assert.equal(shouldCollapseComposerPaste(Array(19).fill('行').join(newline)), false);
    assert.equal(shouldCollapseComposerPaste(Array(20).fill('行').join(newline)), true);
  }
  assert.equal(shouldCollapseComposerPaste(' \n'.repeat(2000)), false);
  for (const text of ['a'.repeat(3000), '中文组合输入'.repeat(600), '🙂'.repeat(1000)]) {
    const typed = edit(createComposerDraft(), 0, 0, text);
    assert.equal(typed.pastes.length, 0);
    assert.equal(serializeComposerDraft(typed), text);
  }
});

test('middle and repeated pastes preserve insertion order, whitespace and full text', () => {
  let draft = createComposerDraft('前 / 后');
  draft = edit(draft, 2, 4, '', { id: 'first', text: '  FIRST\r\n' });
  draft = edit(draft, 2, 2, '', { id: 'second', text: 'SECOND\n ' });
  assert.equal(draft.input, '前 后');
  assert.equal(serializeComposerDraft(draft), '前   FIRST\r\nSECOND\n 后');
  draft = edit(draft, 2, 2, 'new');
  assert.equal(serializeComposerDraft(draft), '前   FIRST\r\nSECOND\n new后');
  draft = edit(draft, 0, 1, '开头');
  assert.equal(serializeComposerDraft(draft), '开头   FIRST\r\nSECOND\n new后');
});

test('exact native ranges disambiguate repeated characters before and after a card', () => {
  const draft = edit(createComposerDraft('aaaa'), 2, 2, '', { id: 'card', text: 'LONG' });
  assert.equal(serializeComposerDraft(edit(draft, 1, 1, 'a')), 'aaaLONGaa');
  assert.equal(serializeComposerDraft(edit(draft, 3, 3, 'a')), 'aaLONGaaa');
  assert.equal(serializeComposerDraft(edit(draft, 0, 2, 'aaa')), 'aaaLONGaa');
  assert.equal(serializeComposerDraft(edit(draft, 2, 3, '')), 'aaLONGa');
  assert.equal(serializeComposerDraft(edit(draft, 0, 4, 'replacement')), 'LONGreplacement');
});

test('UTF-16 offsets preserve emoji, Chinese IME replacements and card positions', () => {
  const draft = edit(createComposerDraft('🙂ni后'), 4, 4, '', { id: 'card', text: '\n全文🙂\n' });
  const composed = edit(draft, 2, 4, '你');
  assert.equal(serializeComposerDraft(composed), '🙂你\n全文🙂\n后');
  assert.equal(composed.pastes[0].offset, 3);
});

test('editing a card keeps it folded below threshold and empty save removes only that card', () => {
  let draft = edit(createComposerDraft('startend'), 5, 5, '', { id: 'a', text: 'A'.repeat(2000) });
  draft = edit(draft, 5, 5, '', { id: 'b', text: 'B'.repeat(2000) });
  const snapshot = serializeComposerDraft(draft);
  const edited = editComposerPaste(draft, 'a', 'short');
  assert.equal(edited.pastes.length, 2);
  assert.equal(serializeComposerDraft(edited), `startshort${'B'.repeat(2000)}end`);
  const removed = editComposerPaste(edited, 'a', '');
  assert.deepEqual(
    removed.pastes.map((paste) => paste.id),
    ['b']
  );
  assert.equal(serializeComposerDraft(draft), snapshot);
  assert.equal(editComposerPaste(draft, 'a', ' ').pastes.length, 2);
});

test('failed query snapshot restores cards without overwriting newer text or sharing mutable content', () => {
  const submitted = edit(createComposerDraft('old'), 3, 3, '', { id: 'old', text: ' old full text ' });
  const later = edit(createComposerDraft('new'), 0, 0, '', { id: 'new', text: 'new full text ' });
  const restored = appendComposerDraft(later, submitted);
  assert.equal(serializeComposerDraft(restored), 'new full text new\n\nold old full text ');
  assert.deepEqual(
    restored.pastes.map((paste) => paste.id),
    ['new', 'old']
  );
  assert.equal(
    serializeComposerDraft(editComposerPaste(restored, 'old', 'changed')),
    'new full text new\n\noldchanged'
  );
  assert.equal(serializeComposerDraft(submitted), 'old old full text ');
  assert.deepEqual(appendComposerDraft(createComposerDraft(), submitted), submitted);
});

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { act, create } from 'react-test-renderer';
const require = createRequire(import.meta.url);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

test('text editor uses a temporary full copy, cancel leaves original and save accepts short or empty text', async () => {
  const source = readFileSync(
    new URL('../../src/features/chatPersistence/components/ChatPastedTextEditor.tsx', import.meta.url),
    'utf8'
  );
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  const exports: Record<string, any> = {};
  const deps: Record<string, unknown> = {
    'react-native': {
      KeyboardAvoidingView: 'KeyboardAvoidingView',
      Modal: 'Modal',
      Platform: { OS: 'ios' },
      Pressable: 'Pressable',
      Text: 'Text',
      TextInput: 'TextInput'
    },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 20 }) },
    '../../../shared/components/ScreenHeader': {
      ScreenHeader: (props: any) => React.createElement('Header', {}, ...props.leftActions, ...props.rightActions)
    },
    '../../../shared/i18n': { useT: () => (key: string) => key }
  };
  new Function('require', 'exports', code)((key: string) => deps[key] ?? require(key), exports);
  const original = '  ' + '全文\n'.repeat(3000);
  for (const action of ['cancel', 'short', 'empty']) {
    const saved: string[] = [];
    let closed = 0;
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        React.createElement(exports.ChatPastedTextEditor, {
          text: original,
          onSave: (text: string) => saved.push(text),
          onClose: () => closed++,
          onDismiss() {}
        })
      );
    });
    try {
      assert.equal(renderer.root.findByType('TextInput').props.value, original);
      assert.equal(renderer.root.findByType('TextInput').props.maxLength, undefined);
      await act(async () =>
        renderer.root.findByType('TextInput').props.onChangeText(action === 'empty' ? '' : 'short')
      );
      const button = renderer.root.findAllByType('Pressable')[action === 'cancel' ? 0 : 1];
      await act(async () => button.props.onPress());
      assert.deepEqual(saved, action === 'cancel' ? [] : [action === 'empty' ? '' : 'short']);
      assert.equal(closed, action === 'cancel' ? 1 : 0);
    } finally {
      await act(async () => renderer.unmount());
    }
  }
});
