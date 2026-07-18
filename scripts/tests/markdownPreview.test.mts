import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import React, { useEffect } from 'react';
import { act, create } from 'react-test-renderer';

import {
  createConversationMarkdownSegmentCache,
  parseConversationMarkdownSegments
} from '../../src/shared/markdown/previewSegments.ts';
import {
  CONVERSATION_PREVIEW_REGISTRY,
  getConversationPreviewKind
} from '../../src/shared/markdown/previewRegistry.ts';
import {
  conversationPreviewHeightCacheInternals,
  getConversationPreviewHeight,
  setConversationPreviewHeight
} from '../../src/shared/components/conversationPreview/previewCache.ts';
import {
  CONVERSATION_PREVIEW_CHANNEL,
  CONVERSATION_PREVIEW_MAX_SOURCE_BYTES,
  getConversationPreviewSourceByteLength,
  parseConversationPreviewEvent
} from '../../src/shared/components/conversationPreview/runtimeBridge.ts';
import { createConversationPreviewVisibilityStore } from '../../src/shared/components/conversationPreview/visibilityStore.ts';
import { usePreviewExecutionState } from '../../src/shared/components/conversationPreview/usePreviewExecutionState.ts';
import {
  CONVERSATION_VIEWPORT_FENCE_EXTENSIONS,
  type ConversationViewportFenceData
} from '../../src/features/chatPersistence/conversationViewport/conversationViewportFence.ts';
import { createConversationViewportDocumentStore } from '../../src/features/chatPersistence/conversationViewport/viewportDocumentStore.ts';

const require = createRequire(import.meta.url);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test('tokenizes aliases, casing, long fences, tilde fences, indentation, and multiple blocks', () => {
  const markdown = [
    'before',
    '   ````MMD title',
    'graph TD',
    '  A-->B',
    '`````',
    'middle',
    '~~~EcHaRtS',
    '({ tooltip: {}, formatter: (value) => value })',
    '~~~',
    '```HTML',
    '<script>document.body.dataset.ready = "yes"</script>',
    '```',
    'after'
  ].join('\r\n');

  const segments = parseConversationMarkdownSegments(markdown);

  assert.deepEqual(
    segments.map((segment) => segment.type),
    ['markdown', 'mermaid', 'markdown', 'echarts', 'html', 'markdown']
  );
  assert.equal(segments[1]?.type === 'mermaid' && segments[1].language, 'mmd');
  assert.match(segments[3]?.type === 'echarts' ? segments[3].source : '', /formatter: \(value\) => value/);
});

test('keeps ordinary, nested, and unclosed fences in native Markdown', () => {
  const ordinary = ['```js', '```mermaid', 'graph TD', '```', '```'].join('\n');
  const unclosed = ['prefix', '```mermaid', 'graph TD'].join('\n');

  assert.deepEqual(parseConversationMarkdownSegments(ordinary), [
    {
      type: 'markdown',
      key: parseConversationMarkdownSegments(ordinary)[0]?.key,
      markdown: ordinary
    }
  ]);
  assert.equal(parseConversationMarkdownSegments(unclosed)[0]?.type, 'markdown');
  assert.equal(
    parseConversationMarkdownSegments(unclosed)[0]?.type === 'markdown'
      ? parseConversationMarkdownSegments(unclosed)[0].markdown
      : '',
    unclosed
  );
});

test('incremental parser preserves completed preview keys and falls back after a rewrite', () => {
  const cache = createConversationMarkdownSegmentCache();
  const closed = ['```mermaid', 'graph TD; A-->B', '```'].join('\n');
  const first = cache.parse(closed);
  const appended = cache.parse(`${closed}\ntail`);
  const appendedAgain = cache.parse(`${closed}\ntail grows`);
  const rewritten = cache.parse(['```echarts', '({ series: [] })', '```'].join('\n'));

  assert.equal(first[0]?.key, appended[0]?.key);
  assert.equal(appended[1]?.type, 'markdown');
  assert.equal(appended[1]?.key, appendedAgain[1]?.key);
  assert.equal(rewritten[0]?.type, 'echarts');
});

