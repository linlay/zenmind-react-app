import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeChatAttachmentReferences,
  parseChatAttachmentReferencesJson,
  serializeChatAttachmentReferences,
  createMessageAttachmentsFromReferences,
  getChatAttachmentKind
} from '../../src/features/chatPersistence/chatAttachmentModels.ts';
import {
  createChatSelectionAttachment,
  readSelectedRange
} from '../../src/features/chatPersistence/chatSelectionReference.ts';
import {
  createChatTimelineState,
  applyChatTimelineEvent,
  applyChatTimelineMessage,
  mergeChatTimelineState
} from '../../src/features/chatTimeline/timelineReducer.ts';
import {
  serializeChatTimelineState,
  deserializeChatTimelineState
} from '../../src/features/chatTimeline/timelinePersistence.ts';
import { projectRemoteChatDetail } from '../../src/features/chatPersistence/chatProjector.ts';
const reference = {
  id: 'selection-1',
  type: 'selection',
  text: '  中😀文\ncode()  ',
  annotation: ' 修改这里\n保留原文 ',
  annotationIndex: 3,
  meta: { sourceKind: 'code' }
};
const now = 1_791_430_000_000;

test('selection references bypass file filters and preserve text/comments/number while stripping file capabilities', () => {
  const refs = normalizeChatAttachmentReferences([
    { ...reference, name: 'secret.txt', url: 'https://unrelated.example/file', sha256: 'secret' },
    { ...reference, id: 'selection-2', annotationIndex: 4 }
  ]);
  assert.deepEqual(refs, [reference, { ...reference, id: 'selection-2', annotationIndex: 4 }]);
  assert.deepEqual(parseChatAttachmentReferencesJson(serializeChatAttachmentReferences(refs)), refs);
  assert.equal(getChatAttachmentKind({ kind: 'selection' }), 'selection');
  assert.deepEqual(normalizeChatAttachmentReferences([{ type: 'selection', text: 'only text' }]), [
    { type: 'selection', text: 'only text' }
  ]);
});
test('mixed file replacement remains latest-by-name without collapsing same-name text references', () => {
  const refs = normalizeChatAttachmentReferences([
    { id: 'old', name: 'file.txt', url: '/api/resource?file=old' },
    reference,
    { ...reference, id: 'selection-2' },
    { id: 'new', name: 'file.txt', url: '/api/resource?file=new' }
  ]);
  assert.deepEqual(
    refs.map((ref) => ref.id),
    ['selection-1', 'selection-2', 'new']
  );
  assert.equal(normalizeChatAttachmentReferences([reference, reference]).length, 1);
});
test('native range extraction includes only explicit selected characters and rejects invalid/oversized or split-emoji ranges', () => {
  assert.equal(readSelectedRange('before 中😀文 after', 7, 11), '中😀文');
  assert.equal(readSelectedRange('a😀b', 2, 3), null);
  assert.equal(readSelectedRange('a😀b', 1, 2), null);
  for (const range of [
    [0, 0],
    [-1, 2],
    [0, 99],
    [0, 0.5]
  ])
    assert.equal(readSelectedRange('text', range[0], range[1]), null);
  assert.equal(readSelectedRange('x'.repeat(50_001), 0, 50_001), null);
  assert.equal(readSelectedRange('  x ', 0, 4), '  x ');
});
test('optimistic query, remote echo, history and cold snapshot retain exact selection references and comments', () => {
  const attachments = createMessageAttachmentsFromReferences({
    conversationId: 'chat',
    messageId: 'local',
    references: [reference],
    createdAt: now
  });
  const message = {
    messageId: 'local',
    clientMessageId: 'local',
    serverMessageId: null,
    conversationId: 'chat',
    role: 'user' as const,
    content: 'explain',
    createdAt: now,
    deliveryStatus: 'pending' as const,
    errorReason: null,
    attachments
  };
  let live = applyChatTimelineMessage(createChatTimelineState('chat'), message);
  live = applyChatTimelineEvent(live, 'chat', {
    type: 'request.query',
    requestId: 'local',
    runId: 'run',
    message: 'explain',
    references: [reference],
    timestamp: now
  });
  const history = projectRemoteChatDetail({
    chatId: 'chat',
    events: [
      {
        type: 'request.query',
        requestId: 'local',
        runId: 'run',
        message: 'explain',
        references: [reference],
        timestamp: now
      }
    ]
  });
  assert.ok(history);
  const merged = mergeChatTimelineState(live, history.timelineState);
  const saved = serializeChatTimelineState(merged),
    restored = deserializeChatTimelineState(saved.meta, saved.nodes)!;
  const nodes = Object.values(restored.nodesById).filter((node) => node.kind === 'message' && node.role === 'user');
  assert.equal(nodes.length, 1);
  assert.deepEqual(nodes[0].attachments[0].references[0], reference);
  assert.equal(nodes[0].attachments[0].kind, 'selection');
});
test('created draft quote uses selection kind, stable concrete ID and explicit annotation index', () => {
  const attachment = createChatSelectionAttachment({
    conversationId: 'chat',
    text: 'selected',
    annotation: 'comment',
    annotationIndex: 7,
    sourceKind: 'message'
  });
  assert.equal(attachment.kind, 'selection');
  assert.equal(attachment.status, 'ready');
  assert.equal(attachment.localUri, '');
  assert.equal(attachment.references[0].annotationIndex, 7);
  assert.equal(attachment.references[0].annotation, 'comment');
  assert.ok(attachment.references[0].id?.startsWith('selection-'));
});

test('backend selection normalization may omit client sourceKind without duplicating the optimistic echo', () => {
  const attachments = createMessageAttachmentsFromReferences({
    conversationId: 'chat',
    messageId: 'local',
    references: [reference],
    createdAt: now
  });
  const local = applyChatTimelineMessage(createChatTimelineState('chat'), {
    messageId: 'local',
    clientMessageId: 'local',
    serverMessageId: null,
    conversationId: 'chat',
    role: 'user',
    content: 'explain',
    createdAt: now,
    deliveryStatus: 'pending',
    errorReason: null,
    attachments
  });
  const { meta: _meta, ...confirmed } = reference;
  const echo = applyChatTimelineEvent(local, 'chat', {
    type: 'request.query',
    requestId: 'remote-echo',
    runId: 'run',
    message: 'explain',
    references: [confirmed],
    timestamp: now + 1
  });
  const nodes = Object.values(echo.nodesById).filter((node) => node.kind === 'message' && node.role === 'user');
  assert.equal(nodes.length, 1);
  assert.deepEqual(nodes[0].attachments[0].references, [confirmed]);
});
