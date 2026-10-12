import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { transformSync } from '@babel/core';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import * as projection from '../../src/features/chatPersistence/chatImageGeneration.ts';
import { createChatSource, encodeChatSourceId } from '../../src/features/chatPersistence/chatSource.ts';
import { defaultT } from '../../src/shared/i18n/translate.ts';
import {
  deriveChatTimelineState,
  applyChatTimelineEvent,
  buildChatTimelineDisplayItems,
  buildChatTimelinePresentationItems,
  serializeChatTimelineState,
  deserializeChatTimelineState,
  type ChatTimelineToolNode
} from '../../src/features/chatTimeline/index.ts';
function state() {
  return deriveChatTimelineState('chat', [
    { type: 'run.start', runId: 'run', timestamp: 1000 },
    { type: 'tool.start', runId: 'run', toolId: 'tool', toolName: 'image_generate', args: { n: 3 }, timestamp: 1001 }
  ]);
}
function tool(s = state()) {
  return Object.values(s.nodesById).find((n) => n.kind === 'tool') as ChatTimelineToolNode;
}
const images = [
  { index: 2, url: 'artifacts/third.png', name: 'third.png' },
  { index: 0, url: 'artifacts/first.png' },
  { index: 1, ok: false, error: 'Model rejected this image' }
];
test('image slots retain request numbering, accept partial success and reject path guesses, unsafe URLs and duplicate indexes', () => {
  const node = {
    ...tool(),
    lifecycle: 'error',
    resultText: JSON.stringify({ ok: false, images })
  } as ChatTimelineToolNode;
  const slots = projection.buildChatImageGenerationSlots(node, 'chat', 'error');
  assert.deepEqual(
    slots.map((s) => s.index),
    [0, 1, 2]
  );
  assert.deepEqual(
    slots.map((s) => s.status),
    ['success', 'failed', 'success']
  );
  assert.equal(slots[1].error, 'Model rejected this image');
  assert.match(slots[0].resourceUrl, /^\/api\/resource\?file=chat%2Fartifacts%2Ffirst.png$/);
  const changed = projection.buildChatImageGenerationSlots(
    { ...node, resultText: JSON.stringify({ images: [...images, { index: 0, url: 'other.png' }] }) },
    'chat',
    'cancelled'
  );
  assert.deepEqual(
    slots.map((s) => s.key),
    changed.map((s) => s.key)
  );
  assert.equal(changed[0].resourceUrl, slots[0].resourceUrl);
  const absent = projection.buildChatImageGenerationSlots(
    {
      ...node,
      lifecycle: 'complete',
      resultText: JSON.stringify({
        ok: true,
        images: [
          { index: 9, url: 'injected.png' },
          { index: 0, path: '/private/image.png', relativePath: 'guess.png' }
        ]
      })
    },
    'chat',
    'complete'
  );
  assert.ok(absent.every((s) => s.resourceUrl === '' && s.status === 'missing'));
  for (const url of [
    '../secret.png',
    '%2e%2e/secret.png',
    'artifacts/%2fsecret.png',
    '/private/file.png',
    '//evil/image.png',
    'https://evil/image.png',
    'data:image/png;base64,AA',
    'artifacts/a.png?token=secret',
    'artifacts/a.png#fragment',
    'chat/a.png',
    '/api/resource?file=other%2Fa.png'
  ])
    assert.equal(projection.resolveGeneratedImageResourceUrl(url, 'chat'), '', url);
  assert.equal(
    projection.resolveGeneratedImageResourceUrl('/api/resource?file=chat%2Fa.png', 'chat'),
    '/api/resource?file=chat%2Fa.png'
  );
  const source = createChatSource('paired', 'desktop', 'Desktop');
  assert.equal(
    projection.resolveGeneratedImageResourceUrl(
      'artifacts/%E5%A4%8F%20%231%25.png',
      encodeChatSourceId(source, 'chat')
    ),
    '/api/resource?file=chat%2Fartifacts%2F%25E5%25A4%258F%2520%25231%2525.png'
  );
});
test('operation, bounded malformed inputs, awaiting recovery and terminal states derive only from persisted tool/run data', () => {
  const node = tool();
  for (const [argsText, status] of [
    ['{"n":4}', 'generation'],
    ['{"images":["input"]}', 'edit'],
    ['{"mask":"mask.png"}', 'inpainting'],
    ['{"n":', 'preparing']
  ] as const) {
    assert.equal(
      projection.buildChatImageGenerationSlots({ ...node, streaming: true, argsText }, 'chat', 'active')[0].status,
      status
    );
  }
  assert.equal(
    projection.buildChatImageGenerationSlots({ ...node, streaming: false }, 'chat', 'active')[0].status,
    'recovering'
  );
  assert.equal(projection.buildChatImageGenerationSlots(node, 'chat', 'cancelled')[0].status, 'cancelled');
  assert.equal(projection.buildChatImageGenerationSlots(node, 'chat', 'complete')[0].status, 'missing');
  const failed = projection.buildChatImageGenerationSlots(
    {
      ...node,
      lifecycle: 'error',
      resultText: '{"ok":false,"error":"image_generate_failed","message":"Provider unavailable"}'
    },
    'chat',
    'error'
  );
  assert.equal(failed[0].error, 'Provider unavailable');
  const huge = projection.buildChatImageGenerationSlots(
    {
      ...node,
      argsText: ' '.repeat(64 * 1024 + 1),
      resultText: '',
      toolOutput: { stdout: 'artifacts/guess.png', stderr: '', truncated: false }
    } as any,
    'chat',
    'active'
  );
  assert.equal(huge.length, 1);
  assert.equal(huge[0].resourceUrl, '');
});
test('live result, terminal replay and cold snapshot produce identical images that stay outside folded process rows', () => {
  let s = applyChatTimelineEvent(state(), 'chat', {
    type: 'tool.result',
    runId: 'run',
    toolId: 'tool',
    result: { ok: false, images },
    timestamp: 1100
  });
  s = applyChatTimelineEvent(s, 'chat', {
    type: 'tool.start',
    runId: 'run',
    toolId: 'second-tool',
    toolName: 'image_generate',
    args: { n: 1 },
    timestamp: 1150
  });
  s = applyChatTimelineEvent(s, 'chat', { type: 'run.error', runId: 'run', timestamp: 1200 });
  const before = projection.buildChatImageGenerationSlots(tool(s), 'chat', 'error');
  const snapshot = serializeChatTimelineState(s),
    restored = deserializeChatTimelineState(snapshot.meta, snapshot.nodes)!;
  assert.deepEqual(projection.buildChatImageGenerationSlots(tool(restored), 'chat', 'error'), before);
  const replayed = applyChatTimelineEvent(restored, 'chat', {
    type: 'tool.result',
    runId: 'run',
    toolId: 'tool',
    result: { ok: false, images },
    timestamp: 1100
  });
  assert.deepEqual(projection.buildChatImageGenerationSlots(tool(replayed), 'chat', 'error'), before);
  const folded = buildChatTimelinePresentationItems(s, buildChatTimelineDisplayItems(s), new Set());
  assert.ok(folded.some((item) => item.kind === 'tool-group' && item.nodes.length === 2));
});

