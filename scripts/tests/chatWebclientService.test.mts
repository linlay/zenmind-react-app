import { readChatViewReference } from '../../src/core/api/services/chatViewProtocol.ts';
import { readAwaitingSubmitParam, buildSubmitAwaitingPayload } from '../../src/core/api/services/chatApi.ts';
import * as derivationProtocol from '../../src/core/api/services/chatDerivationProtocol.ts';
import * as derivationState from '../../src/features/chatTimeline/timelineRunDerivation.ts';
import { encodeChatSourceId, createChatSource } from '../../src/features/chatPersistence/chatSource.ts';
import * as feedbackState from '../../src/features/chatTimeline/timelineRunFeedback.ts';
import * as feedbackProtocol from '../../src/core/api/services/chatFeedbackProtocol.ts';
import { assertChatReferenceScope } from '../../src/features/chatPersistence/chatContextReference.ts';
import * as runAccess from '../../src/features/chatTimeline/timelineRunAccess.ts';
import * as skillsProtocol from '../../src/core/api/services/chatSkillsProtocol.ts';
import assert from 'node:assert/strict';
import { ApiError } from '../../src/core/api/apiError.ts';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { normalizeChatAttachmentReferences, createMessageAttachmentsFromReferences } from '../../src/features/chatPersistence/chatAttachmentModels.ts';
import * as reducer from '../../src/features/chatTimeline/timelineReducer.ts';
import { getLatestFailedChatSubmission, getRecoverableChatSubmission } from '../../src/features/chatRealtime/chatSubmissionRecovery.ts';
import { formatChatTimelinePlatformErrorForDisplay } from '../../src/features/chatTimeline/timelinePlatformError.ts';
import { deserializeChatTimelineState, serializeChatTimelineState } from '../../src/features/chatTimeline/timelinePersistence.ts';
import { projectRemoteChatDetail } from '../../src/features/chatPersistence/chatProjector.ts';
import { projectTimelineMessages } from '../../src/features/chatTimeline/messageProjection.ts';
import { buildChatTimelineDisplayItems } from '../../src/features/chatTimeline/index.ts';
import { buildChatRunOwnerPayload } from '../../src/core/api/services/chatRunOwner.ts';
import {
  buildAgentModelConfigPayload,
  normalizeModelOptionsAgentKey,
  readAgentModelOverride
} from '../../src/core/api/services/modelOptionsProtocol.ts';
import { hasValidAgentInteraction, resolveAgentInteraction } from '../../src/features/chatPersistence/agentInteraction.ts';
import {
  canContinueChatTimeline,
  hasEstablishedChatQuery
} from '../../src/features/chatPersistence/chatDetailViewModel.ts';

