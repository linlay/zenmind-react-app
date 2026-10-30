import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readChatViewReference } from '../../src/core/api/services/chatViewProtocol.ts';
import { buildSubmitAwaitingPayload, readAwaitingSubmitParam } from '../../src/core/api/services/chatApi.ts';
import { CONVERSATION_VIEW_FENCE_EXTENSIONS } from '../../src/features/chatPersistence/conversationViewport/conversationViewportFence.ts';
import {
  createConversationMarkdownSegmentCache,
  parseConversationMarkdownSegments
} from '../../src/shared/markdown/previewSegments.ts';
import {
  applyChatTimelineMessage,
  applyChatTimelineEvent,
  createChatTimelineState,
  mergeChatTimelineState
} from '../../src/features/chatTimeline/timelineReducer.ts';
import {
  deserializeChatTimelineState,
  serializeChatTimelineState
} from '../../src/features/chatTimeline/timelinePersistence.ts';
import { scopeChatPayload, unscopeChatPayload } from '../../src/features/chatRealtime/chatSourcePayload.ts';
import { createChatSource, encodeChatSourceId } from '../../src/features/chatPersistence/chatSource.ts';
import {
  buildAwaitingFormFrameHtml,
  readAwaitingFormFrameReply
} from '../../src/features/chatPersistence/components/awaiting/awaitingFormFrame.ts';

const fixtures = new URL('../fixtures/chat-detail-webclient-2026-10-28/', import.meta.url);
const wire = JSON.parse(readFileSync(new URL('wire-cases.json', fixtures), 'utf8'));
const view = {
  source: 'connector' as const,
  connectorId: 'builtin.task-control',
  key: 'automations',
  hash: 'a'.repeat(64),
  renderer: 'html' as const
};

test('all pinned VIEW golden cases match the single shared scanner, including streamed close and rewrites', () => {
  const golden = JSON.parse(readFileSync(new URL('view-markdown-cases.json', fixtures), 'utf8'));
  for (const fixture of golden.cases) {
    const toBlocks = (segments) =>
      segments
        .filter((segment) => segment.type === 'extension')
        .map(({ data }) => ({
          index: data.index,
          ...(data.key ? { key: data.key } : {}),
          ...(data.error ? { error: data.error } : { data: data.payload })
        }));
    const options = { extensions: CONVERSATION_VIEW_FENCE_EXTENSIONS, final: fixture.final };
    assert.deepEqual(toBlocks(parseConversationMarkdownSegments(fixture.text, options)), fixture.blocks, fixture.name);
    const cache = createConversationMarkdownSegmentCache(options);
    for (let length = 1; length <= fixture.text.length; length++) cache.parse(fixture.text.slice(0, length), false);
    assert.deepEqual(toBlocks(cache.parse(fixture.text, fixture.final)), fixture.blocks, `stream: ${fixture.name}`);
    cache.parse('replacement');
    assert.deepEqual(toBlocks(cache.parse(fixture.text, fixture.final)), fixture.blocks, `rewrite: ${fixture.name}`);
  }
});

test('source namespace changes protocol identities and preserves arbitrary business JSON in both directions', () => {
  const source = createChatSource('paired', 't00', 'Desktop');
  const business = {
    ...wire.namespace.business,
    nested: { chatId: encodeChatSourceId(source, 'literal-business-id') }
  };
  const input = {
    chatId: 'chat',
    agentKey: 'root',
    param: { decision: 'approve', data: business },
    params: business,
    data: business,
    payload: business,
    result: business,
    events: [{ type: 'content.view', chatId: 'chat', agentKey: 'root', data: business }],
    activeRun: { runId: 'run', agentKey: 'root' }
  };
  const scoped = scopeChatPayload(source, input);
  assert.equal(scoped.chatId, encodeChatSourceId(source, 'chat'));
  assert.equal(scoped.events[0].agentKey, encodeChatSourceId(source, 'root'));
  assert.equal(scoped.activeRun.agentKey, encodeChatSourceId(source, 'root'));
  for (const key of ['params', 'data', 'payload', 'result']) assert.equal(scoped[key], business);
  assert.deepEqual(unscopeChatPayload(scoped), input);
});

test('new source references and exclusive awaiting answers follow frozen contracts', () => {
  for (const reference of wire.views.valid) assert.ok(readChatViewReference(reference));
  for (const reference of wire.views.invalid) assert.equal(readChatViewReference(reference), undefined);
  for (const { mode, request } of wire.validSubmits) {
    assert.deepEqual(buildSubmitAwaitingPayload(request), request);
    if (request.param)
      assert.deepEqual(readAwaitingSubmitParam(request.param, mode === 'planning' ? 'plan' : 'form'), request.param);
  }
  for (const { mode, answer } of wire.invalidSubmits) {
    if (answer.param && !answer.params && (mode === 'form' || mode === 'planning'))
      assert.equal(readAwaitingSubmitParam(answer.param, mode === 'planning' ? 'plan' : 'form'), null);
  }
  assert.throws(
    () =>
      buildSubmitAwaitingPayload({ runId: 'r', awaitingId: 'a', param: { decision: 'dismiss' }, params: [] } as never),
    /exactly one/
  );
});