test('incremental parser scans appended characters once and fully reparses only after rewrites', () => {
  const metrics = { fullParseCount: 0, scannedCharacters: 0 };
  const cache = createConversationMarkdownSegmentCache({
    onScan: (scannedCharacters, fullParse) => {
      metrics.scannedCharacters += scannedCharacters;
      if (fullParse) {
        metrics.fullParseCount += 1;
      }
    }
  });
  let markdown = '';
  for (let index = 0; index < 2_000; index += 1) {
    markdown += index % 3 === 0 ? `plain-${index}` : `-${index}\n`;
    cache.parse(markdown);
  }

  assert.deepEqual(metrics, {
    fullParseCount: 1,
    scannedCharacters: markdown.length
  });

  const rewritten = ['```echarts', '({ series: [] })', '```'].join('\n');
  cache.parse(rewritten);
  assert.deepEqual(metrics, {
    fullParseCount: 2,
    scannedCharacters: markdown.length + rewritten.length
  });
});

test('incremental parser handles CRLF split across chunks without remounting the preview', () => {
  const cache = createConversationMarkdownSegmentCache();
  const opening = '```mermaid\r';
  const body = `${opening}\nflowchart TD\r\n`;
  const closedAtCarriageReturn = `${body}\`\`\`\r`;
  assert.equal(cache.parse(opening)[0]?.type, 'markdown');
  assert.equal(cache.parse(body)[0]?.type, 'markdown');

  const provisional = cache.parse(closedAtCarriageReturn);
  const committed = cache.parse(`${closedAtCarriageReturn}\n`);
  assert.equal(provisional[0]?.type, 'mermaid');
  assert.equal(provisional[0]?.key, committed[0]?.key);
  assert.equal(provisional[0]?.type === 'mermaid' ? provisional[0].source : '', 'flowchart TD');
});

test('incremental chunk boundaries match full parsing for ordinary, special, and unfinished fences', () => {
  const fixtures = [
    ['plain', '```js', 'const value = 1;', '```', 'tail'].join('\n'),
    ['~~~mmd', 'graph TD', 'A-->B', '~~~~', '```html', '<p>ok</p>', '```'].join('\r\n'),
    ['````echarts', '({ tooltip: { formatter: (value) => value } })', '`````'].join('\n'),
    ['```js', '```mermaid', 'graph TD', '```', '```'].join('\n'),
    ['before', '```html', '<script>document.body.textContent = "pending"</script>'].join('\n')
  ];

  fixtures.forEach((fixture) => {
    const expected = parseConversationMarkdownSegments(fixture);
    for (let chunkSize = 1; chunkSize <= 7; chunkSize += 1) {
      const cache = createConversationMarkdownSegmentCache();
      let streamed = '';
      let actual = cache.parse(streamed);
      for (let offset = 0; offset < fixture.length; offset += chunkSize) {
        streamed += fixture.slice(offset, offset + chunkSize);
        actual = cache.parse(streamed);
      }
      assert.deepEqual(actual, expected);
    }
  });
});

test('incremental parser rescans when appended text extends a closing fence line', () => {
  const cache = createConversationMarkdownSegmentCache();
  const closedAtEnd = ['```mermaid', 'graph TD; A-->B', '```'].join('\n');
  assert.equal(cache.parse(closedAtEnd)[0]?.type, 'mermaid');

  const extendedClosingLine = cache.parse(`${closedAtEnd}not-a-close`);
  assert.equal(extendedClosingLine.length, 1);
  assert.equal(extendedClosingLine[0]?.type, 'markdown');
});