const source = ts.createSourceFile(
  'chatSyncService.ts',
  readFileSync(new URL('../../src/features/chatRealtime/chatSyncService.ts', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest,
  true
);
const declaration = source.statements.find(
  (node) => ts.isClassDeclaration(node) && node.name?.text === 'ChatSyncService'
)!;
const compiled = ts.transpileModule(
  `${declaration.getText(source)}; new ChatSyncService({key:'cloud',kind:'default'}, async()=>({namespace:'ap'}))`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
).outputText;
function fixture(extra: Record<string, unknown> = {}) {
  const service = vm.runInNewContext(compiled, {
    ...reducer,
    getRecoverableChatSubmission,
    getLatestFailedChatSubmission,
    formatChatTimelinePlatformErrorForDisplay,
    ApiError,
    capabilities,
    getCloudAuthSnapshot: () => ({ status: 'available', generation: 1 }),
    getChatCacheScopeId: () => 'cloud_scope',
    reportCloudFailure() {},
    classifyCloudFailure: () => 'network_error',
    getActiveChatSource: () => service.source,
    ...skillsProtocol,
    ...runAccess,
    ...derivationProtocol,
    ...derivationState,
    encodeChatSourceId,
    ...feedbackState,
    ...feedbackProtocol,
    CHAT_ACCESS_LEVEL_TRANSPORT_TYPE: '/api/access-level',
    normalizeChatAttachmentReferences,
    createMessageAttachmentsFromReferences,
    assertChatReferenceScope,
    CHAT_SUMMARIES_TRANSPORT_TYPE: '/api/chats',
    REMOTE_CHAT_PAGE_SIZE: 10,
    buildChatSummariesPayload: (lastRunId?: string) => ({ limit: 10, ...(lastRunId ? { lastRunId } : {}) }),
    CHAT_STEER_TRANSPORT_TYPE: '/api/steer',
    projectRemoteChatDetail,
    projectTimelineMessages,
    buildChatRunOwnerPayload,
    buildAgentModelConfigPayload,
    normalizeModelOptionsAgentKey,
    readAgentModelOverride,
    hasValidAgentInteraction,
    resolveAgentInteraction,
    canContinueChatTimeline,
    hasEstablishedChatQuery,
    toText: (value: unknown) => String(value || '').trim(),
    isPlainRecord: (value: unknown) => !!value && typeof value === 'object' && !Array.isArray(value),
    getChatTimelineActiveRunId: (state: any) => state.activeRunId,
    buildInterruptChatPayload: (value: unknown) => value,
    createRunControlRequestId: () => 'interrupt-operation',
    CHAT_INTERRUPT_TRANSPORT_TYPE: '/api/interrupt',
    STOPPING_CONVERSATION_TTL_MS: 8000,
    UNAVAILABLE_ATTACH_RUN_TTL_MS: 120000,
    getRemoteChatSourceId: (value: string) => value,
    isAccountDesktopChatSource: () => false,
    buildFallbackSummary: () => null,
    getConversationDetail: async () => null,
    markConversationDirty: async () => {},
    markConversationSynced: async () => {},
    persistConversationTimelineState: async () => {},
    isDuplicateObserveError: () => false,
    isMissingAgentKeyError: () => false,
    isInactiveRunError: () => false,
    getChatSourceFromId: () => ({ kind: 'default' }),
    normalizeChatReadState: () => ({ isRead: true }),
    setTimeout,
    clearTimeout,
    Error,
    Promise,
    Date,
    ...extra
  }) as any;
  service.ensureAgentDetail = async () => ({ raw: { interactionConfig: capabilities } });
  service.status = 'connected';
  return service;
}
const capabilities = {
  model: true,
  accessLevel: true,
  connectors: true,
  showPlanningMode: true,
  showEditingMode: true,
  attachment: { localFiles: true, chatRecords: true, skills: true, kbases: true }
};
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const now = 1_791_400_000_000;
function active() {
  return reducer.applyChatTimelineEvent(reducer.createChatTimelineState('chat'), 'chat', {
    type: 'run.start',
    runId: 'run',
    timestamp: now
  });
}

test('stop singleflights Team interrupt and never invents a cancelled run on rejection or timeout', async () => {
  for (const rejection of [false, true]) {
    const service = fixture();
    service.timelineStates.set('chat', active());
    let requests = 0,
      reconciles = 0,
      finish!: (value: unknown) => void,
      fail!: (error: Error) => void;
    service.resolveRunControlScope = async () => ({ agentKey: 'team' });
    service.requestChatApi = async (_type: string, payload: any) => {
      requests++;
      assert.equal(payload.agentKey, 'team');
      return new Promise((resolve, reject) => {
        finish = resolve;
        fail = reject;
      });
    };
    service.scheduleConversationReconcile = async () => {
      reconciles++;
    };
    service.stopStreaming('chat');
    service.stopStreaming('chat');
    await flush();
    assert.equal(requests, 1);
    assert.equal(service.getConversationTimelineState('chat').activeRunId, 'run');
    rejection ? fail(new Error('timeout')) : finish({ accepted: false, status: 'rejected' });
    await flush();
    assert.equal(reconciles, 1);
    assert.equal(service.getConversationTimelineState('chat').activeRunId, 'run');
    assert.equal(service.stoppingConversations.size, 0);
  }
});
test('Agent errors are retryable and concurrent refreshes issue one request', async () => {
  const service = fixture();
  delete service.ensureAgentDetail;
  let calls = 0;
  service.fetchAgentDetail = async (key: string) => {
    calls++;
    if (calls === 1) throw new Error('offline');
    const detail = { agentKey: key, fetchedAt: Date.now() };
    service.agentDetails.set(key, detail);
    return detail;
  };
  const first = service.ensureAgentDetail('agent');
  const second = service.ensureAgentDetail('agent');
  assert.equal(await first, null);
  assert.equal(await second, null);
  assert.equal(calls, 1);
  assert.ok(await service.ensureAgentDetail('agent'));
  assert.equal(calls, 2);
  await service.ensureAgentDetail('agent');
  assert.equal(calls, 2);
});
test('serialized model saves respect server normalization and cache generation', async () => {
  const calls: any[] = [];
  const completions: ((value: unknown) => void)[] = [];
  const service = fixture({
    updateAgentModelConfigApi: async (_key: string, model: any) => {
      calls.push(model);
      return new Promise((resolve) => completions.push(resolve));
    }
  });
  const catalog = { models: [], reasoningEfforts: [], serviceTiers: [], fetchedAt: 1 };
  service.agentModelOptions.set('agent', catalog);
  service.agentDetails.set('agent', { agentKey: 'agent', raw: { modelKey: 'old' } });
  const first = service.updateAgentModelConfig('agent', { key: 'first' });
  const second = service.updateAgentModelConfig('agent', { key: 'second', serviceTier: 'STANDARD' });
  await flush();
  assert.equal(calls.length, 1);
  completions[0]({ modelKey: 'normalized-first', reasoningEffort: 'MAX' });
  await first;
  await flush();
  assert.equal(calls.length, 2);
  completions[1]({ modelKey: 'normalized-second', serviceTier: null });
  assert.equal((await second).key, 'normalized-second');
  assert.equal(service.getAgentDetailSnapshot('agent').raw.modelKey, 'normalized-second');
  assert.equal(service.getAgentDetailSnapshot('agent').raw.serviceTier, 'STANDARD');
  assert.equal(service.getAgentModelOptionsSnapshot('agent'), catalog);
  const third = service.updateAgentModelConfig('agent', { key: 'obsolete' });
  await flush();
  service.agentDetailCacheVersion++;
  completions[2]({ modelKey: 'obsolete' });
  await third;
  assert.equal(service.getAgentDetailSnapshot('agent').raw.modelKey, 'normalized-second');
});
test('awaiting submission cannot issue a request after a newer interaction replaces it during owner lookup', async () => {
  const service = fixture();
  let release!: (value: any) => void;
  let calls = 0;
  const ask = (id: string) =>
    reducer.applyChatTimelineEvent(active(), 'chat', {
      type: 'awaiting.ask',
      runId: 'run',
      awaitingId: id,
      mode: 'question',
      questions: [{ id: 'q1', type: 'text', question: 'Continue?' }],
      timestamp: now + 1
    });
  service.timelineStates.set('chat', ask('old'));
  service.assertConversationWritable = async () => null;
  service.resolveRunControlScope = () => new Promise((resolve) => (release = resolve));
  service.requestChatApi = async () => {
    calls++;
    return { accepted: true };
  };
  const request = service.submitAwaiting('chat', { runId: 'run', awaitingId: 'old', params: [] });
  await flush();
  service.timelineStates.set('chat', ask('new'));
  release({ agentKey: 'team' });
  await assert.rejects(request, /changed/);
  assert.equal(calls, 0);
  assert.equal(service.getConversationTimelineState('chat').awaiting.awaitingId, 'new');
});
test('delayed detail preserves live awaiting and increments that arrive during database persistence', async () => {
  let respond!: (value: any) => void, commit!: () => void;
  const service = fixture({ reconcileConversationDetail: () => new Promise<void>((resolve) => (commit = resolve)) });
  service.timelineStates.set('chat', active());
  service.activeConversationId = null;
  service.getChatDetailViaTransport = () => new Promise((resolve) => (respond = resolve));
  service.emitHomePatchFromConversation = async () => {};
  service.emitConversationRuntimeState = () => {};
  service.emit = () => {};
  service.scheduleTimelinePersist = () => {};
  const reconcile = service.runConversationReconcile('chat', 'reconcile');
  await flush();
  const withAsk = reducer.applyChatTimelineEvent(service.getConversationTimelineState('chat'), 'chat', {
    type: 'awaiting.ask',
    runId: 'run',
    awaitingId: 'new',
    mode: 'question',
    timestamp: now + 2
  });
  service.timelineStates.set('chat', withAsk);
  respond({
    chatId: 'chat',
    awaiting: null,
    canContinue: true,
    events: [{ type: 'run.start', runId: 'run', timestamp: now }]
  });
  await flush();
  assert.equal(service.getConversationTimelineState('chat').awaiting.awaitingId, 'new');
  const live = reducer.applyChatTimelineEvent(service.getConversationTimelineState('chat'), 'chat', {
    type: 'content.delta',
    runId: 'run',
    contentId: 'a',
    delta: 'live',
    timestamp: now + 3
  });
  service.timelineStates.set('chat', live);
  commit();
  await reconcile;
  assert.equal(service.getConversationTimelineState('chat'), live);
});
test('a detail response after service reset cannot write to the new namespace', async () => {
  let respond!: (value: any) => void;
  let writes = 0;
  const service = fixture({
    reconcileConversationDetail: async () => {
      writes++;
    }
  });
  service.getChatDetailViaTransport = () => new Promise((resolve) => (respond = resolve));
  const reconcile = service.runConversationReconcile('chat', 'reconcile');
  await flush();
  service.lifecycleVersion++;
  respond({ chatId: 'chat', events: [] });
  await reconcile;
  assert.equal(writes, 0);
  assert.equal(service.timelineStates.size, 0);
});
test('stream sequence deduplicates across query/attach, permits filtered jumps and isolates runs', async () => {
  const events: any[] = [];
  const service = fixture({
    normalizeEventType: (type: string) => type,
    extractConversationId: (event: any) => event.chatId,
    classifyChatProtocolEvent: () => 'assistant_content'
  });
  service.handleAssistantContentEvent = async (event: any) => {
    events.push(event);
  };
  for (const [runId, seq] of [
    ['run', 1],
    ['run', 7],
    ['run', 7],
    ['run', 3],
    ['other', 1]
  ])
    await service.handlePushEvent({ type: 'content.delta', chatId: 'chat', runId, seq }, 'stream');
  assert.deepEqual(
    events.map((event) => [event.runId, event.seq]),
    [
      ['run', 1],
      ['run', 7],
      ['other', 1]
    ]
  );
});
test('three attach failures exhaust one recovery cycle; explicit refresh allows a new cycle', async () => {
  let attempts = 0;
  const callbacks: any[] = [];
  const service = fixture({
    getConversationSyncState: async () => ({ activeRunId: 'run' }),
    normalizeAttachLastSeq: (value: number) => value,
    unscopeChatPayload: (value: unknown) => value,
    attachChatRun: async (options: any) => {
      attempts++;
      callbacks.push(options);
      return { abort: () => {} };
    }
  });
  service.activeConversationId = 'chat';
  service.resolveRunControlScope = async () => ({ agentKey: 'team' });
  service.scheduleConversationReconcile = async () => {};
  service.handleStreamSideError = async () => {};
  for (let i = 0; i < 3; i++) {
    await service.attachActiveConversationRun('chat', 'attach');
    callbacks[i].onError(new Error('offline'));
  }
  await service.attachActiveConversationRun('chat', 'attach');
  assert.equal(attempts, 3);
  await service.reconcileConversation('chat', 'manual_refresh');
  await service.attachActiveConversationRun('chat', 'attach');
  assert.equal(attempts, 4);
});
test('empty continuation needs authority and established history, singleflights and creates no empty transcript row', async () => {
  let created = 0,
    release!: () => void;
  const emitted: any[] = [];
  const service = fixture({
    createOutgoingMessage: async (conversationId: string, content: string, attachments: any[], options: any) => {
      created++;
      assert.equal(options.continuation, true);
      return {
        clientMessageId: 'operation',
        createdAt: now,
        message: { messageId: 'empty', conversationId, role: 'user', content, attachments, createdAt: now }
      };
    }
  });
  service.assertConversationWritable = async () => null;
  service.resolveRunControlScope = async () => ({ agentKey: 'team' });
  service.emit = (event: any) => emitted.push(event);
  service.dispatchOutgoingMessage = () => new Promise<void>((resolve) => (release = resolve));
  await assert.rejects(service.sendMessage('chat', '', [], { continuation: true }), /not permitted/);
  assert.equal(created, 0);
  let state = reducer.applyChatTimelineEvent(active(), 'chat', {
    type: 'run.error',
    runId: 'run',
    error: 'failed',
    timestamp: now + 1
  });
  state = { ...state, canContinue: true };
  service.timelineStates.set('chat', state);
  const first = service.sendMessage('chat', '', [], { continuation: true });
  await flush();
  await assert.rejects(service.sendMessage(' chat ', '', [], { continuation: true }), /already being sent/);
  assert.equal(created, 1);
  assert.equal(emitted.length, 0);
  release();
  await first;
  const hidden = reducer.applyChatTimelineMessage(state, {
    messageId: 'empty',
    conversationId: 'chat',
    role: 'user',
    content: '',
    attachments: [],
    createdAt: now,
    clientMessageId: 'operation',
    serverMessageId: null,
    deliveryStatus: 'pending',
    streamStatus: 'done'
  });
  assert.equal(hidden, state);
});
test('old history pages retain completed tool nodes and current live nodes', async () => {
  const service = fixture({ reconcileConversationDetail: async () => {} });
  const current = reducer.applyChatTimelineEvent(active(), 'chat', {
    type: 'tool.result',
    toolId: 'recent',
    runId: 'run',
    result: 'recent',
    timestamp: now + 2
  });
  service.timelineStates.set('chat', current);
  service.getChatDetailViaTransport = async () => ({
    chatId: 'chat',
    awaiting: null,
    events: [{ type: 'tool.result', toolId: 'older', runId: 'older-run', result: 'older', timestamp: now - 10 }]
  });
  service.emitConversationRuntimeState = () => {};
  service.emitHomePatchFromConversation = async () => {};
  service.emit = () => {};
  await service.runConversationReconcile('chat', 'reconcile', 5);
  const nodes = Object.values(service.getConversationTimelineState('chat').nodesById) as any[];
  assert.equal(nodes.filter((node) => node.kind === 'tool').length, 2);
  assert.equal(service.getConversationTimelineState('chat').activeRunId, 'run');
});

test('uncertain awaiting submission reconciles authority and terminal rejection cannot clear a newer ask', async () => {
  for (const timeout of [false, true]) {
    const service = fixture({
      CHAT_SUBMIT_TRANSPORT_TYPE: '/api/submit',
      buildSubmitAwaitingPayload: (value: unknown) => value,
      createAwaitingSubmitId: () => 'submit'
    });
    const ask = (id: string) =>
      reducer.applyChatTimelineEvent(active(), 'chat', {
        type: 'awaiting.ask',
        runId: 'run',
        awaitingId: id,
        mode: 'question',
        questions: [{ id: 'q1', type: 'text', question: 'Continue?' }],
        timestamp: now + 1
      });
    service.timelineStates.set('chat', ask('old'));
    service.assertConversationWritable = async () => null;
    service.resolveRunControlScope = async () => ({ agentKey: 'team' });
    service.requestChatApi = async () => {
      if (timeout) throw new Error('timeout');
      return { accepted: false, status: 'expired' };
    };
    let reconciles = 0;
    service.scheduleConversationReconcile = async () => {
      reconciles++;
      service.timelineStates.set('chat', ask('new'));
    };
    const submission = service.submitAwaiting('chat', { runId: 'run', awaitingId: 'old', params: [] });
    if (timeout) await assert.rejects(submission, /timeout/);
    else await submission;
    assert.equal(reconciles, 1);
    assert.equal(service.getConversationTimelineState('chat').awaiting.awaitingId, 'new');
  }
});

test('request boundary refuses a response from a previous source lifecycle', async () => {
  let respond!: (value: unknown) => void;
  const service = fixture({
    requestChatTransport: () => new Promise((resolve) => (respond = resolve)),
    unscopeChatPayload: (value: unknown) => value,
    unwrapChatApiEnvelope: (value: unknown) => value,
    scopeChatPayload: () => {
      throw new Error('must not scope stale response');
    },
    CHAT_DETAIL_TRANSPORT_TYPE: '/api/chat'
  });
  const request = service.requestChatApi('/api/chat', {});
  await flush();
  service.lifecycleVersion++;
  respond({ chatId: 'chat' });
  await assert.rejects(request, /source changed/);
});

function steerFixture() {
  const service = fixture();
  service.ensureAgentDetail = async () => ({ raw: { interactionConfig: capabilities } });
  service.status = 'connected';
  service.timelineStates.set('chat', active());
  service.assertConversationWritable = async () => null;
  service.resolveRunControlScope = async () => ({ agentKey: 'team' });
  service.scheduleConversationReconcile = async () => {};
  return service;
}

test('steer uses stable Team/run identity, single submission, and accepted is not a confirmed message', async () => {
  const service = steerFixture();
  let resolve!: (value: unknown) => void;
  let requests = 0;
  service.requestChatApi = async (type: string, payload: any) => {
    requests++;
    assert.equal(type, '/api/steer');
    assert.equal(payload.agentKey, 'team');
    assert.equal(payload.requestId, payload.steerId);
    assert.equal(payload.runId, 'run');
    return new Promise((done) => (resolve = done));
  };
  const submission = service.steerConversation('chat', 'retain input');
  await flush();
  await assert.rejects(service.steerConversation('chat', 'duplicate'), /awaiting confirmation/);
  resolve({ accepted: true });
  await submission;
  assert.equal(requests, 1);
  assert.equal(service.getPendingSteer('chat').phase, 'accepted');
  assert.equal(
    Object.values(service.getConversationTimelineState('chat').nodesById).filter((node: any) => node.kind === 'message')
      .length,
    0
  );
});

test('steer event before response wins even before UI flush and duplicate echo stays one command', async () => {
  for (const accepted of [true, false]) {
    const service = steerFixture();
    let resolve!: (value: unknown) => void;
    service.requestChatApi = () => new Promise((done) => (resolve = done));
    const submission = service.steerConversation('chat', 'guidance');
    await flush();
    const pending = service.getPendingSteer('chat');
    const event = {
      type: 'request.steer',
      runId: 'run',
      steerId: pending.steerId,
      message: 'guidance',
      timestamp: now + 1
    };
    const confirmed = reducer.applyChatTimelineEvent(active(), 'chat', event);
    service.timelineStates.set('chat', confirmed);
    resolve({ accepted });
    const result = await submission;
    assert.equal(result.accepted, true);
    assert.equal(service.getPendingSteer('chat'), null);
    assert.equal(reducer.applyChatTimelineEvent(confirmed, 'chat', event), confirmed);
  }
});

test('steer rejection retains input; timeout retains unknown without retry and explicit restore preserves attachments', async () => {
  const reference = { type: 'file', name: 'note.txt', url: '/api/resource/file' };
  const attachment = {
    attachmentId: 'a',
    conversationId: 'chat',
    status: 'ready',
    name: 'note.txt',
    references: [reference]
  } as any;
  for (const timeout of [true, false]) {
    const service = steerFixture();
    let requests = 0;
    service.requestChatApi = async () => {
      requests++;
      if (timeout) throw new Error('timeout');
      return { accepted: false, detail: 'rejected' };
    };
    const submission = service.steerConversation('chat', '', [attachment]);
    if (timeout) {
      await assert.rejects(submission, /timeout/);
      assert.equal(service.getPendingSteer('chat').phase, 'unknown');
      await assert.rejects(service.steerConversation('chat', 'retry'), /awaiting confirmation/);
      const restored = service.restorePendingSteer('chat');
      assert.equal(restored.message, '');
      assert.equal(restored.attachments[0], attachment);
    } else {
      assert.equal((await submission).accepted, false);
      assert.equal(service.getPendingSteer('chat'), null);
    }
    assert.equal(requests, 1);
    assert.equal(attachment.references[0], reference);
  }
});

test('steer run change during owner lookup sends nothing; ended unconfirmed runs are retained and never become query', async () => {
  const service = steerFixture();
  let owner!: (value: unknown) => void;
  let requests = 0;
  service.resolveRunControlScope = () => new Promise((done) => (owner = done));
  service.requestChatApi = async () => {
    requests++;
    return { accepted: true };
  };
  const submission = service.steerConversation('chat', 'retained');
  await flush();
  const ended = reducer.applyChatTimelineEvent(active(), 'chat', {
    type: 'run.complete',
    runId: 'run',
    timestamp: now + 1
  });
  service.timelineStates.set('chat', ended);
  owner({ agentKey: 'team' });
  await assert.rejects(submission, /changed/);
  assert.equal(requests, 0);
  assert.equal(service.getPendingSteer('chat'), null);
  service.resolveRunControlScope = async () => ({ agentKey: 'team' });
  service.timelineStates.set('chat', active());
  await service.steerConversation('chat', 'accepted');
  service.timelineStates.set('chat', ended);
  service.emitConversationTimelineState('chat', 'reconcile', ended);
  assert.equal(service.getPendingSteer('chat').runEnded, true);
  assert.equal(service.getPendingSteer('chat').phase, 'accepted');
  assert.equal(requests, 1);
  service.activeConversationId = 'other';
  assert.equal(service.getPendingSteer('chat').message, 'accepted');
});

test('steer namespace cleanup releases pending state and refuses a late response', async () => {
  const service = steerFixture();
  let resolve!: (value: unknown) => void;
  service.requestChatApi = () => new Promise((done) => (resolve = done));
  const request = service.steerConversation('chat', 'old');
  await flush();
  service.lifecycleVersion++;
  service.clearTransientWork();
  resolve({ accepted: true });
  await request;
  assert.equal(service.pendingSteers.size, 0);
});

test('Agent steering uses the conversation owner and requires an executable detail', async () => {
  for (const available of [true, false]) {
    const service = steerFixture();
    service.resolveRunControlScope = async () => ({ agentKey: 'owner' });
    service.ensureAgentDetail = async () =>
      available ? { raw: { mode: 'CODER', interactionConfig: capabilities } } : null;
    let requests = 0;
    service.requestChatApi = async (_type: string, payload: any) => {
      requests++;
      assert.equal(payload.agentKey, 'owner');
      return { accepted: true };
    };
    const request = service.steerConversation('chat', 'guide');
    if (available) await request;
    else {
      await assert.rejects(request, /execution/);
      assert.equal(service.getPendingSteer('chat'), null);
    }
    assert.equal(requests, available ? 1 : 0);
  }
});

test('a steer echo from a different owner cannot confirm the pending operation', async () => {
  const service = steerFixture();
  service.requestChatApi = async () => ({ accepted: true });
  await service.steerConversation('chat', 'guide');
  const pending = service.getPendingSteer('chat');
  const source = fixture({
    normalizeEventType: (type: string) => type,
    extractConversationId: (event: any) => event.chatId
  });
  source.pendingSteers.set('chat', pending);
  source.timelineStates.set('chat', active());
  await source.handlePushEvent(
    {
      type: 'request.steer',
      chatId: 'chat',
      runId: 'run',
      steerId: pending.steerId,
      agentKey: 'other',
      message: 'guide'
    },
    'stream'
  );
  assert.equal(source.getPendingSteer('chat'), pending);
  assert.equal(source.getConversationTimelineState('chat').orderedNodeIds.length, 1);
});

test('an empty steer echo confirms only the matching owner, Run and request without a message node', async () => {
  const service = fixture({
    normalizeEventType: (type: string) => type,
    extractConversationId: (event: any) => event.chatId,
    classifyChatProtocolEvent: () => 'heartbeat'
  });
  const pending = { steerId: 'continue', runId: 'run', agentKey: 'root', message: '', phase: 'accepted' };
  service.pendingSteers.set('chat', pending);
  const event = {
    type: 'request.steer',
    chatId: 'chat',
    runId: 'run',
    agentKey: 'root',
    steerId: 'continue',
    requestId: 'continue',
    message: '',
    role: 'user'
  };
  for (const mismatch of [{ agentKey: 'other' }, { runId: 'other' }, { steerId: 'other' }]) {
    await service.handlePushEvent({ ...event, ...mismatch }, 'stream');
    assert.equal(service.getPendingSteer('chat'), pending);
  }
  await service.handlePushEvent(event, 'stream');
  assert.equal(service.getPendingSteer('chat'), null);
  service.syncPendingSteerFromTimeline('chat', reducer.createChatTimelineState('chat'), true);
  assert.equal(service.getPendingSteer('chat'), null);
});

test('high frequency timeline delivery checks steer confirmation directly without scanning history', () => {
  const service = steerFixture();
  service.pendingSteers.set('chat', {
    steerId: 'pending',
    runId: 'older',
    message: 'pending',
    attachments: [],
    phase: 'accepted',
    runEnded: false
  });
  const state = active();
  state.nodesById = new Proxy(state.nodesById, {
    ownKeys() {
      throw new Error('hot path scanned history');
    }
  });
  assert.doesNotThrow(() => service.emitConversationTimelineState('chat', 'stream', state));
  assert.equal(service.getPendingSteer('chat').phase, 'accepted');
});

test('skill catalog singleflights, caches only success and ignores old namespace responses', async () => {
  const service = fixture();
  let calls = 0,
    fail = true,
    release!: (value: any) => void;
  service.ensureAgentDetail = async () => ({
    raw: { mode: 'CODER', interactionConfig: capabilities, skills: ['custom'] }
  });
  service.requestChatApi = async (type: string, payload: any) => {
    assert.equal(type, '/api/skills');
    assert.equal(payload.agentKey, 'agent');
    calls++;
    if (fail) throw new Error('offline');
    return { skills: [{ id: 'pdf' }], pinned: ['pdf'] };
  };
  await assert.rejects(service.ensureAgentSkills('agent'), /offline/);
  fail = false;
  const [a, b] = await Promise.all([service.ensureAgentSkills('agent'), service.ensureAgentSkills('agent')]);
  assert.equal(a, b);
  assert.equal(calls, 2);
  assert.equal(a.skills.length, 2);
  assert.equal(await service.ensureAgentSkills('agent'), a);
  assert.equal(calls, 2);
  service.agentSkills.clear();
  service.requestChatApi = () => new Promise((resolve) => (release = resolve));
  const old = service.ensureAgentSkills('agent');
  await flush();
  service.agentDetailCacheVersion++;
  service.agentSkills.clear();
  service.agentSkillRequests.clear();
  release({ skills: [], pinned: [] });
  assert.equal(await old, null);
  assert.equal(service.agentSkills.size, 0);
});

test('query persists canonical one-send skill IDs and rejects unavailable skills, capability loss and missing owner before saving', async () => {
  const saved: any[] = [],
    sent: any[] = [];
  const service = fixture({
    createOutgoingMessage: async (conversationId: string, content: string, attachments: any[], options: any) => {
      saved.push(options);
      return {
        clientMessageId: 'skill',
        createdAt: now,
        message: { messageId: 'skill', conversationId, role: 'user', content, attachments, createdAt: now }
      };
    }
  });
  const catalog = skillsProtocol.normalizeChatSkills({ skills: [{ id: 'office/pdf' }], pinned: [] });
  service.assertConversationWritable = async () => null;
  service.resolveRunControlScope = async () => ({ agentKey: 'agent' });
  service.ensureAgentDetail = async () => ({ raw: { mode: 'CODER', interactionConfig: capabilities } });
  service.ensureAgentSkills = async () => catalog;
  service.publishTimelineMessage = () => {};
  service.emitHomePatchFromSummary = async () => {};
  service.dispatchOutgoingMessage = async (input: any) => {
    sent.push(input);
  };
  await service.sendMessage('chat', 'use pdf', [], { skillIds: [' OFFICE/PDF ', 'office/pdf'] });
  assert.deepEqual([...sent[0].skillIds], ['office/pdf']);
  await service.sendMessage('chat', 'plain');
  assert.deepEqual([...sent[1].skillIds], []);
  assert.equal(sent[1].editingMode, false);
  service.ensureAgentDetail = async () => ({ raw: { interactionConfig: { ...capabilities, showEditingMode: false } } });
  await service.sendMessage('chat', 'hidden editing');
  assert.equal(sent[2].editingMode, undefined);
  service.ensureAgentDetail = async () => ({ raw: { interactionConfig: capabilities } });
  await assert.rejects(
    service.sendMessage('chat', 'use missing', [], { skillIds: ['missing'] }),
    /no longer available/
  );
  service.ensureAgentDetail = async () => ({
    raw: {
      mode: 'CODER',
      interactionConfig: { ...capabilities, attachment: { ...capabilities.attachment, skills: false } }
    }
  });
  await assert.rejects(
    service.sendMessage('chat', 'use pdf', [], { skillIds: ['office/pdf'] }),
    /capabilities changed/
  );
  service.resolveRunControlScope = async () => ({});
  await assert.rejects(service.sendMessage('chat', 'use pdf', [], { skillIds: ['office/pdf'] }), /Agent owner/);
  assert.equal(saved.length, 3);
});

function accessFixture() {
  const service = fixture();
  service.timelineStates.set(
    'chat',
    runAccess.applyChatTimelineRunAccess(active(), 'run', { accessLevel: 'default', version: 1 })
  );
  service.assertConversationWritable = async () => null;
  service.resolveRunControlScope = async () => ({ agentKey: 'team' });
  service.ensureAgentDetail = async () => ({ raw: { mode: 'TEAM', interactionConfig: capabilities } });
  service.emitConversationTimelineState = () => {};
  service.scheduleTimelinePersist = () => {};
  service.scheduleConversationReconcile = async () => {};
  return service;
}
test('runtime permission singleflights actual server writes, uses Team owner and never mutates future query defaults', async () => {
  const service = accessFixture();
  let release!: (value: any) => void,
    calls = 0;
  service.requestChatApi = async (type: string, payload: any) => {
    assert.equal(type, '/api/access-level');
    assert.equal(payload.agentKey, 'team');
    assert.equal(payload.runId, 'run');
    assert.equal(payload.accessLevel, 'full_access');
    calls++;
    return new Promise((resolve) => (release = resolve));
  };
  const first = service.updateRuntimeAccessLevel('chat', 'run', 'full_access');
  await flush();
  await assert.rejects(service.updateRuntimeAccessLevel('chat', 'run', 'auto_approve'), /awaiting confirmation/);
  service.timelineStates.set(
    'chat',
    reducer.applyChatTimelineEvent(service.getConversationTimelineState('chat'), 'chat', {
      type: 'run.access_level.changed',
      runId: 'run',
      version: 2,
      accessLevel: 'full_access',
      timestamp: now + 1
    })
  );
  await assert.rejects(service.updateRuntimeAccessLevel('chat', 'run', 'default'), /awaiting confirmation/);
  release({ accepted: true, runId: 'run', version: 2, accessLevel: 'full_access' });
  await first;
  assert.equal(calls, 1);
  assert.equal(
    runAccess.getChatTimelineRun(service.getConversationTimelineState('chat'), 'run')!.accessUpdate,
    undefined
  );
});
test('runtime permission rejection keeps confirmed value; timeout stays unknown until versioned authority arrives and cannot resend', async () => {
  const service = accessFixture();
  service.requestChatApi = async () => ({ accepted: false, runId: 'run', detail: 'unsupported' });
  assert.equal((await service.updateRuntimeAccessLevel('chat', 'run', 'full_access')).status, 'rejected');
  assert.equal(
    runAccess.getChatTimelineRun(service.getConversationTimelineState('chat'), 'run')!.accessLevel,
    'default'
  );
  service.requestChatApi = async () => {
    throw new Error('timeout');
  };
  assert.equal((await service.updateRuntimeAccessLevel('chat', 'run', 'full_access')).status, 'unknown');
  await assert.rejects(service.updateRuntimeAccessLevel('chat', 'run', 'full_access'), /awaiting confirmation/);
  const current = service.getConversationTimelineState('chat');
  service.timelineStates.set(
    'chat',
    reducer.applyChatTimelineEvent(current, 'chat', {
      type: 'run.access_level.changed',
      runId: 'run',
      accessLevel: 'auto_approve',
      version: 2,
      timestamp: now + 2
    })
  );
  assert.equal(
    runAccess.getChatTimelineRun(service.getConversationTimelineState('chat'), 'run')!.accessUpdate,
    undefined
  );
});
test('run change during permission preflight or RPC cannot write into a new run', async () => {
  const service = accessFixture();
  let release!: (value: any) => void,
    calls = 0;
  service.requestChatApi = () => {
    calls++;
    return new Promise((resolve) => (release = resolve));
  };
  const request = service.updateRuntimeAccessLevel('chat', 'run', 'full_access');
  await flush();
  service.timelineStates.set(
    'chat',
    reducer.applyChatTimelineEvent(service.getConversationTimelineState('chat'), 'chat', {
      type: 'run.complete',
      runId: 'run',
      timestamp: now + 1
    })
  );
  await assert.rejects(service.updateRuntimeAccessLevel('chat', 'run', 'auto_approve'), /no longer active/);
  release({ accepted: true, runId: 'run', version: 2, accessLevel: 'full_access' });
  await request;
  assert.equal(
    runAccess.getChatTimelineRun(service.getConversationTimelineState('chat'), 'run')!.accessLevel,
    'default'
  );
  assert.equal(calls, 1);
});

test('a permission event preceding an RPC timeout remains authoritative and avoids a false unknown state', async () => {
  const service = accessFixture();
  let reconciles = 0;
  service.scheduleConversationReconcile = async () => {
    reconciles++;
  };
  service.requestChatApi = async () => {
    service.timelineStates.set(
      'chat',
      reducer.applyChatTimelineEvent(service.getConversationTimelineState('chat'), 'chat', {
        type: 'run.access_level.changed',
        runId: 'run',
        accessLevel: 'full_access',
        version: 2,
        timestamp: now + 1
      })
    );
    throw new Error('reply lost');
  };
  const result = await service.updateRuntimeAccessLevel('chat', 'run', 'full_access');
  assert.equal(result.status, 'confirmed');
  assert.equal(reconciles, 0);
  assert.equal(
    runAccess.getChatTimelineRun(service.getConversationTimelineState('chat'), 'run')!.accessUpdate,
    undefined
  );
});
test('permission update rechecks the run after owner preflight and does not send if it ended', async () => {
  const service = accessFixture();
  let calls = 0;
  service.resolveRunControlScope = async () => {
    service.timelineStates.set(
      'chat',
      reducer.applyChatTimelineEvent(service.getConversationTimelineState('chat'), 'chat', {
        type: 'run.complete',
        runId: 'run',
        timestamp: now + 1
      })
    );
    return { agentKey: 'team' };
  };
  service.requestChatApi = async () => {
    calls++;
    return { accepted: true };
  };
  await service.updateRuntimeAccessLevel('chat', 'run', 'full_access');
  assert.equal(calls, 0);
  assert.equal(service.runtimeAccessRequests.size, 0);
});

test('permission phases avoid snapshot writes and a stale source response cannot alter the replacement state', async () => {
  const service = accessFixture();
  let release!: (value: any) => void,
    writes = 0;
  service.scheduleTimelinePersist = () => {
    writes++;
  };
  service.requestChatApi = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const request = service.updateRuntimeAccessLevel('chat', 'run', 'full_access');
  await flush();
  assert.equal(writes, 0);
  service.lifecycleVersion++;
  const replacement = runAccess.applyChatTimelineRunAccess(active(), 'run', {
    accessLevel: 'auto_approve',
    version: 1
  });
  service.timelineStates.set('chat', replacement);
  release({ accepted: true, runId: 'run', accessLevel: 'full_access', version: 2 });
  assert.equal((await request).status, 'rejected');
  assert.equal(service.getConversationTimelineState('chat'), replacement);
  assert.equal(writes, 0);
  assert.equal(service.runtimeAccessRequests.size, 0);
});

test('text selection survives query enqueue, submission and steer when local file input is disabled', async () => {
  const reference = {
    id: 'selected',
    type: 'selection',
    text: '中😀文',
    annotation: 'comment',
    annotationIndex: 5,
    meta: { sourceKind: 'message' }
  };
  const attachment = {
    attachmentId: 'selected',
    conversationId: 'chat',
    kind: 'selection',
    status: 'ready',
    name: 'Selected text',
    references: [reference]
  } as any;
  let queued: any;
  const service = fixture({
    createOutgoingMessage: async (conversationId: string, content: string, attachments: any[]) => {
      queued = attachments;
      return {
        clientMessageId: 'query',
        createdAt: now,
        message: { messageId: 'query', conversationId, role: 'user', content, attachments, createdAt: now }
      };
    }
  });
  service.assertConversationWritable = async () => null;
  service.resolveRunControlScope = async () => ({ agentKey: 'agent' });
  service.ensureAgentDetail = async () => ({
    raw: { mode: 'CODER', interactionConfig: { model: false, accessLevel: false, attachment: { localFiles: false } } }
  });
  service.publishTimelineMessage = () => {};
  service.emitHomePatchFromSummary = async () => {};
  service.dispatchOutgoingMessage = async () => {};
  await service.sendMessage('chat', 'explain', [attachment]);
  assert.equal(queued[0].references[0], reference);
  const payloads: any[] = [];
  const replay = fixture({
    getConversationHistoryScope: async () => ({ agentKey: 'agent' }),
    unscopeChatPayload: (payload: any) => payload,
    streamChatQuery: async (options: any) => {
      payloads.push(options.payload);
      return { abort: () => {} };
    }
  });
  replay.resolveTransportConfig = async () => ({ namespace: 'ap' });
  await replay.dispatchOutgoingMessage({
    clientMessageId: 'query',
    conversationId: 'chat',
    content: 'explain',
    attachments: queued
  });
  assert.deepEqual(payloads[0].references, [reference]);
  const steer = steerFixture();
  steer.ensureAgentDetail = service.ensureAgentDetail;
  steer.resolveRunControlScope = async () => ({ agentKey: 'agent' });
  steer.requestChatApi = async (_type: string, payload: any) => {
    assert.deepEqual(payload.references, [reference]);
    return { accepted: false };
  };
  await steer.steerConversation('chat', '', [attachment]);
});

test('reference picker queries only current Agent summary pages, excludes self and rejects capability loss or stale source', async () => {
  const service = fixture();
  service.resolveRunControlScope = async () => ({ agentKey: 'agent' });
  service.ensureAgentDetail = async () => ({
    raw: { mode: 'STANDARD', interactionConfig: { model: false, accessLevel: false, attachment: { localFiles: false, chatRecords: true } } }
  });
  const payloads: any[] = [];
  service.requestChatApi = async (type: string, payload: any) => {
    assert.equal(type, '/api/chats');
    payloads.push(payload);
    return [
      { chatId: 'chat', chatName: 'Self' },
      { chatId: 'other', chatName: 'Same' },
      { chatId: 'third', chatName: 'Same' }
    ];
  };
  const result = await service.listReferenceChats('chat');
  assert.deepEqual(
    [...result.items].map((item) => item.id),
    ['other', 'third']
  );
  assert.equal(payloads[0].agentKey, 'agent');
  assert.equal(payloads[0].limit, 10);
  service.ensureAgentDetail = async () => ({
    raw: { mode: 'CODER', interactionConfig: { model: false, accessLevel: false, attachment: { localFiles: false, chatRecords: false } } }
  });
  await assert.rejects(service.listReferenceChats('chat'), /disabled/);
  assert.equal(payloads.length, 1);
  service.ensureAgentDetail = async () => ({ raw: { mode: 'STANDARD', interactionConfig: capabilities } });
  service.requestChatApi = async () => {
    service.lifecycleVersion++;
    return [{ chatId: 'wrong' }];
  };
  await assert.rejects(service.listReferenceChats('chat'), /source changed/);
});
test('query preserve context IDs/meta and recheck chatRecords; context-only, Site and steer are rejected', async () => {
  const ref = { type: 'chat', id: 'other', name: 'Other', meta: { context: 'saved', updatedAt: now } },
    attachment = {
      attachmentId: 'ctx',
      conversationId: 'chat',
      kind: 'chat',
      status: 'ready',
      name: 'Other',
      references: [ref]
    } as any;
  const saved: any[] = [];
  const service = fixture({
    createOutgoingMessage: async (conversationId: string, content: string, attachments: any[]) => {
      saved.push(attachments);
      return {
        clientMessageId: 'ctx',
        createdAt: now,
        message: { messageId: 'ctx', conversationId, role: 'user', content, attachments, createdAt: now }
      };
    }
  });
  service.assertConversationWritable = async () => null;
  service.resolveRunControlScope = async () => ({ agentKey: 'agent' });
  service.ensureAgentDetail = async () => ({
    raw: { mode: 'STANDARD', interactionConfig: { model: false, accessLevel: false, attachment: { chatRecords: true, localFiles: false } } }
  });
  service.publishTimelineMessage = () => {};
  service.emitHomePatchFromSummary = async () => {};
  service.dispatchOutgoingMessage = async () => {};
  await service.sendMessage('chat', 'question', [attachment]);
  assert.equal(saved[0][0].references[0], ref);
  service.timelineStates.set(
    'chat',
    reducer.applyChatTimelineEvent(reducer.createChatTimelineState('chat'), 'chat', {
      type: 'request.query',
      runId: 'previous',
      message: 'old',
      timestamp: now
    })
  );
  await assert.rejects(service.sendMessage('chat', '', [attachment]), /require a question/);
  await assert.rejects(
    service.sendMessage('chat', 'question', [
      { ...attachment, kind: 'site', references: [{ type: 'site', id: 'website:a', name: 'Site' }] }
    ]),
    /unavailable/
  );
  service.ensureAgentDetail = async () => ({
    raw: { mode: 'STANDARD', interactionConfig: { model: false, accessLevel: false, attachment: { localFiles: false, chatRecords: false } } }
  });
  await assert.rejects(service.sendMessage('chat', 'question', [attachment]), /disabled/);
  assert.equal(saved.length, 1);
  const sent: any[] = [];
  const replay = fixture({
    getConversationHistoryScope: async () => ({ agentKey: 'agent' }),
    unscopeChatPayload: (payload: any) => payload,
    streamChatQuery: async (options: any) => {
      sent.push(options.payload);
      return { abort: () => {} };
    }
  });
  replay.resolveTransportConfig = async () => ({ namespace: 'ap' });
  replay.ensureAgentDetail = async () => ({ raw: { mode: 'STANDARD', interactionConfig: capabilities } });
  await replay.dispatchOutgoingMessage({
    clientMessageId: 'ctx',
    conversationId: 'chat',
    content: 'question',
    attachments: [attachment]
  });
  assert.deepEqual(sent[0].references, [ref]);
  replay.inFlightOutgoingIds.clear();
  replay.ensureAgentDetail = service.ensureAgentDetail;
  await assert.rejects(
    replay.dispatchOutgoingMessage({
      clientMessageId: 'ctx',
      conversationId: 'chat',
      content: 'question',
      attachments: [attachment]
    }),
    /disabled/
  );
  assert.equal(sent.length, 1);
  assert.equal(attachment.references[0], ref);
  const steer = steerFixture();
  await assert.rejects(steer.steerConversation('chat', 'question', [attachment]), /cannot be used for steering/);
  assert.equal(steer.getPendingSteer('chat'), null);
});

test('Run feedback singleflights optimistic writes, uses Team owner, clears comments and rolls back failures without persisting pending', async () => {
  const service = fixture(),
    calls: any[] = [];
  let persisted = 0,
    finish!: (value: any) => void;
  const started = reducer.applyChatTimelineEvent(reducer.createChatTimelineState('chat'), 'chat', {
    type: 'run.start',
    runId: 'run',
    requestId: 'query-request',
    timestamp: now
  });
  const completed = reducer.applyChatTimelineEvent(started, 'chat', {
    type: 'run.complete',
    runId: 'run',
    timestamp: now + 1000
  });
  service.timelineStates.set('chat', completed);
  service.assertConversationWritable = async () => null;
  service.resolveRunControlScope = async () => ({ agentKey: 'team' });
  service.emitConversationTimelineState = () => {};
  service.scheduleTimelinePersist = () => {
    persisted++;
  };
  service.requestChatApi = async (type: string, payload: any) => {
    assert.equal(type, '/api/feedback');
    calls.push(payload);
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const pending = service.submitRunFeedback('chat', 'run', 'thumbs_down', '  too brief  ');
  await flush();
  const optimistic = runAccess.getChatTimelineRun(service.getConversationTimelineState('chat'), 'run')!;
  assert.equal(optimistic.feedback, undefined);
  assert.equal(optimistic.feedbackPending!.feedback!.comment, 'too brief');
  assert.equal(persisted, 0);
  await assert.rejects(service.submitRunFeedback('chat', 'run', 'clear'), /already being submitted/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].agentKey, 'team');
  finish({ chatId: 'chat', runId: 'run', type: 'thumbs_down', setAt: now + 2000 });
  await pending;
  const confirmed = runAccess.getChatTimelineRun(service.getConversationTimelineState('chat'), 'run')!;
  assert.equal(confirmed.feedback!.comment, 'too brief');
  assert.equal(confirmed.feedbackPending, undefined);
  assert.equal(persisted, 1);
  service.requestChatApi = async () => {
    throw new Error('forbidden');
  };
  await assert.rejects(service.submitRunFeedback('chat', 'run', 'clear', 'must not leak'), /forbidden/);
  assert.equal(
    runAccess.getChatTimelineRun(service.getConversationTimelineState('chat'), 'run')!.feedback,
    confirmed.feedback
  );
  assert.equal(
    runAccess.getChatTimelineRun(service.getConversationTimelineState('chat'), 'run')!.feedbackPending,
    undefined
  );
  assert.equal(persisted, 1);
  service.requestChatApi = async (_type: string, payload: any) => {
    assert.equal(payload.type, 'clear');
    assert.equal(payload.comment, undefined);
    return { chatId: 'chat', runId: 'run', type: 'clear' };
  };
  await service.submitRunFeedback('chat', 'run', 'clear', 'ignored');
  const cleared = runAccess.getChatTimelineRun(service.getConversationTimelineState('chat'), 'run')!;
  assert.equal(cleared.feedback, null);
  assert.equal(persisted, 2);
  assert.equal(cleared.durationMs, confirmed.durationMs);
});
test('Run feedback rejects unknown run, malformed/mismatched acknowledgement and stale source cannot update replacement state', async () => {
  const service = fixture();
  service.assertConversationWritable = async () => null;
  service.resolveRunControlScope = async () => ({ agentKey: 'agent' });
  service.emitConversationTimelineState = () => {};
  service.scheduleTimelinePersist = () => {};
  await assert.rejects(service.submitRunFeedback('chat', 'run', 'thumbs_down'), /completed run/);
  service.timelineStates.set(
    'chat',
    reducer.applyChatTimelineEvent(active(), 'chat', { type: 'run.complete', runId: 'run', timestamp: now + 1000 })
  );
  service.requestChatApi = async () => ({ chatId: 'chat', runId: 'another-run', type: 'thumbs_down', setAt: now });
  await assert.rejects(service.submitRunFeedback('chat', 'run', 'thumbs_down'), /does not match/);
  assert.equal(
    runAccess.getChatTimelineRun(service.getConversationTimelineState('chat'), 'run')!.feedbackPending,
    undefined
  );
  let finish!: (value: any) => void;
  service.requestChatApi = async () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const pending = service.submitRunFeedback('chat', 'run', 'thumbs_down');
  await flush();
  service.lifecycleVersion++;
  const replacement = service.getConversationTimelineState('chat');
  service.timelineStates.set('chat', { ...replacement, nodesById: {} });
  finish({ chatId: 'chat', runId: 'run', type: 'thumbs_down', setAt: now });
  await pending;
  assert.deepEqual(Object.keys(service.getConversationTimelineState('chat').nodesById), []);
  assert.equal(service.feedbackRequests.size, 0);
});

function derivable() {
  return reducer.applyChatTimelineEvent(active(), 'chat', { type: 'run.finish', runId: 'run', timestamp: now + 1000 });
}
function derivedDetail(chatId: string, owner: Record<string, string>) {
  return {
    chatId,
    ...owner,
    runs: [
      {
        runId: 'copied-run',
        startedAt: now,
        completedAt: now + 1000,
        initialMessage: 'original question',
        assistantText: 'server copied context'
      }
    ]
  };
}
test('derivation persists a scoped destination before POST, singleflights taps, uses server context and publishes correct Team directory', async () => {
  let persisted: any, projection: any, patch: any, finish!: (value: unknown) => void;
  const service = fixture({
    persistConversationTimelineState: async (value: any) => {
      persisted = value;
    },
    reconcileConversationDetail: async (value: any) => {
      projection = value;
    },
    patchConversationSummary: async (value: any) => {
      patch = value;
      return { summary: { conversationId: value.conversationId }, directoryChanged: true };
    },
    getConversationDetail: async (id: string) => (id === 'chat' ? null : { conversationId: id })
  });
  const source = createChatSource('paired', 'desktop', 'Desktop');
  service.source = source;
  service.timelineStates.set('chat', derivable());
  service.resolveRunControlScope = async () => ({ agentKey: 'team' });
  const calls: any[] = [],
    events: any[] = [];
  service.emit = (event: any) => events.push(event);
  service.requestChatApi = async (type: string, value: any) => {
    calls.push({ type, ...value });
    assert.equal(runAccess.getChatTimelineRun(persisted, 'run')!.derivation!.chatId, value.chatId);
    return new Promise((done) => {
      finish = done;
    });
  };
  service.getChatDetailViaTransport = async (id: string) => derivedDetail(id, { agentKey: 'team' });
  const first = service.deriveConversation('chat', 'run');
  await assert.rejects(service.deriveConversation('chat', 'run'), /already in progress/);
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, '/api/chat/derive');
  assert.equal(calls[0].sourceChatId, 'chat');
  assert.equal(calls[0].sourceRunId, 'run');
  const targetId = encodeChatSourceId(source, 'interrupt-operation');
  assert.equal(calls[0].chatId, targetId);
  finish({
    chatId: targetId,
    sourceChatId: 'chat',
    sourceRunId: 'run',
    agentKey: 'team',
    copiedRuns: 1,
    lastRunId: 'copied-run',
    createdAt: now,
    updatedAt: now
  });
  const result = await first;
  assert.equal(result.conversation.conversationId, targetId);
  assert.equal(result.historyScope.agentKey, 'team');
  assert.equal(result.historyScope.agentKey, 'team');
  assert.equal(patch.agentKey, 'team');
  assert.equal(projection.messages[1].content, 'server copied context');
  assert.equal(runAccess.getChatTimelineRun(persisted, 'run')!.derivation!.phase, 'ready');
  assert.equal(
    events.some((event) => event.type === 'home.directory.replace'),
    true
  );
  await service.deriveConversation('chat', 'run');
  assert.equal(calls.length, 1, 'opening the completed derivation never creates again');
});
test('unknown derive result survives cold snapshot and reconcile; recovery GET 404 or permission denial never retries POST', async () => {
  let stored: any,
    posted = 0,
    reads = 0,
    targetId = '';
  const service = fixture({
    persistConversationTimelineState: async (value: any) => {
      stored = value;
    }
  });
  service.source = createChatSource('paired', 'desktop', 'Desktop');
  service.timelineStates.set('chat', derivable());
  service.resolveRunControlScope = async () => ({ agentKey: 'agent' });
  service.requestChatApi = async (_type: string, payload: any) => {
    posted++;
    targetId = payload.chatId;
    throw new Error('timeout');
  };
  await assert.rejects(service.deriveConversation('chat', 'run'), /timeout/);
  const { serializeChatTimelineState, deserializeChatTimelineState } =
    await import('../../src/features/chatTimeline/timelinePersistence.ts');
  const snapshot = serializeChatTimelineState(stored);
  const restored = deserializeChatTimelineState(snapshot.meta, snapshot.nodes)!;
  const merged = reducer.mergeChatTimelineState(restored, derivable());
  assert.equal(runAccess.getChatTimelineRun(merged, 'run')!.derivation!.chatId, targetId);
  service.timelineStates.set('chat', merged);
  for (const status of [404, 403]) {
    service.getChatDetailViaTransport = async (id: string) => {
      reads++;
      assert.equal(id, targetId);
      throw new ApiError('unconfirmed', status, null);
    };
    await assert.rejects(service.deriveConversation('chat', 'run'), /unconfirmed/);
    assert.equal(
      runAccess.getChatTimelineRun(service.getConversationTimelineState('chat'), 'run')!.derivation!.chatId,
      targetId
    );
  }
  assert.equal(posted, 1);
  assert.equal(reads, 2);
});
test('derivation rejects active/awaiting/deleted sources and definitive POST denial removes the intent while preserving original run', async () => {
  const service = fixture({ persistConversationTimelineState: async () => {} });
  service.source = createChatSource('paired', 'desktop', 'Desktop');
  service.resolveRunControlScope = async () => ({ agentKey: 'agent' });
  let posted = 0;
  service.requestChatApi = async () => {
    posted++;
    throw new ApiError('forbidden', 403, null);
  };
  service.timelineStates.set('chat', active());
  await assert.rejects(service.deriveConversation('chat', 'run'), /completed run/);
  const complete = derivable();
  service.timelineStates.set('chat', { ...complete, activeRunId: 'later' });
  await assert.rejects(service.deriveConversation('chat', 'run'), /Finish/);
  service.timelineStates.set('chat', { ...complete, awaiting: {} });
  await assert.rejects(service.deriveConversation('chat', 'run'), /Finish/);
  service.timelineStates.set('chat', complete);
  await assert.rejects(service.deriveConversation('chat', 'run'), /forbidden/);
  assert.equal(posted, 1);
  const node = runAccess.getChatTimelineRun(service.getConversationTimelineState('chat'), 'run')!;
  assert.equal(node.derivation, undefined);
  assert.equal(node.completedAt, runAccess.getChatTimelineRun(complete, 'run')!.completedAt);
  service.assertConversationWritable = async () => {
    throw new Error('deleted');
  };
  await assert.rejects(service.deriveConversation('chat', 'run'), /deleted/);
  assert.equal(posted, 1);
});
test('successful POST followed by target 404 keeps exact recovery identity; a source switch cannot publish into its replacement', async () => {
  const service = fixture({ persistConversationTimelineState: async () => {} });
  service.source = createChatSource('paired', 'desktop', 'Desktop');
  service.timelineStates.set('chat', derivable());
  service.resolveRunControlScope = async () => ({ agentKey: 'agent' });
  let posted = 0,
    release!: (value: any) => void;
  service.requestChatApi = async (_type: string, value: any) => {
    posted++;
    return { ...value, agentKey: 'agent', copiedRuns: 1, lastRunId: 'copied-run', createdAt: now, updatedAt: now };
  };
  service.getChatDetailViaTransport = async () => {
    throw new ApiError('not yet visible', 404, null);
  };
  await assert.rejects(service.deriveConversation('chat', 'run'), /not yet visible/);
  assert.equal(
    runAccess.getChatTimelineRun(service.getConversationTimelineState('chat'), 'run')!.derivation!.phase,
    'unknown'
  );
  service.getChatDetailViaTransport = () =>
    new Promise((done) => {
      release = done;
    });
  const recovery = service.deriveConversation('chat', 'run');
  await flush();
  service.lifecycleVersion++;
  service.timelineStates.set('chat', active());
  release(derivedDetail('other', { agentKey: 'agent' }));
  await assert.rejects(recovery, /source changed/);
  assert.equal(posted, 1);
  assert.equal(service.getConversationTimelineState('chat').activeRunId, 'run');
  assert.equal(service.derivationRequests.size, 0);
});
test('derivation cannot send before durable identity or publish malformed acknowledgement; late detail cannot erase newer target runtime', async () => {
  let writes = 0,
    persistedProjection: any,
    targetId = '';
  const service = fixture({
    persistConversationTimelineState: async () => {
      if (!writes) throw new Error('disk unavailable');
    },
    reconcileConversationDetail: async (value: any) => {
      persistedProjection = value;
    },
    patchConversationSummary: async (value: any) => ({
      summary: { conversationId: value.conversationId },
      directoryChanged: true
    }),
    getConversationDetail: async (id: string) => (id === 'chat' ? null : { conversationId: id })
  });
  service.source = createChatSource('paired', 'desktop', 'Desktop');
  service.timelineStates.set('chat', derivable());
  service.resolveRunControlScope = async () => ({ agentKey: 'agent' });
  service.requestChatApi = async (_type: string, payload: any) => {
    writes++;
    targetId = payload.chatId;
    return {
      ...payload,
      sourceRunId: 'wrong',
      agentKey: 'agent',
      copiedRuns: 1,
      lastRunId: 'copied',
      createdAt: now,
      updatedAt: now
    };
  };
  await assert.rejects(service.deriveConversation('chat', 'run'), /disk unavailable/);
  assert.equal(writes, 0);
  service.timelineStates.set('chat', derivable());
  writes = 1;
  await assert.rejects(service.deriveConversation('chat', 'run'), /does not match/);
  assert.equal(persistedProjection, undefined);
  service.getChatDetailViaTransport = async (id: string) => {
    service.timelineStates.set(
      id,
      reducer.applyChatTimelineEvent(reducer.createChatTimelineState(id), id, {
        type: 'run.start',
        runId: 'new-run',
        timestamp: now + 5000
      })
    );
    return derivedDetail(id, { agentKey: 'agent' });
  };
  await service.deriveConversation('chat', 'run');
  assert.equal(writes, 2, 'recovery only GETs the persisted target');
  assert.equal(persistedProjection.timelineState.activeRunId, 'new-run');
  assert.equal(service.getConversationTimelineState(targetId).activeRunId, 'new-run');
});

function submissionFixture() {
  let options: any;
  let sends = 0;
  const row: any = {
    messageId: 'message',
    clientMessageId: 'message',
    conversationId: 'chat',
    deliveryStatus: 'pending',
    errorReason: null
  };
  const handled: any[] = [];
  const service = fixture({
    getConversationHistoryScope: async () => ({ agentKey: 'root' }),
    unscopeChatPayload: (value: any) => value,
    scopeChatPayload: (_source: any, value: any) => value,
    extractConversationId: (value: any) => value.chatId || value.conversationId || '',
    getMessageByClientMessageId: async () => ({ ...row }),
    patchMessageByClientMessageId: async (_id: string, patch: any) => Object.assign(row, patch),
    streamChatQuery: async (value: any) => {
      options = value;
      sends++;
      return { abort() {} };
    }
  });
  service.resolveTransportConfig = async () => ({ namespace: 'ap' });
  service.emitHomePatchFromConversation = async () => {};
  service.publishTimelineMessagePatch = () => {};
  service.flushConversationStreamBuffers = async () => {};
  service.handlePushEvent = async (event: any) => {
    handled.push(event);
  };
  service.requestChatApi = async () => {
    throw new Error('Unexpected recovery request');
  };
  return { service, row, handled, options: () => options, sends: () => sends };
}

test('recovery keeps each input unchanged, carrying the rejected task through existing references after cold restore', async () => {
  const original: any = { messageId: 'original', clientMessageId: 'original', serverMessageId: null,
    conversationId: 'chat', role: 'user', content: '制作报告', createdAt: now, deliveryStatus: 'pending',
    errorReason: null, attachments: [{ attachmentId: 'file', messageId: 'original',
      conversationId: 'chat', references: [{ type: 'file', url: '/report.pdf' }] }] };
  const rows = new Map<string, any>([['original', original]]), sent: any[] = [];
  let persistedFailure: any, nextId = 0, retries = 0;
  const service = fixture({
    persistConversationTimelineState: async (state: any) => { persistedFailure = serializeChatTimelineState(state); },
    getMessageByClientMessageId: async (id: string) => ({ ...rows.get(id) }),
    patchMessageByClientMessageId: async (id: string, patch: any) => Object.assign(rows.get(id), patch),
    createOutgoingMessage: async (conversationId: string, content: string, attachments: any[]) => {
      const id = `input-${++nextId}`;
      const message = { ...original, messageId: id, clientMessageId: id, content, attachments,
        createdAt: now + nextId, deliveryStatus: 'pending', errorReason: null };
      rows.set(id, message);
      return { clientMessageId: id, conversationId, createdAt: message.createdAt, message };
    },
    retryOutgoingMessage: async (conversationId: string, id: string) => {
      retries++;
      const message = Object.assign(rows.get(id), { deliveryStatus: 'pending', errorReason: null });
      return { clientMessageId: id, conversationId, createdAt: message.createdAt, message };
    }
  });
  service.assertConversationWritable = async () => null;
  service.resolveRunControlScope = async () => ({ agentKey: 'agent' });
  service.validateContextReferences = async () => {};
  service.emitHomePatchFromSummary = async () => {};
  service.emitHomePatchFromConversation = async () => {};
  service.scheduleTimelinePersist = () => {};
  service.timelineStates.set('chat', reducer.applyChatTimelineMessage(null, original));
  await service.handleOutgoingStreamError({ conversationId: 'chat', clientMessageId: 'original' },
    new ApiError('model missing not found', 400, { code: 'model_not_found' }));
  assert.ok(persistedFailure);
  service.timelineStates.set('chat', deserializeChatTimelineState(persistedFailure.meta, persistedFailure.nodes)!);
  service.dispatchOutgoingMessage = async (input: any) => sent.push(input);
  await service.sendMessage('chat', '继续', [], { model: { key: 'valid' } });
  assert.equal(retries, 0);
  assert.equal(sent[0].clientMessageId, 'input-1');
  assert.equal(sent[0].content, '继续');
  const refs = sent[0].attachments.flatMap((item: any) => item.references);
  assert.ok(refs.some((ref: any) => ref.type === 'selection' && ref.text === '制作报告'));
  assert.ok(refs.some((ref: any) => ref.url === '/report.pdf'));
  assert.equal(sent[0].model.key, 'valid');
  assert.equal(original.content, '制作报告');
  assert.deepEqual(projectTimelineMessages(service.getConversationTimelineState('chat')).map(m => m.content), ['制作报告', '继续']);
  await service.handleOutgoingStreamError({ conversationId: 'chat', clientMessageId: 'input-1' }, new ApiError('invalid model', 400, null));
  await service.sendMessage('chat', '请加上图表', [], { model: { key: 'valid-2' } });
  assert.equal(sent[1].content, '请加上图表');
  assert.ok(sent[1].attachments.flatMap((item: any) => item.references).some((ref: any) => ref.text === '制作报告'));
  // Server echo and snapshot restoration preserve the same three literal inputs.
  let state = reducer.applyChatTimelineEvent(service.getConversationTimelineState('chat'), 'chat', {
    type: 'request.query', requestId: 'input-2', runId: 'run', chatId: 'chat',
    message: '请加上图表', references: sent[1].attachments.flatMap((item: any) => item.references), timestamp: now + 10
  });
  const saved = serializeChatTimelineState(state);
  state = deserializeChatTimelineState(saved.meta, saved.nodes)!;
  assert.deepEqual(projectTimelineMessages(state).map(m => m.content), ['制作报告', '继续', '请加上图表']);
  assert.deepEqual(buildChatTimelineDisplayItems(state)
    .filter(item => item.kind === 'user-query')
    .map(item => item.node.kind === 'message' ? item.node.content : ''), ['制作报告', '继续', '请加上图表']);
  // Explicit retry reuses only the failed input; it cannot rewrite its text or files.
  Object.assign(original, { deliveryStatus: 'pending', errorReason: null });
  service.timelineStates.set('chat', reducer.applyChatTimelineMessage(null, original));
  await service.handleOutgoingStreamError({ conversationId: 'chat', clientMessageId: 'original' }, new ApiError('invalid model', 400, null));
  await service.retryMessage('chat', 'original', { model: { key: 'valid' } });
  assert.equal(retries, 1);
  assert.equal(sent.at(-1).content, '制作报告');
  assert.equal(sent.at(-1).clientMessageId, 'original');
  assert.ok(sent.at(-1).attachments.flatMap((item: any) => item.references).some((ref: any) => ref.url === '/report.pdf'));
});

test('unknown or already accepted submissions never qualify for automatic recovery', () => {
  const message: any = { messageId: 'm', clientMessageId: 'm', serverMessageId: null,
    conversationId: 'chat', role: 'user', content: '任务', createdAt: now,
    deliveryStatus: 'failed', errorReason: 'submission_unconfirmed', attachments: [] };
  let state = reducer.applyChatTimelineMessage(null, message);
  assert.equal(getRecoverableChatSubmission(state), null);
  state = reducer.patchChatTimelineMessage(state, 'm', { errorReason: 'model missing', errorDetail:
    formatChatTimelinePlatformErrorForDisplay({ status: 400, message: 'model missing' }).error });
  assert.equal(getRecoverableChatSubmission(state)?.messageId, 'm');
  const accepted = reducer.applyChatTimelineEvent(state, 'chat', {
    type: 'request.query', requestId: 'm', runId: 'run', message: '任务', timestamp: now
  });
  assert.equal(getRecoverableChatSubmission(accepted), null);
  state = reducer.applyChatTimelineMessage(state, { ...message, messageId: 'later', clientMessageId: 'later',
    deliveryStatus: 'sent', errorReason: null, createdAt: now + 1 });
  assert.equal(getRecoverableChatSubmission(state), null);
});

test('sending after an unknown submission checks history and cannot create a context-free follow-up', async () => {
  const f = submissionFixture();
  Object.assign(f.row, { role: 'user', content: '原始工作', createdAt: now,
    attachments: [], serverMessageId: null, deliveryStatus: 'failed', errorReason: 'submission_unconfirmed' });
  f.service.timelineStates.set('chat', reducer.applyChatTimelineMessage(null, f.row));
  f.service.getChatDetailViaTransport = async () => ({ runs: [] });
  await assert.rejects(f.service.sendMessage('chat', '继续'), /submission_unconfirmed/);
  assert.equal(f.row.deliveryStatus, 'failed');
  assert.equal(f.sends(), 0);
  f.service.getChatDetailViaTransport = async () => ({ runs: [{ requestId: 'message', runId: 'run' }] });
  f.service.reconcileConversation = async () => {};
  const result = await f.service.sendMessage('chat', '继续');
  assert.equal(result.clientMessageId, 'message');
  assert.equal(result.message.content, '原始工作');
  assert.equal(f.row.deliveryStatus, 'sent');
  assert.equal(f.sends(), 0);
});

test('submission uses message request ID and waits for a matching canonical server identity', async () => {
  const f = submissionFixture();
  await f.service.dispatchOutgoingMessage({
    clientMessageId: 'message',
    conversationId: 'chat',
    content: 'hello',
    editingMode: false,
    skillIds: ['pdf']
  });
  const wire = f.options().payload;
  assert.equal(wire.requestId, 'message');
  assert.equal(wire.editingMode, false);
  assert.equal('skillIds' in wire, false);
  assert.deepEqual(
    Array.from(wire.references, (ref: any) => ({ ...ref })),
    [{ type: 'skill', id: 'pdf' }]
  );
  f.options().onEvent({ type: 'request.query', chatId: 'other', runId: 'run', agentKey: 'root', requestId: 'message' });
  await flush();
  assert.equal(f.row.deliveryStatus, 'pending');
  f.options().onEvent({ type: 'request.query', chatId: 'chat', runId: 'run', agentKey: 'root', requestId: 'message' });
  await flush();
  assert.equal(f.row.deliveryStatus, 'sent');
  assert.equal(f.handled.length, 1);
  f.options().onEvent({
    type: 'run.start',
    chatId: 'chat',
    runId: 'other-run',
    agentKey: 'root',
    requestId: 'message'
  });
  await flush();
  assert.equal(f.handled.length, 1);
  f.options().onDone();
  await flush();
  assert.equal(f.row.deliveryStatus, 'sent');
});
test('stream completion without acceptance is uncertain and explicit rejection keeps its original error', async () => {
  for (const rejected of [false, true]) {
    const f = submissionFixture();
    await f.service.dispatchOutgoingMessage({ clientMessageId: 'message', conversationId: 'chat', content: 'hello' });
    if (rejected) f.options().onError(Object.assign(new Error('Invalid query field'), { code: 400 }));
    else f.options().onDone();
    await flush();
    assert.equal(f.row.deliveryStatus, 'failed');
    assert.equal(f.row.errorReason, rejected ? 'Invalid query field' : 'submission_unconfirmed');
    assert.equal(f.sends(), 1);
  }
});
test('connection loss never replays a query; post-acceptance failure leaves the message sent', async () => {
  for (const accepted of [false, true]) {
    const f = submissionFixture();
    f.service.handleStreamSideError = async () => {};
    await f.service.dispatchOutgoingMessage({ clientMessageId: 'message', conversationId: 'chat', content: 'hello' });
    if (accepted)
      f.options().onEvent({
        type: 'request.query',
        chatId: 'chat',
        runId: 'run',
        agentKey: 'root',
        requestId: 'message'
      });
    f.options().onError(new Error('Disconnected'));
    await flush();
    assert.equal(f.row.deliveryStatus, accepted ? 'sent' : 'failed');
    f.service.hasConnectedOnce = false;
    f.service.activeConversationId = '';
    await f.service.handleTransportStatusChange('connected');
    assert.equal(f.sends(), 1);
  }
});
test('late submission callbacks cannot mutate the replacement source', async () => {
  const f = submissionFixture();
  await f.service.dispatchOutgoingMessage({ clientMessageId: 'message', conversationId: 'chat', content: 'hello' });
  f.service.lifecycleVersion++;
  f.options().onEvent({ type: 'request.query', chatId: 'chat', runId: 'run', agentKey: 'root', requestId: 'message' });
  f.options().onError(Object.assign(new Error('Old rejection'), { code: 400 }));
  await flush();
  assert.equal(f.row.deliveryStatus, 'pending');
  assert.equal(f.handled.length, 0);
});
test('manual retry first recovers a confirmed request and never creates another query', async () => {
  const f = submissionFixture();
  Object.assign(f.row, { deliveryStatus: 'failed', errorReason: 'submission_unconfirmed' });
  let reads = 0;
  f.service.getChatDetailViaTransport = async () => ({ runs: [{ requestId: 'message', runId: 'run' }] });
  f.service.reconcileConversation = async () => {
    reads++;
  };
  assert.equal(await f.service.recoverSubmission('chat', 'message'), true);
  assert.equal(f.row.deliveryStatus, 'sent');
  assert.equal(f.sends(), 0);
  assert.equal(reads, 1);
  f.service.getChatDetailViaTransport = async () => ({ runs: [] });
  assert.equal(await f.service.recoverSubmission('chat', 'unmatched'), false);
  assert.equal(f.sends(), 0);
});

test('root wait resumes through an empty steer and cannot resume a child or completed wait', async () => {
  const service = fixture();
  let state = active();
  state = reducer.applyChatTimelineEvent(state, 'chat', {
    type: 'tool.wait',
    runId: 'run',
    toolId: 'wait',
    toolName: 'wait',
    startedAt: now,
    deadlineAt: now + 60000,
    timestamp: now + 1,
    description: 'Waiting',
    conditions: []
  });
  service.timelineStates.set('chat', state);
  service.assertConversationWritable = async () => null;
  service.resolveRunControlScope = async () => ({ agentKey: 'root' });
  service.scheduleConversationReconcile = async () => {};
  const calls: any[] = [];
  service.requestChatApi = async (type: string, payload: any) => {
    calls.push({ type, payload });
    return { accepted: true, status: 'accepted' };
  };
  await service.continueWait('chat', 'wait');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, '/api/steer');
  assert.equal(calls[0].payload.message, '');
  assert.equal(calls[0].payload.agentKey, 'root');
  assert.equal(service.getConversationTimelineState('chat').activeRunId, 'run');
  await assert.rejects(service.continueWait('chat', 'wait'), /confirmation/);
  service.pendingSteers.clear();
  service.timelineStates.set(
    'chat',
    reducer.applyChatTimelineEvent(state, 'chat', {
      type: 'tool.result',
      runId: 'run',
      toolId: 'wait',
      timestamp: now + 2,
      result: { reason: 'elapsed' }
    })
  );
  await assert.rejects(service.continueWait('chat', 'wait'), /no longer active/);
  const child = reducer.applyChatTimelineEvent(active(), 'chat', {
    type: 'tool.wait',
    runId: 'run',
    taskId: 'child',
    toolId: 'child:wait',
    toolName: 'wait',
    startedAt: now,
    deadlineAt: now + 60000,
    timestamp: now + 1
  });
  service.timelineStates.set('chat', child);
  await assert.rejects(service.continueWait('chat', 'child:wait'), /no longer active/);
  assert.equal(calls.length, 1);
});