test('content.view can precede text, survives delta/end and snapshots replace bindings authoritatively', () => {
  let state = createChatTimelineState('chat');
  const apply = (event) => {
    state = applyChatTimelineEvent(state, 'chat', { runId: 'run', contentId: 'content', ...event });
  };
  apply({ type: 'content.view', index: 1, view, timestamp: 100 });
  const placeholder = Object.values(state.nodesById).find((node) => node.kind === 'message')!;
  state = applyChatTimelineMessage(
    state,
    {
      conversationId: 'chat',
      messageId: placeholder.messageId,
      clientMessageId: null,
      serverMessageId: null,
      role: 'assistant',
      content: 'body',
      createdAt: 100,
      deliveryStatus: 'sent',
      errorReason: null,
      attachments: [],
      streamStatus: 'streaming'
    },
    { runId: 'run' }
  );
  apply({ type: 'content.delta', text: 'body', timestamp: 101 });
  apply({ type: 'content.end', timestamp: 102 });
  let message = Object.values(state.nodesById).find((node) => node.kind === 'message')!;
  assert.deepEqual(message.viewBindings?.[1].view, view);
  const snapshot = serializeChatTimelineState(state);
  const restored = deserializeChatTimelineState(snapshot.meta, snapshot.nodes)!;
  assert.deepEqual(restored.nodesById[message.id].viewBindings, message.viewBindings);
  const merged = mergeChatTimelineState(restored, createChatTimelineState('chat'), true);
  assert.deepEqual(merged.nodesById[message.id].viewBindings, message.viewBindings);
  state = createChatTimelineState('chat');
  apply({ type: 'content.view', index: 1, view, timestamp: 100 });
  apply({ type: 'content.snapshot', text: 'rewritten', views: [], timestamp: 103 });
  message = Object.values(state.nodesById).find((node) => node.kind === 'message')!;
  assert.deepEqual(message.viewBindings, {});
});

test('v9 legacy Form remains readable and loses actionable interactive data on decode', () => {
  const fixture = JSON.parse(readFileSync(new URL('v9-form-snapshot.json', fixtures), 'utf8'));
  const state = deserializeChatTimelineState(fixture.snapshot.meta, fixture.snapshot.nodes)!;
  assert.equal(state.awaiting?.interactive, null);
  assert.equal(state.awaiting?.prompt, 'Pending form');
  const history = Object.values(state.nodesById).find((node) => node.kind === 'awaiting' && node.status === 'answer');
  assert.ok(history?.answerSummary);
});

test('dedicated Form frame accepts bounded single param replies only from its current frame identity', () => {
  const reply = {
    frameId: 'current',
    type: 'frontend_awaiting_submit',
    param: { decision: 'approve', data: { chatId: 'business' } }
  };
  assert.equal(readAwaitingFormFrameReply(reply, 'old'), null);
  assert.deepEqual(readAwaitingFormFrameReply(reply, 'current')?.param, reply.param);
  assert.equal(readAwaitingFormFrameReply({ ...reply, param: { decision: 'approve', data: [] } }, 'current'), null);
  assert.equal(
    readAwaitingFormFrameReply(
      { ...reply, param: { decision: 'approve', data: { text: '中'.repeat(22000) } } },
      'current'
    ),
    null
  );
  const html = buildAwaitingFormFrameHtml('<html><head></head><body>Form</body></html>', 'current');
  assert.match(html, /sandbox="allow-scripts"/);
  assert.match(html, /event.source===frame.contentWindow/);
  assert.match(html, /Object.defineProperty/);
});

test('same VIEW instance receives view_update without calling renderHtml or changing srcdoc', () => {
  const { createOuterRuntime } = createRequire(import.meta.url)('../markdown-preview/pregenerate.js');
  const script = createOuterRuntime('html').match(/<script>([\s\S]*)<\/script>/)[1];
  const messages = [];
  let handler,
    replacements = 0;
  const frame = { contentWindow: { postMessage: (value) => messages.push(value) }, dataset: {}, onload: null };
  Object.defineProperty(frame, 'srcdoc', {
    get: () => '',
    set: () => {
      replacements++;
    }
  });
  const window = {
    addEventListener: (_type, fn) => {
      handler = fn;
    },
    ReactNativeWebView: { postMessage: () => {} }
  };
  Function(
    'window',
    'document',
    'globalThis',
    script
  )(
    window,
    { getElementById: () => frame, addEventListener: () => {} },
    { crypto: { getRandomValues: (value) => value.fill(1) } }
  );
  const request = {
    requestId: 'same',
    kind: 'html',
    source: '<p>template</p>',
    initialData: { type: 'view_init', data: { payload: { value: 1 } } }
  };
  handler({ source: {}, data: { channel: 'zenmind-conversation-preview', request } });
  frame.onload();
  handler({
    source: {},
    data: {
      channel: 'zenmind-conversation-preview',
      request: { ...request, initialData: { type: 'view_init', data: { payload: { value: 2 } } } }
    }
  });
  assert.equal(replacements, 1);
  assert.equal(messages.at(-1).type, 'view_update');
  assert.equal(messages.at(-1).data.payload.value, 2);
});