test('viewport fence extension preserves order and only extracts complete valid blocks', () => {
  const options = { extensions: CONVERSATION_VIEWPORT_FENCE_EXTENSIONS };
  const closed = [
    'before',
    '~~~VIEWPORT optional',
    'type=html, key=weather-card',
    '{"city":"Shanghai"}',
    '~~~',
    'after'
  ].join('\n');
  const segments = parseConversationMarkdownSegments(closed, options);

  assert.deepEqual(segments.map((segment) => segment.type), ['markdown', 'extension', 'markdown']);
  const viewport = segments[1];
  assert.equal(viewport?.type === 'extension' ? viewport.extensionKey : '', 'viewport');
  assert.deepEqual(
    viewport?.type === 'extension' ? (viewport.data as ConversationViewportFenceData).payload : null,
    { city: 'Shanghai' }
  );
  assert.equal(
    viewport?.type === 'extension' ? (viewport.data as ConversationViewportFenceData).viewportKey : '',
    'weather-card'
  );

  const invalid = ['```viewport', 'type=html', '{}', '```'].join('\n');
  const unclosed = ['```viewport', 'type=html,key=pending', '{}'].join('\n');
  assert.equal(parseConversationMarkdownSegments(invalid, options)[0]?.type, 'markdown');
  assert.equal(parseConversationMarkdownSegments(unclosed, options)[0]?.type, 'markdown');
});

test('viewport fence extension remains append-only and switches after the closing fence', () => {
  const metrics = { fullParseCount: 0, scannedCharacters: 0 };
  const cache = createConversationMarkdownSegmentCache({
    extensions: CONVERSATION_VIEWPORT_FENCE_EXTENSIONS,
    onScan: (scannedCharacters, fullParse) => {
      metrics.scannedCharacters += scannedCharacters;
      metrics.fullParseCount += Number(fullParse);
    }
  });
  const chunks = ['prefix\n```view', 'port\ntype=html,key=map\n', '{"zoom":8}\n', '```'];
  let content = '';
  let segments = cache.parse(content);
  chunks.forEach((chunk) => {
    content += chunk;
    segments = cache.parse(content);
  });
  assert.equal(segments.some((segment) => segment.type === 'extension'), true);
  assert.deepEqual(metrics, { fullParseCount: 1, scannedCharacters: content.length });
});

test('viewport document store shares requests, expires LRU entries, and refreshes explicitly', async () => {
  let now = 100;
  let calls = 0;
  const store = createConversationViewportDocumentStore(
    async (viewportKey) => {
      calls += 1;
      return { html: `<main>${viewportKey}-${calls}</main>` };
    },
    { cacheLimit: 2, cacheTtlMs: 50, now: () => now }
  );

  const first = store.load('alpha');
  const duplicate = store.load('alpha');
  assert.equal(first, duplicate);
  assert.equal(await first, '<main>alpha-1</main>');
  assert.equal(await store.load('alpha'), '<main>alpha-1</main>');
  assert.equal(calls, 1);

  assert.equal(await store.load('alpha', { force: true }), '<main>alpha-2</main>');
  await store.load('beta');
  await store.load('gamma');
  assert.equal(store.getCached('alpha'), '');
  assert.equal(store.getCached('gamma'), '<main>gamma-4</main>');

  now += 51;
  assert.equal(store.getCached('beta'), '');
  store.clear();
  assert.equal(store.getCached('gamma'), '');
});

test('visibility store delays release and cancels it when a row returns quickly', async () => {
  const store = createConversationPreviewVisibilityStore(15);
  let notifications = 0;
  const unsubscribe = store.subscribe('row-1', () => {
    notifications += 1;
  });

  store.replaceVisibleRows(['row-1']);
  assert.equal(store.getSnapshot('row-1'), true);
  store.replaceVisibleRows([]);
  store.replaceVisibleRows(['row-1']);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(store.getSnapshot('row-1'), true);

  store.replaceVisibleRows([]);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(store.getSnapshot('row-1'), false);
  assert.equal(notifications, 2);
  unsubscribe();
  store.dispose();
});