test('query stream supplies conversation and confirmed Run to tool frames that omit envelope identity', async () => {
  const f = submissionFixture();
  await f.service.dispatchOutgoingMessage({ clientMessageId: 'message', conversationId: 'chat', content: 'hello' });
  f.options().onEvent({ type: 'request.query', chatId: 'chat', runId: 'run', agentKey: 'root', requestId: 'message' });
  f.options().onEvent({ type: 'tool.start', toolId: 'wait', toolName: 'wait' });
  f.options().onEvent({
    type: 'tool.wait',
    runId: 'run',
    toolId: 'wait',
    toolName: 'wait',
    startedAt: now,
    deadlineAt: now + 45000
  });
  f.options().onEvent({ type: 'request.steer', requestId: 'continue', steerId: 'continue', runId: 'run', message: '' });
  f.options().onEvent({ type: 'request.steer', requestId: 'other', steerId: 'other', runId: 'other', message: '' });
  f.options().onEvent({ type: 'request.query', requestId: 'other', runId: 'run' });
  await flush();
  await flush();
  assert.equal(f.handled.length, 4);
  assert.equal(f.handled[3].steerId, 'continue');
  assert.ok(f.handled.every((event) => event.chatId === 'chat' && event.runId === 'run' && event.agentKey === 'root'));
});

