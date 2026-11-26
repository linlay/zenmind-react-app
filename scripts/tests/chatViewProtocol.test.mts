import assert from 'node:assert/strict';
import test from 'node:test';
import { readChatViewReference } from '../../src/core/api/services/chatViewProtocol.ts';
import { buildChatViewDocumentHtml } from '../../src/features/chatPersistence/conversationViewport/viewDocumentHtml.ts';
import { createConversationViewportDocumentStore } from '../../src/features/chatPersistence/conversationViewport/viewportDocumentStore.ts';
import { applyChatTimelineEvent, createChatTimelineState } from '../../src/features/chatTimeline/timelineReducer.ts';
import {
  deserializeChatTimelineState,
  serializeChatTimelineState
} from '../../src/features/chatTimeline/timelinePersistence.ts';
const view = {
  source: 'connector' as const,
  connectorId: 'crm',
  key: 'result',
  hash: 'a'.repeat(64),
  renderer: 'html' as const
};
test('VIEW reference pins valid hash and rejects paths and malformed hashes', () => {
  assert.deepEqual(readChatViewReference(view), view);
  assert.equal(readChatViewReference({ ...view, connectorId: '../crm' }), undefined);
  assert.equal(readChatViewReference({ ...view, hash: 'latest' }), undefined);
});
test('VIEW bundles declared resources and constrains network, forms, base and frames', () => {
  const html = buildChatViewDocumentHtml(
    {
      view,
      html: '<html><head><base href="https://example.com"><meta http-equiv="refresh" content="0;url=https://example.com"><link rel="stylesheet" href="style.css"></head><body><img src="../assets/p.png"><img src="https://example.com/p.png"><script src="main.js"></script></body></html>',
      assets: [
        { path: 'assets/p.png', mediaType: 'image/png', data: 'YWJj' },
        { path: 'views/main.js', mediaType: 'text/javascript', data: 'YWJj' },
        {
          path: 'views/style.css',
          mediaType: 'text/css',
          data: Buffer.from('p{background:url(../assets/p.png)}').toString('base64')
        }
      ]
    },
    'display'
  );
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /data:image\/png;base64,YWJj/);
  assert.match(html, /<script[^>]*>abc<\/script>/);
  assert.doesNotMatch(html, /example.com|<base|http-equiv="refresh"/);
});
test('QLC provides a JSON fallback; display mode cannot submit; form collects only on host request', () => {
  const document = { view: { ...view, renderer: 'qlc' as const }, qlc: { title: '<script>bad</script>' } };
  const display = buildChatViewDocumentHtml(document, 'display');
  assert.doesNotMatch(display, /frontend_awaiting_submit/);
  assert.match(display, /&lt;script&gt;/);
  const form = buildChatViewDocumentHtml(document, 'form');
  assert.match(form, /awaiting_collect/);
  assert.match(form, /JSON object required/);
  assert.throws(
    () => buildChatViewDocumentHtml({ ...document, html: '大'.repeat(256 * 1024) }, 'display'),
    /safety limit/
  );
});
test('VIEW tool and single Form references retain identity through replay and SQLite serialization', () => {
  let state = createChatTimelineState('chat');
  state = applyChatTimelineEvent(state, 'chat', {
    type: 'tool.result',
    toolId: 'tool',
    runId: 'run',
    view,
    result: { value: 1 },
    timestamp: 1791400000000
  });
  state = applyChatTimelineEvent(state, 'chat', {
    type: 'awaiting.ask',
    awaitingId: 'ask',
    runId: 'run',
    mode: 'form',
    view,
    form: { data: { value: 1 } },
    timestamp: 1791400000001
  });
  const serialized = serializeChatTimelineState(state);
  const restored = deserializeChatTimelineState(serialized.meta, serialized.nodes)!;
  assert.deepEqual(restored.awaiting?.interactive?.view, view);
  assert.deepEqual((restored.nodesById[restored.orderedNodeIds[0]] as any).view, view);
});
test('clearing a cache while an old response is pending cannot overwrite a new same-key load', async () => {
  const responses: ((value: { html: string }) => void)[] = [];
  const store = createConversationViewportDocumentStore(() => new Promise((resolve) => responses.push(resolve)));
  const first = store.load('fixed-hash');
  const firstRejected = assert.rejects(first, /released/);
  store.clear();
  const second = store.load('fixed-hash');
  responses[1]({ view, html: 'new' });
  assert.equal((await second).html, 'new');
  responses[0]({ view, html: 'obsolete' });
  await firstRejected;
  assert.equal(store.getCached('fixed-hash')?.html, 'new');
});
test('a force refresh cannot let an older fixed-hash response replace the cache', async () => {
  const responses: ((value: { html: string }) => void)[] = [];
  const store = createConversationViewportDocumentStore(() => new Promise((resolve) => responses.push(resolve)));
  const first = store.load('chat-a:member-a:hash');
  const second = store.load('chat-a:member-a:hash', { force: true });
  responses[1]({ view, html: 'new' });
  await second;
  responses[0]({ view, html: 'old' });
  await first;
  assert.equal(store.getCached('chat-a:member-a:hash')?.html, 'new');
  assert.equal(store.getCached('chat-a:member-b:hash'), null);
});