test('preview registry is the single source for aliases, renderer mode, and source defaults', () => {
  assert.equal(getConversationPreviewKind('  MErMind title'), 'mermaid');
  assert.equal(getConversationPreviewKind('ECHART'), 'echarts');
  assert.equal(getConversationPreviewKind('javascript'), null);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(CONVERSATION_PREVIEW_REGISTRY).map(([kind, definition]) => [
        kind,
        [definition.renderer, definition.defaultSourceExpanded]
      ])
    ),
    {
      mermaid: ['inline', false],
      echarts: ['inline', false],
      html: ['overlay', true]
    }
  );
});

test('height cache clamps values and remains bounded to 64 entries', () => {
  conversationPreviewHeightCacheInternals.clear();
  assert.equal(getConversationPreviewHeight('mermaid', 'missing'), 220);
  assert.equal(setConversationPreviewHeight('mermaid', 'small', 10), 160);
  assert.equal(setConversationPreviewHeight('echarts', 'large', 900), 480);
  assert.equal(
    setConversationPreviewHeight('html', 'viewport', 900, {
      initial: 260,
      minimum: 180,
      maximum: 380
    }),
    380
  );
  for (let index = 0; index < 80; index += 1) {
    setConversationPreviewHeight('mermaid', `entry-${index}`, 220 + index);
  }
  assert.equal(conversationPreviewHeightCacheInternals.size(), 64);
  conversationPreviewHeightCacheInternals.clear();
});

type ExecutionStateSnapshot = ReturnType<typeof usePreviewExecutionState>;

function ExecutionStateHarness({
  onExecutionError,
  onValue
}: {
  onExecutionError: () => void;
  onValue: (value: ExecutionStateSnapshot) => void;
}) {
  const value = usePreviewExecutionState(onExecutionError);
  useEffect(() => onValue(value), [onValue, value]);
  return null;
}

test('shared preview execution state handles errors, ready, and retries consistently', async () => {
  let latest: ExecutionStateSnapshot | null = null;
  let errorCount = 0;
  await act(async () => {
    create(
      React.createElement(ExecutionStateHarness, {
        onExecutionError: () => {
          errorCount += 1;
        },
        onValue: (value: ExecutionStateSnapshot) => {
          latest = value;
        }
      })
    );
  });

  await act(async () => latest?.handleError('boom'));
  assert.equal(latest?.error, 'boom');
  assert.equal(errorCount, 1);

  await act(async () => latest?.handleRetry());
  assert.equal(latest?.error, '');
  assert.equal(latest?.retryNonce, 1);

  await act(async () => latest?.handleError('again'));
  await act(async () => latest?.handleReady());
  assert.equal(latest?.error, '');
});

test('bridge rejects malformed envelopes and wrong request ids', () => {
  const expected = 'request-1';
  assert.equal(parseConversationPreviewEvent('not-json', expected), null);
  assert.equal(
    parseConversationPreviewEvent(
      { channel: CONVERSATION_PREVIEW_CHANNEL, event: { type: 'ready', requestId: 'request-2' } },
      expected
    ),
    null
  );
  assert.deepEqual(
    parseConversationPreviewEvent(
      { channel: CONVERSATION_PREVIEW_CHANNEL, event: { type: 'resize', requestId: expected, height: 321 } },
      expected
    ),
    { type: 'resize', requestId: expected, height: 321 }
  );
  assert.equal(getConversationPreviewSourceByteLength('图'), 3);
  assert.equal(
    getConversationPreviewSourceByteLength('a'.repeat(CONVERSATION_PREVIEW_MAX_SOURCE_BYTES + 1)) >
      CONVERSATION_PREVIEW_MAX_SOURCE_BYTES,
    true
  );
});