test('reconcile cannot attach while the conversation already owns a query stream', async () => {
  const service = fixture({ getConversationSyncState: async () => ({ activeRunId: 'run' }) });
  service.activeConversationId = 'chat';
  service.timelineStates.set('chat', active());
  service.resolveTransportConfig = async () => {
    throw new Error('Unexpected second stream');
  };
  service.activeOutgoingStreams.set('message', { conversationId: 'chat', abort() {} });
  await service.attachActiveConversationRun('chat', 'attach');
  service.activeOutgoingStreams.clear();
  let resolveOwner!: (owner: any) => void;
  service.resolveRunControlScope = () =>
    new Promise((resolve) => {
      resolveOwner = resolve;
    });
  const attaching = service.attachActiveConversationRun('chat', 'attach');
  await flush();
  service.activeOutgoingStreams.set('message', { conversationId: 'chat', abort() {} });
  resolveOwner({ agentKey: 'root' });
  await attaching;
  assert.equal(service.activeAttaches.size, 0);
});

test('model catalog refresh propagates errors, retains last success and never changes Agent defaults', async () => {
  let calls = 0;
  const old = { models: [], reasoningEfforts: [], serviceTiers: [], fetchedAt: 1 };
  const fresh = { ...old, fetchedAt: 2 };
  const service = fixture({ getModelOptionsApi: async () => {
    calls++;
    if (calls === 1) throw new Error('catalog unavailable');
    return fresh;
  } });
  service.agentModelOptions.set('agent', old);
  assert.equal(await service.ensureAgentModelOptions('agent'), old);
  assert.equal(calls, 0);
  await assert.rejects(service.ensureAgentModelOptions('agent', { refresh: true }), /catalog unavailable/);
  assert.equal(service.getAgentModelOptionsSnapshot('agent'), old);
  assert.equal(await service.ensureAgentModelOptions('agent', { refresh: true }), fresh);
  assert.equal(service.getAgentModelOptionsSnapshot('agent'), fresh);
  assert.equal(service.getAgentDetailSnapshot('agent'), null);
});


