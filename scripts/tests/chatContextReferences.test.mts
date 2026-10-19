import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeChatAttachmentReferences,
  createMessageAttachmentsFromReferences,
  serializeChatAttachmentReferences,
  parseChatAttachmentReferencesJson
} from '../../src/features/chatPersistence/chatAttachmentModels.ts';
import {
  createChatContextAttachment,
  assertChatReferenceScope
} from '../../src/features/chatPersistence/chatContextReference.ts';
import { createChatSource, encodeChatSourceId } from '../../src/features/chatPersistence/chatSource.ts';
import { scopeChatPayload, unscopeChatPayload } from '../../src/features/chatRealtime/chatSourcePayload.ts';
import {
  createChatTimelineState,
  applyChatTimelineMessage,
  applyChatTimelineEvent,
  serializeChatTimelineState,
  deserializeChatTimelineState
} from '../../src/features/chatTimeline/index.ts';
const now = 1_791_430_000_000;
const refs = [
  { type: 'chat', id: 'a', name: 'Same', meta: { agentKey: 'agent', updatedAt: now, context: 'original' } },
  { type: 'chat', id: 'b', name: 'Same', meta: { agentKey: 'agent' } },
  { type: 'site', id: 'website:a', name: 'Same', url: 'https://example.com', meta: { kind: 'website', updatedAt: now } }
];
test('typed chat/Site refs keep stable IDs and metadata without file-name deduplication or resource capabilities', () => {
  const normalized = normalizeChatAttachmentReferences([...refs, refs[0], { ...refs[0], name: 'latest' }]);
  assert.deepEqual(normalized, refs);
  assert.deepEqual(parseChatAttachmentReferencesJson(serializeChatAttachmentReferences(normalized)), refs);
  const attachments = createMessageAttachmentsFromReferences({
    conversationId: 'chat',
    messageId: 'query',
    references: refs,
    createdAt: now
  });
  assert.deepEqual(
    attachments.map((item) => item.kind),
    ['chat', 'chat', 'site']
  );
  assert.ok(attachments.every((item) => item.resourceUrl === null && item.localUri === '' && item.status === 'ready'));
  assert.equal(createChatContextAttachment('chat', { type: 'chat', id: 'a', name: 'Same' }).kind, 'chat');
});
test('chat-reference IDs follow source scope while file/selection/Site IDs remain opaque; cross-source/self/Site submission is rejected', () => {
  const source = createChatSource('default', 'ap', 'AP'),
    other = createChatSource('paired', 'desktop', 'Desktop');
  const payload = {
    chatId: 'current',
    references: [
      ...refs,
      { type: 'selection', id: 'selected', text: 'quote' },
      { type: 'file', id: 'a', url: '/api/resource/file' }
    ]
  };
  const scoped = scopeChatPayload(source, payload);
  assert.equal(scoped.references[0].id, encodeChatSourceId(source, 'a'));
  assert.equal(scoped.references[2].id, 'website:a');
  assert.equal(scoped.references[3].id, 'selected');
  assert.equal(scoped.references[4].id, 'a');
  assert.deepEqual(unscopeChatPayload(scoped), payload);
  assert.doesNotThrow(() =>
    assertChatReferenceScope(encodeChatSourceId(source, 'current'), scoped.references.slice(0, 2))
  );
  assert.throws(
    () => assertChatReferenceScope(encodeChatSourceId(other, 'current'), scoped.references.slice(0, 2)),
    /another source/
  );
  assert.throws(() => assertChatReferenceScope('a', [refs[0]]), /itself/);
  assert.throws(() => assertChatReferenceScope('current', [refs[2]]), /unavailable/);
});
test('backend-enriched context metadata/title does not duplicate local echo and survives cold rich snapshot', () => {
  const attachments = createMessageAttachmentsFromReferences({
    conversationId: 'chat',
    messageId: 'local',
    references: [refs[0]],
    createdAt: now
  });
  const local = applyChatTimelineMessage(createChatTimelineState('chat'), {
    messageId: 'local',
    clientMessageId: 'local',
    serverMessageId: null,
    conversationId: 'chat',
    role: 'user',
    content: 'question',
    attachments,
    createdAt: now,
    deliveryStatus: 'pending',
    errorReason: null
  });
  const confirmed = { ...refs[0], name: 'Renamed', meta: { ...refs[0].meta, context: 'updated server context' } };
  const echo = applyChatTimelineEvent(local, 'chat', {
    type: 'request.query',
    requestId: 'remote-echo',
    runId: 'run',
    message: 'question',
    references: [confirmed],
    timestamp: now + 1
  });
  const rows = serializeChatTimelineState(echo),
    restored = deserializeChatTimelineState(rows.meta, rows.nodes)!;
  const nodes = Object.values(restored.nodesById).filter((node) => node.kind === 'message' && node.role === 'user');
  assert.equal(nodes.length, 1);
  assert.deepEqual(nodes[0].attachments[0].references, [confirmed]);
});