test('generated runtimes are deterministic, offline, and isolate executable content', () => {
  const { createChildDocument, createOuterRuntime, withGeneratedHash } = require('../markdown-preview/pregenerate.js');
  const mermaidChild = createChildDocument('mermaid', 'globalThis.mermaid = {};');
  const echartsChild = createChildDocument('echarts', 'globalThis.echarts = {};');
  const htmlRuntime = createOuterRuntime('html');
  const echartsRuntime = createOuterRuntime('echarts', echartsChild);

  assert.equal(withGeneratedHash(htmlRuntime), withGeneratedHash(createOuterRuntime('html')));
  assert.match(mermaidChild, /securityLevel: 'strict'/);
  assert.match(mermaidChild, /htmlLabels: false/);
  assert.match(echartsChild, /opaque-origin sandbox iframe/);
  assert.match(echartsChild, /Function\('/);
  assert.match(echartsChild, /ResizeObserver/);
  assert.match(echartsChild, /pagehide/);
  assert.match(echartsChild, /disposeChart/);
  assert.match(echartsRuntime, /script-src 'unsafe-inline' 'unsafe-eval'/);
  assert.match(htmlRuntime, /sandbox="allow-scripts"/);
  assert.match(htmlRuntime, /initialData/);
  assert.match(htmlRuntime, /ResizeObserver/);
  assert.doesNotMatch(htmlRuntime, /unsafe-eval/);
  assert.doesNotMatch(htmlRuntime, /allow-same-origin/);
  assert.match(htmlRuntime, /connect-src 'none'/);
  assert.match(htmlRuntime, /frame-src data: blob:/);
  assert.match(htmlRuntime, /referrerpolicy="no-referrer"/);
  assert.doesNotMatch(htmlRuntime, /navigate-to/);
  assert.doesNotMatch(htmlRuntime, /<script[^>]+src=/i);

  const outerScript = htmlRuntime.match(/<script>([\s\S]*)<\/script>/)?.[1];
  assert.ok(outerScript);
  assert.doesNotThrow(() => Function(outerScript));
  for (const childDocument of [mermaidChild, echartsChild]) {
    const childScripts = Array.from(childDocument.matchAll(/<script>([\s\S]*?)<\/script>/g), (match) => match[1]);
    assert.equal(childScripts.length, 2);
    childScripts.forEach((script) => assert.doesNotThrow(() => Function(script)));
  }
});

test('html runtime preserves full documents, forwards initial data, and relays bounded events', () => {
  const { createOuterRuntime } = require('../markdown-preview/pregenerate.js');
  const runtime = createOuterRuntime('html');
  const outerScript = runtime.match(/<script>([\s\S]*)<\/script>/)?.[1];
  assert.ok(outerScript);

  const windowListeners = new Map<string, (event: { data: unknown; source: unknown }) => void>();
  const emitted: unknown[] = [];
  const childMessages: unknown[] = [];
  const childWindow = { postMessage: (message: unknown) => childMessages.push(message) };
  const frame = {
    contentWindow: childWindow,
    dataset: {} as Record<string, string>,
    onload: null as null | (() => void),
    srcdoc: ''
  };
  const fakeWindow = {
    ReactNativeWebView: {
      postMessage: (payload: string) => emitted.push(JSON.parse(payload))
    },
    addEventListener: (type: string, listener: (event: { data: unknown; source: unknown }) => void) =>
      windowListeners.set(type, listener),
    parent: { postMessage: () => {} }
  };
  const fakeDocument = { addEventListener: () => {}, getElementById: () => frame };
  const fakeGlobal = { crypto: { getRandomValues: (bytes: Uint8Array) => bytes.fill(9) } };
  Function('window', 'document', 'globalThis', outerScript)(fakeWindow, fakeDocument, fakeGlobal);
  const handleMessage = windowListeners.get('message');
  assert.ok(handleMessage);

  const initialData = { city: 'Shanghai' };
  handleMessage({
    source: {},
    data: {
      channel: CONVERSATION_PREVIEW_CHANNEL,
      request: {
        requestId: 'viewport-request',
        kind: 'html',
        source: '<!doctype html><html lang="en"><head data-app="viewport"><title>Viewport</title></head><body>ok</body></html>',
        theme: 'light',
        mode: 'inline',
        initialData
      }
    }
  });
  assert.match(frame.srcdoc, /<title>Viewport<\/title>/);
  assert.match(frame.srcdoc, /Content-Security-Policy/);
  frame.onload?.();
  assert.deepEqual(childMessages, [initialData]);
  assert.deepEqual(emitted, [
    {
      channel: CONVERSATION_PREVIEW_CHANNEL,
      event: { type: 'ready', requestId: 'viewport-request' }
    }
  ]);

  const capabilityToken = JSON.parse(frame.srcdoc.match(/const token=("[^"]+")/)?.[1] || '""');
  assert.ok(capabilityToken);
  handleMessage({
    source: childWindow,
    data: {
      channel: CONVERSATION_PREVIEW_CHANNEL,
      token: capabilityToken,
      event: { type: 'resize', requestId: 'viewport-request', height: 320 }
    }
  });
  assert.deepEqual(emitted[1], {
    channel: CONVERSATION_PREVIEW_CHANNEL,
    event: { type: 'resize', requestId: 'viewport-request', height: 320 }
  });
});

test('runtime bridge rejects forged child tokens and accepts the active capability only', () => {
  const { createChildDocument, createOuterRuntime } = require('../markdown-preview/pregenerate.js');
  const runtime = createOuterRuntime('echarts', createChildDocument('echarts', 'globalThis.echarts = {};'));
  const outerScript = runtime.match(/<script>([\s\S]*)<\/script>/)?.[1];
  assert.ok(outerScript);

  const windowListeners = new Map<string, (event: { data: unknown; source: unknown }) => void>();
  const emitted: unknown[] = [];
  const childMessages: Array<{ channel: string; token: string; request: { requestId: string } }> = [];
  const childWindow = {
    postMessage: (payload: (typeof childMessages)[number]) => childMessages.push(payload)
  };
  const frame = {
    contentWindow: childWindow,
    dataset: {} as Record<string, string>,
    onload: null as null | (() => void),
    srcdoc: ''
  };
  const fakeWindow = {
    ReactNativeWebView: {
      postMessage: (payload: string) => emitted.push(JSON.parse(payload))
    },
    addEventListener: (type: string, listener: (event: { data: unknown; source: unknown }) => void) =>
      windowListeners.set(type, listener),
    parent: { postMessage: () => {} }
  };
  const fakeDocument = {
    addEventListener: () => {},
    getElementById: () => frame
  };
  const fakeGlobal = {
    crypto: {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(7)
    }
  };
  Function('window', 'document', 'globalThis', outerScript)(fakeWindow, fakeDocument, fakeGlobal);
  const handleMessage = windowListeners.get('message');
  assert.ok(handleMessage);

  handleMessage({
    source: {},
    data: {
      channel: CONVERSATION_PREVIEW_CHANNEL,
      request: { requestId: 'request-1', kind: 'echarts', source: '({})', theme: 'light', mode: 'inline' }
    }
  });
  frame.onload?.();
  assert.equal(childMessages.length, 1);
  const childMessage = childMessages[0];
  assert.ok(childMessage?.token);

  handleMessage({
    source: childWindow,
    data: {
      channel: CONVERSATION_PREVIEW_CHANNEL,
      token: 'forged',
      event: { type: 'ready', requestId: 'request-1' }
    }
  });
  handleMessage({
    source: childWindow,
    data: {
      channel: CONVERSATION_PREVIEW_CHANNEL,
      token: childMessage.token,
      event: { type: 'ready', requestId: 'wrong-request' }
    }
  });
  assert.equal(emitted.length, 0);

  handleMessage({
    source: childWindow,
    data: {
      channel: CONVERSATION_PREVIEW_CHANNEL,
      token: childMessage.token,
      event: { type: 'ready', requestId: 'request-1' }
    }
  });
  assert.equal(emitted.length, 1);
});