test('VIEW service validates source, pinned hash and response identity without falling back to latest', async () => {
  const source=createChatSource('default','ap','AP');
  const chatId=encodeChatSourceId(source,'chat');
  const request={chatId,source:'connector',connectorId:'builtin.task-control',key:'automations',hash:'a'.repeat(64),usage:'display'};
  const service=fixture({readChatViewReference,getChatSourceFromId:()=>source});
  service.source=source;
  let calls=0;
  service.requestChatApi=async()=>{calls++;return {view:{source:'connector',connectorId:'builtin.task-control',key:'automations',hash:'b'.repeat(64),renderer:'html'},html:'static'};};
  await assert.rejects(service.getViewDocument(request),/identity mismatch/);
  await assert.rejects(service.getViewDocument({...request,hash:undefined}),/missing snapshot/);
  assert.equal(calls,1);
  service.requestChatApi=async()=>{service.lifecycleVersion++;return {view:{...request,renderer:'html'},html:'static'};};
  await assert.rejects(service.getViewDocument(request),/source changed/);
});

test('Form service rejects old array answers and submits one explicit param for the current owner', async () => {
  const service=fixture({readAwaitingSubmitParam,buildSubmitAwaitingPayload,CHAT_SUBMIT_TRANSPORT_TYPE:'/api/submit',createAwaitingSubmitId:()=> 'submit'});
  service.timelineStates.set('chat',reducer.applyChatTimelineEvent(active(),'chat',{type:'awaiting.ask',runId:'run',awaitingId:'form',mode:'form',form:{data:{}},view:{source:'builtin',key:'ask_user_form',renderer:'html'},timestamp:now+1}));
  service.assertConversationWritable=async()=>null;
  service.resolveRunControlScope=async()=>({agentKey:'root'});
  const calls=[];
  service.requestChatApi=async(type,payload)=>{calls.push(payload);return {accepted:true};};
  service.scheduleConversationReconcile=async()=>{};
  service.applyRuntimeConversationEvent=async()=>{};
  await assert.rejects(service.submitAwaiting('chat',{runId:'run',awaitingId:'form',params:[]}),/Invalid awaiting answer/);
  assert.equal(calls.length,0);
  const payload={runId:'run',awaitingId:'form',param:{decision:'approve',data:{chatId:'business',agentKey:'ordinary'}}};
  await service.submitAwaiting('chat',payload);
  assert.equal(calls.length,1);
  assert.equal(calls[0].agentKey,'root');
  assert.deepEqual(calls[0].param.data,payload.param.data);
  assert.equal('params' in calls[0],false);
});