const require = createRequire(import.meta.url);
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
test('image gallery uses authenticated image sources only for visible success slots and exposes preview/retry separately', async () => {
  const url = new URL('../../src/features/chatPersistence/components/ChatImageGeneration.tsx', import.meta.url);
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
  let visible = true,
    retries = 0;
  const sources: any[] = [],
    previews: any[] = [];
  const authenticatedSource = { uri: 'file:///authenticated/cache.png' };
  const deps = {
    'react-native': {
      ActivityIndicator: 'ActivityIndicator',
      Image: 'Image',
      Pressable: 'Pressable',
      FlatList: ({ data, renderItem, ...rest }: any) =>
        React.createElement(
          'FlatList',
          rest,
          ...data.map((item: any) => React.createElement(React.Fragment, { key: item.key }, renderItem({ item })))
        ),
      Text: 'Text',
      View: 'View'
    },
    '../../../shared/i18n': { useT: () => defaultT },
    '../../../shared/components/conversationPreview/ConversationPreviewProvider.tsx': {
      useConversationPreviewRowActive: () => visible
    },
    '../chatImageGeneration.ts': projection,
    './resource/AuthenticatedResourcePreviewProvider.tsx': {
      useAuthenticatedResourcePreview: () => ({ openPreview: (v: any) => previews.push(v) })
    },
    './resource/useAuthenticatedResourceSource.ts': {
      useAuthenticatedResourceSource: (resourceUrl: string, active: boolean, name: string) => {
        sources.push([resourceUrl, active, name]);
        return {
          source: active && resourceUrl ? authenticatedSource : null,
          loading: false,
          error: '',
          retry: () => {
            retries++;
          }
        };
      }
    }
  };
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', code)(
    (key: string) => (deps as any)[key] ?? require(key),
    module,
    module.exports
  );
  const Gallery = module.exports.ChatImageGeneration,
    node = { ...tool(), resultText: JSON.stringify({ ok: false, images }), lifecycle: 'error' };
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(Gallery, { nodes: [node], conversationId: 'chat', runLifecycle: 'error' }));
  });
  try {
    assert.equal(renderer.root.findByType('FlatList').props.initialNumToRender, 2);
    assert.equal(renderer.root.findByType('FlatList').props.windowSize, 3);
    assert.equal(renderer.root.findAllByType('Image').length, 2);
    assert.ok(
      renderer.root.findAllByType('Image').every((n) => n.props.source.uri.startsWith('file:///authenticated'))
    );
    assert.ok(
      sources
        .filter(([url, active]) => url && active)
        .every(([url, , name]) => url.startsWith('/api/resource?') && !!name)
    );
    const successful = renderer.root.findAllByType('Pressable').filter((n) => !n.props.disabled);
    await act(async () => successful[0].props.onPress());
    assert.equal(previews[0].previewKind, 'image');
    await act(async () => renderer.root.findAllByType('Image')[0].props.onError());
    const retry = renderer.root
      .findAllByType('Pressable')
      .find((n) => n.findAllByType('Text').some((t) => t.props.children === defaultT('imageGeneration.retry')))!;
    await act(async () => retry.props.onPress());
    assert.equal(retries, 1);
    visible = false;
    sources.length = 0;
    await act(async () =>
      renderer.update(React.createElement(Gallery, { nodes: [node], conversationId: 'chat', runLifecycle: 'error' }))
    );
    assert.ok(sources.every(([, active]) => !active));
  } finally {
    await act(async () => renderer.unmount());
  }
});