test('a rejected context query restores editable text and references; success clears them and stale responses leave the next chat alone', async () => {
  const source = ts.createSourceFile(
    'controller.ts',
    readFileSync(
      new URL('../../src/features/chatPersistence/useChatDetailConversationController.ts', import.meta.url),
      'utf8'
    ),
    ts.ScriptTarget.Latest,
    true
  );
  let callback: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(source) === 'handleSend' &&
      node.initializer &&
      ts.isCallExpression(node.initializer)
    )
      callback = node.initializer.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(callback);
  const code = ts.transpileModule(`(${callback.getText(source)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText;
  for (const result of ['rejected', 'success', 'stale']) {
    const attachment = createChatContextAttachment('chat', { type: 'chat', id: 'other', name: 'Same' });
    const state = {
      draft: 'question',
      attachments: [attachment],
      editing: true,
      skills: ['skill'],
      error: '',
      sending: false
    };
    const active = { current: 'chat' };
    const send = vm.runInNewContext(code, {
      agentAvailability: 'available',
      pendingSteer: null,
      draft: state.draft,
      readyAttachments: state.attachments,
      composerAttachments: state.attachments,
      sendingRef: { current: false },
      reaskInFlightRef: { current: false },
      sendRequestIdRef: { current: 0 },
      hasObservedPendingSendRef: { current: false },
      activeConversationIdRef: active,
      conversationId: 'chat',
      inputReady: true,
      hasBlockedFiles: false,
      settings: { modelConfigSaving: false },
      captureSubmission() { return () => {}; },
      submitAccessLevel: 'default',
      submitModel: {},
      accessLevel: 'default',
      modelOverride: null,
      effectivePlanModeEnabled: false,
      editingModeAvailable: true,
      effectiveEditingModeEnabled: true,
      selectedSkills: state.skills,
      __DEV__: false,
      isChatConversationDiagnosticCommand: () => false,
      shouldApplyChatDetailAsyncResult: (input: any) =>
        input.activeConversationId === input.targetConversationId && input.currentRequestId === input.requestId,
      setDraft: (value: string) => {
        state.draft = value;
      },
      setErrorText: (value: string) => {
        state.error = value;
      },
      setSending: (value: boolean) => {
        state.sending = value;
      },
      setEditingModeEnabled: (value: boolean) => {
        state.editing = value;
      },
      setSkillSelection: () => {
        state.skills = [];
      },
      clearAttachments: () => {
        state.attachments = [];
      },
      t: () => 'Replace or remove the reference',
      Error,
      chatSyncService: {
        sendMessage: async (_id: string, text: string, attachments: any[], options: any) => {
          assert.equal(options.dispatchErrorMode, 'return');
          assert.equal(text, 'question');
          assert.equal(attachments[0], attachment);
          if (result === 'stale') {
            active.current = 'next';
            state.draft = 'next draft';
            state.attachments = [];
          }
          return { dispatchError: result === 'success' ? null : new Error('Reference no longer accessible') };
        }
      }
    });
    await send();
    if (result === 'rejected') {
      assert.equal(state.draft, 'question');
      assert.equal(state.attachments[0], attachment);
      assert.match(state.error, /Replace or remove.*Reference no longer accessible/);
      assert.equal(state.sending, false);
      assert.equal(state.editing, true);
      assert.deepEqual(state.skills, ['skill']);
    } else if (result === 'success') {
      assert.equal(state.draft, '');
      assert.deepEqual(state.attachments, []);
      assert.equal(state.editing, false);
    } else {
      assert.equal(state.draft, 'next draft');
      assert.equal(state.error, '');
    }
  }
});
