import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';
import * as bridge from '../../src/shared/components/conversationPreview/runtimeBridge.ts';
import * as formFrame from '../../src/features/chatPersistence/components/awaiting/awaitingFormFrame.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  readFileSync(
    new URL('../../src/features/chatPersistence/components/awaiting/useAwaitingFormFrame.ts', import.meta.url),
    'utf8'
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
).outputText;

test('Form init/update/collect resolves only a pending reply, and timeout/unmount invalidate late responses', async () => {
  const sent = [],
    timers = new Map();
  const translate = (key) => key;
  const dependencies = {
    react: React,
    '../../../../shared/i18n': { useT: () => translate, useI18n: () => ({ locale: 'en-US' }) },
    '../../../../shared/visual/AppThemeProvider': { useAppTheme: () => ({ resolvedPreference: 'light' }) },
    '../../../../shared/components/conversationPreview/runtimeBridge': bridge,
    '../../conversationViewport/useConversationViewportDocument': {
      useConversationViewportDocument: () => ({ document: { html: '<p>form</p>' }, loading: false, error: '' })
    },
    './awaitingFormFrame': formFrame
  };
  const exported = {};
  Function(
    'require',
    'exports',
    'setTimeout',
    'clearTimeout',
    compiled
  )(
    (id) => dependencies[id] ?? require(id),
    exported,
    (callback) => {
      const id = Symbol();
      timers.set(id, callback);
      return id;
    },
    (id) => timers.delete(id)
  );
  let frame;
  function Probe({ awaiting }) {
    frame = exported.useAwaitingFormFrame({ awaiting, disabled: false, documentKey: 'same', onError: translate });
    frame.sendRef.current = (raw) => sent.push(JSON.parse(raw));
    return null;
  }
  const awaiting = {
    id: 'a',
    runId: 'r',
    awaitingId: 'a',
    interactive: { kind: 'form', form: { data: { value: 1 } }, view: { source: 'builtin', key: 'ask_user_form' } }
  };
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(Probe, { awaiting }));
  });
  await act(async () => {
    frame.handleMessage({ frameId: frame.frameId, type: 'ready' });
  });
  assert.equal(sent.at(-1).type, 'awaiting_init');
  const originalFrameId = frame.frameId;
  await act(async () => {
    renderer.update(
      React.createElement(Probe, {
        awaiting: { ...awaiting, interactive: { ...awaiting.interactive, form: { data: { value: 2 } } } }
      })
    );
  });
  assert.equal(frame.frameId, originalFrameId);
  assert.equal(sent.at(-1).type, 'awaiting_update');
  assert.equal(sent.at(-1).data.form.data.value, 2);
  frame.handleMessage({
    frameId: originalFrameId,
    type: 'frontend_awaiting_submit',
    param: { decision: 'approve', data: { unsolicited: true } }
  });
  const pending = frame.collect();
  assert.equal(sent.at(-1).type, 'awaiting_collect');
  const timedOut = assert.rejects(pending, /viewportCollectTimeout/);
  await act(async () => {
    [...timers.values()][0]();
  });
  await timedOut;
  assert.notEqual(frame.frameId, originalFrameId);
  frame.handleMessage({
    frameId: originalFrameId,
    type: 'frontend_awaiting_submit',
    param: { decision: 'approve', data: { late: true } }
  });
  await act(async () => {
    frame.handleMessage({ frameId: frame.frameId, type: 'ready' });
  });
  const retry = frame.collect();
  frame.handleMessage({
    frameId: frame.frameId,
    type: 'frontend_awaiting_submit',
    param: { decision: 'approve', data: { current: true } }
  });
  assert.deepEqual(await retry, { decision: 'approve', data: { current: true } });
  const cancelled = frame.collect();
  const cancelledResult = assert.rejects(cancelled, /viewportCollectCancelled/);
  await act(async () => {
    renderer.unmount();
  });
  await cancelledResult;
  assert.equal(timers.size, 0);
});

for (const native of [true, false])
  test(`${native ? 'Native' : 'Web'} Form wrapper restricts the exact child frame and keeps one iframe during updates`, () => {
    const html = formFrame.buildAwaitingFormFrameHtml('<html><head></head><body>Form</body></html>', 'current');
    const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
    const emitted = [],
      childMessages = [];
    let receive,
      replacements = 0;
    const parent = { postMessage: (value) => emitted.push(value) };
    const child = { postMessage: (value) => childMessages.push(value) };
    const frame = { contentWindow: child, onload: null };
    Object.defineProperty(frame, 'srcdoc', {
      set: () => {
        replacements++;
      }
    });
    const window = native ? { ReactNativeWebView: { postMessage: (raw) => emitted.push(JSON.parse(raw)) } } : {};
    Function(
      'window',
      'document',
      'parent',
      'addEventListener',
      script
    )(window, { getElementById: () => frame, addEventListener: () => {} }, parent, (_type, fn) => {
      receive = fn;
    });
    frame.onload();
    assert.deepEqual(emitted, [{ type: 'ready', frameId: 'current' }]);
    receive({
      source: parent,
      data: { frameId: 'current', type: 'awaiting_init', data: { form: { data: { value: 1 } } } }
    });
    receive({
      source: parent,
      data: { frameId: 'current', type: 'awaiting_update', data: { form: { data: { value: 2 } } } }
    });
    assert.equal(replacements, 1);
    assert.equal(childMessages.at(-1).type, 'awaiting_update');
    receive({ source: {}, data: { type: 'frontend_awaiting_submit', param: { decision: 'approve', data: {} } } });
    receive({ source: child, data: { type: 'frontend_submit', params: {} } });
    assert.equal(emitted.length, 1);
    receive({
      source: child,
      data: { type: 'frontend_awaiting_submit', param: { decision: 'approve', data: { value: 2 } } }
    });
    assert.equal(emitted.at(-1).frameId, 'current');
    assert.deepEqual(emitted.at(-1).param.data, { value: 2 });
  });
