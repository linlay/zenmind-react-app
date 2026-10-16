import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '../../src/core/api/apiError.ts';
import {
  resolveAgentInteraction,
  classifyAgentAvailabilityError
} from '../../src/features/chatPersistence/agentInteraction.ts';
import { buildChatRunOwnerPayload } from '../../src/core/api/services/chatRunOwner.ts';
import { buildAgentModelConfigPayload } from '../../src/core/api/services/modelOptionsProtocol.ts';
import { resolveAgentModelSettings } from '../../src/features/chatPersistence/agentModelSettings.ts';
import {
  hasValidRemoteChatStreamTime,
  hasValidRemoteChatPushTime,
  assertRemoteChatDetailTimes
} from '../../src/core/api/services/chatRemoteTimeProtocol.ts';
import {
  applyChatTimelineEvent,
  createChatTimelineState,
  reconcileChatTimelineAwaitingSnapshot,
  mergeChatTimelineState
} from '../../src/features/chatTimeline/timelineReducer.ts';
import {
  serializeChatTimelineState,
  deserializeChatTimelineState
} from '../../src/features/chatTimeline/timelinePersistence.ts';
import { projectRemoteChatDetail } from '../../src/features/chatPersistence/chatProjector.ts';
import { mergeChatReadState, isChatRunIdAfter } from '../../src/features/chatPersistence/chatReadState.ts';

const chatId = 'chat-sync';
const timestamp = 1_791_400_000_000;
function event(type: string, fields: Record<string, unknown> = {}) {
  return { type, chatId, runId: 'run-sync', timestamp, ...fields };
}
function replay(events: Record<string, unknown>[]) {
  return events.reduce((state, item) => applyChatTimelineEvent(state, chatId, item), createChatTimelineState(chatId));
}

test('STANDARD is an explicit clear; omitted tier preserves the server setting', () => {
  assert.equal(buildAgentModelConfigPayload('agent', { key: 'model', serviceTier: 'STANDARD' }).serviceTier, null);
  assert.equal('serviceTier' in buildAgentModelConfigPayload('agent', { key: 'model' }), false);
  assert.deepEqual(
    resolveAgentModelSettings({ modelKey: 'current', reasoningEffort: 'MAX', meta: { modelKey: 'obsolete' } }),
    { modelKey: 'current', reasoningEffort: 'MAX' }
  );
});

test('remote streams require integer milliseconds while push uses the business instant', () => {
  for (const invalid of [
    undefined,
    null,
    '1791400000000',
    1_791_400_000,
    timestamp + 0.5,
    Number.MAX_SAFE_INTEGER + 1
  ]) {
    assert.equal(hasValidRemoteChatStreamTime(event('content.delta', { timestamp: invalid })), false);
  }
  assert.equal(hasValidRemoteChatStreamTime(event('content.delta')), true);
  assert.equal(hasValidRemoteChatPushTime({ type: 'chat.read', readAt: timestamp }), true);
  assert.equal(hasValidRemoteChatPushTime({ type: 'chat.read', timestamp }), false);
  assert.equal(hasValidRemoteChatPushTime({ type: 'chat.read', readAt: timestamp, updatedAt: timestamp }), false);
  assert.equal(hasValidRemoteChatPushTime({ type: 'chat.deleted', createdAt: timestamp }), false);
  assert.equal(
    hasValidRemoteChatPushTime({
      type: 'archive.restored',
      summary: {
        createdAt: timestamp,
        updatedAt: timestamp,
        lastRunAt: timestamp,
        archivedAt: timestamp,
        readAt: timestamp
      }
    }),
    true
  );
  assert.throws(
    () => assertRemoteChatDetailTimes({ events: [event('tool.start', { timestamp: 'bad' })] }),
    /epoch milliseconds/
  );
});

test('tool end closes arguments only; failed results are terminal and survive replay and persistence', () => {
  const start = event('tool.start', { toolId: 'tool', toolName: 'exec' });
  const end = event('tool.end', { toolId: 'tool', timestamp: timestamp + 1 });
  const pending = replay([start, end]);
  const id = pending.orderedNodeIds[0];
  assert.equal(pending.nodesById[id].lifecycle, 'active');
  const failed = applyChatTimelineEvent(
    pending,
    chatId,
    event('tool.result', { toolId: 'tool', result: { exitCode: 1, stderr: 'denied' }, timestamp: timestamp + 2 })
  );
  assert.equal(failed.nodesById[id].lifecycle, 'error');
  assert.equal(applyChatTimelineEvent(failed, chatId, event('tool.output', { toolId: 'tool', delta: 'late' })), failed);
  assert.equal(applyChatTimelineEvent(failed, chatId, start), failed);
  const serialized = serializeChatTimelineState(failed);
  const restored = deserializeChatTimelineState(serialized.meta, serialized.nodes);
  assert.equal(restored?.nodesById[id].lifecycle, 'error');
  assert.equal(
    projectRemoteChatDetail({
      chatId,
      events: [start, end, event('tool.result', { toolId: 'tool', result: '{"success":false}' })]
    })?.timelineState.nodesById[id].lifecycle,
    'error'
  );
});

test('failed content keeps partial text and rejects late events; a new segment may still stream', () => {
  const partial = replay([
    event('content.delta', { contentId: 'a', delta: '部分回答' }),
    event('content.end', {
      contentId: 'a',
      status: 'failed',
      error: { message: 'overloaded' },
      timestamp: timestamp + 1
    })
  ]);
  const id = partial.orderedNodeIds[0];
  const node = partial.nodesById[id];
  assert.equal(node.kind, 'message');
  if (node.kind !== 'message') return;
  assert.equal(node.content, '部分回答');
  assert.equal(node.errorReason, 'overloaded');
  assert.equal(node.createdAt, timestamp);
  assert.equal(node.lifecycle, 'error');
  assert.equal(
    applyChatTimelineEvent(partial, chatId, event('content.delta', { contentId: 'a', delta: 'late' })),
    partial
  );
  const next = applyChatTimelineEvent(partial, chatId, event('content.start', { contentId: 'b', text: '重试回答' }));
  assert.equal(next.orderedNodeIds.length, 2);
});

test('authoritative awaiting null clears historical interaction; missing and old-page replay retain current state', () => {
  const ask = event('awaiting.ask', {
    awaitingId: 'ask',
    mode: 'question',
    questions: [{ id: 'q', question: 'Continue?', type: 'text' }]
  });
  const current = replay([ask]);
  assert.ok(current.awaiting);
  assert.equal(reconcileChatTimelineAwaitingSnapshot(current, undefined), current);
  assert.equal(reconcileChatTimelineAwaitingSnapshot(current, null).awaiting, null);
  assert.equal(projectRemoteChatDetail({ chatId, events: [ask], awaiting: null })?.timelineState.awaiting, null);
  assert.ok(projectRemoteChatDetail({ chatId, events: [ask], awaiting: null }, null, true)?.timelineState.awaiting);
  assert.ok(
    reconcileChatTimelineAwaitingSnapshot(current, {
      awaitingId: 'ask',
      runId: 'run-sync',
      mode: 'question',
      status: 'awaiting',
      createdAt: timestamp
    }).awaiting
  );
  assert.equal(
    reconcileChatTimelineAwaitingSnapshot(current, {
      awaitingId: 'ask',
      runId: 'other',
      mode: 'question',
      status: 'awaiting'
    }).awaiting,
    null
  );
});

test('old unread and read versions cannot undo newer read confirmation, but a newer run can be unread', () => {
  const read = { isRead: true, readAt: timestamp, readRunId: 'zz' };
  assert.equal(isChatRunIdAfter('100', 'zz'), true);
  assert.deepEqual(mergeChatReadState(read, { read: { isRead: false }, lastRunId: 'zy' }), read);
  assert.deepEqual(mergeChatReadState(read, { read: { isRead: false }, createdAt: timestamp - 1 }), read);
  assert.deepEqual(mergeChatReadState(read, { read: { isRead: true, readRunId: 'zy', readAt: timestamp + 1 } }), read);
  assert.equal(mergeChatReadState(read, { read: { isRead: false }, lastRunId: '100' }).isRead, false);
});

test('tool output is bounded UTF-8, deduplicated, transient and freed by result or run cancel', () => {
  let state = replay([
    event('tool.output', { toolId: 'output', stream: 'stdout', chunkIndex: 0, delta: '\u001b[31m你好😀\u001b[0m' })
  ]);
  const id = state.orderedNodeIds[0];
  const tool = state.nodesById[id];
  assert.equal(tool.kind, 'tool');
  if (tool.kind !== 'tool') return;
  assert.equal(tool.toolOutput?.stdout, '你好😀');
  assert.equal(
    applyChatTimelineEvent(
      state,
      chatId,
      event('tool.output', { toolId: 'output', stream: 'stdout', chunkIndex: 0, delta: 'duplicate' })
    ),
    state
  );
  state = applyChatTimelineEvent(
    state,
    chatId,
    event('tool.output', { toolId: 'output', stream: 'stderr', chunkIndex: 1, delta: '错误😀'.repeat(30_000) })
  );
  const output = state.nodesById[id];
  if (output.kind !== 'tool') return;
  assert.ok((output.toolOutput?.bytes || 0) <= 64 * 1024);
  assert.ok(!/\ud800$|\ud83d$/.test(output.toolOutput?.stderr || ''));
  assert.match(output.toolOutput?.stderr || '', /truncated/);
  assert.doesNotMatch(serializeChatTimelineState(state).nodes[0].payloadJson, /toolOutput|错误😀/);
  const result = applyChatTimelineEvent(state, chatId, event('tool.result', { toolId: 'output', result: 'done' }));
  assert.equal(result.toolOutputBytes, 0);
  const cancelled = applyChatTimelineEvent(state, chatId, event('run.cancel'));
  assert.equal(cancelled.toolOutputBytes, 0);
});

test('L1 complete is pending until its cycle completes and subsequent cycles remain separate', () => {
  const state = replay([
    event('context.compact.start', { cycleId: 'cycle', compactId: 'l1', level: 'l1_tools' }),
    event('context.compact.complete', {
      cycleId: 'cycle',
      compactId: 'l1',
      level: 'l1_tools',
      cycleComplete: false,
      tokensFreed: 10
    })
  ]);
  const id = state.orderedNodeIds[0];
  assert.equal(state.nodesById[id].lifecycle, 'active');
  const complete = applyChatTimelineEvent(
    state,
    chatId,
    event('context.compact.complete', { cycleId: 'cycle', compactId: 'l2', level: 'summary', cycleComplete: true })
  );
  assert.equal(complete.orderedNodeIds.length, 1);
  assert.equal(complete.nodesById[id].lifecycle, 'complete');
  const next = applyChatTimelineEvent(
    complete,
    chatId,
    event('context.compact.start', { cycleId: 'cycle-next', level: 'summary' })
  );
  assert.equal(next.orderedNodeIds.length, 2);
});
test('terminal frames from an old run cannot clear a newer run or revive a completed run', () => {
  let state = replay([
    event('run.start'),
    event('run.complete', { timestamp: timestamp + 1 }),
    event('run.start', { runId: 'new', timestamp: timestamp + 2 })
  ]);
  state = applyChatTimelineEvent(state, chatId, event('run.cancel', { timestamp: timestamp + 3 }));
  assert.equal(state.activeRunId, 'new');
  assert.equal(applyChatTimelineEvent(state, chatId, event('run.start', { timestamp: timestamp + 4 })), state);
  const stale = replay([event('run.start')]);
  assert.equal(mergeChatTimelineState(state, stale).activeRunId, 'new');
});
test('authority completion closes live tools missing from the snapshot and frees output', () => {
  const current = replay([
    event('run.start'),
    event('tool.output', { toolId: 'tool', stream: 'stdout', chunkIndex: 0, delta: 'temporary' })
  ]);
  const authority = replay([event('run.start'), event('run.complete', { timestamp: timestamp + 5 })]);
  const merged = mergeChatTimelineState(current, authority);
  assert.equal(merged.activeRunId, '');
  assert.equal(merged.toolOutputBytes, 0);
  assert.equal(
    Object.values(merged.nodesById).filter((node) => node.kind === 'tool' && node.lifecycle === 'active').length,
    0
  );
});
test('split ANSI controls do not leak to stdout or stderr', () => {
  let state = replay([
    event('tool.output', { toolId: 'tool', stream: 'stdout', chunkIndex: 0, delta: 'plain\u001b[31' })
  ]);
  state = applyChatTimelineEvent(
    state,
    chatId,
    event('tool.output', { toolId: 'tool', stream: 'stdout', chunkIndex: 1, delta: 'm红色\u001b[0m' })
  );
  const tool = Object.values(state.nodesById).find((node) => node.kind === 'tool');
  if (tool?.kind !== 'tool') return;
  assert.equal(tool.toolOutput?.stdout, 'plain红色');
  assert.equal(tool.toolOutput?.stderr, '');
});
test('a stale read for an older run cannot mark newer unread history read', () => {
  const current = { isRead: false, readAt: timestamp - 10, readRunId: 'a', updatedAt: timestamp + 10, lastRunId: 'b' };
  assert.equal(
    mergeChatReadState(current, { read: { isRead: true, readRunId: 'a', readAt: timestamp } }).isRead,
    false
  );
  assert.equal(
    mergeChatReadState(current, { read: { isRead: true, readRunId: 'b', readAt: timestamp + 11 } }).isRead,
    true
  );
});

test('retry activity belongs to the active run and task, remains transient and clears on progress', () => {
  const retry = event('run.activity', {
    phase: 'model_call',
    status: 'retrying',
    taskId: 'task',
    retry: { attempt: 2, maxAttempts: 3, delayMs: 1000, reason: 'overloaded' }
  });
  let state = replay([event('run.start'), event('task.start', { taskId: 'task' })]);
  state = applyChatTimelineEvent(state, chatId, retry);
  assert.equal(state.modelRetry?.attempt, 2);
  assert.equal(state.modelRetry?.retryAt, timestamp + 1000);
  assert.doesNotMatch(JSON.stringify(serializeChatTimelineState(state)), /modelRetry/);
  assert.equal(applyChatTimelineEvent(state, chatId, { ...retry, runId: 'old' }), state);
  state = applyChatTimelineEvent(state, chatId, event('task.complete', { taskId: 'task', timestamp: timestamp + 1 }));
  assert.equal(state.modelRetry, undefined);
  assert.equal(applyChatTimelineEvent(state, chatId, retry), state);
  assert.equal(applyChatTimelineEvent(createChatTimelineState(chatId), chatId, retry).modelRetry, undefined);
});

test('remote detail time validation covers message and artifact records without changing legacy cache readers', () => {
  assert.throws(() => assertRemoteChatDetailTimes({ messages: [{ createdAt: '2026-10-08' }] }), /epoch milliseconds/);
  assert.throws(
    () => assertRemoteChatDetailTimes({ artifact: { items: [{ updatedAt: 1_791_400_000 }] } }),
    /epoch milliseconds/
  );
  assert.doesNotThrow(() =>
    assertRemoteChatDetailTimes({
      messages: [{ createdAt: timestamp }],
      artifact: { items: [{ updatedAt: timestamp }] }
    })
  );
});

test('Agent capability overrides distinguish execution availability without erasing history', () => {
  const defaults = resolveAgentInteraction(undefined);
  assert.equal(defaults.model, false);
  assert.equal(defaults.attachment.localFiles, false);
  const config = {
    model: true,
    accessLevel: true,
    connectors: true,
    showPlanningMode: true,
    showEditingMode: false,
    showTerminal: false,
    attachment: { localFiles: false, chatRecords: true, skills: true, kbases: false }
  };
  assert.deepEqual(resolveAgentInteraction(config), config);
  for (const [status, expected] of [
    [401, 'authentication_required'],
    [403, 'forbidden'],
    [404, 'unavailable'],
    [503, 'error']
  ] as const)
    assert.equal(classifyAgentAvailabilityError(new ApiError('error', status, null)), expected);
  assert.equal(classifyAgentAvailabilityError(new Error('timeout')), 'error');
});

test('attachment-only and selection-only command echoes preserve references through replay and snapshot', () => {
  for (const references of [
    [{ type: 'file', name: 'note.txt', url: '/api/resource/file' }],
    [{ type: 'selection', text: 'selected text' }]
  ]) {
    const command = event('request.steer', { steerId: 'steer', message: '', references });
    const state = replay([command]);
    const node = Object.values(state.nodesById)[0];
    assert.equal(node.kind, 'message');
    if (node.kind !== 'message') return;
    assert.equal(node.messageVariant, 'steer');
    assert.deepEqual(node.references, references);
    assert.equal(applyChatTimelineEvent(state, chatId, { ...command, references: structuredClone(references) }), state);
    const serialized = serializeChatTimelineState(state);
    const restored = deserializeChatTimelineState(serialized.meta, serialized.nodes);
    const restoredNode = restored?.nodesById[node.id];
    assert.equal(restoredNode?.kind, 'message');
    if (restoredNode?.kind === 'message') assert.deepEqual(restoredNode.references, references);
  }
});

test('wait updates are transient, clear on results and never survive a cold snapshot', () => {
  const time = 1792057310000;
  let state = applyChatTimelineEvent(createChatTimelineState('chat'), 'chat', {
    type: 'run.start',
    runId: 'run',
    timestamp: time
  });
  state = applyChatTimelineEvent(state, 'chat', {
    type: 'tool.wait',
    runId: 'run',
    toolId: 'wait',
    toolName: 'wait',
    startedAt: time,
    deadlineAt: time + 60000,
    timestamp: time + 1,
    description: 'Waiting for a result',
    match: 'all',
    conditions: [{ index: 0, satisfied: false, status: 'pending' }]
  });
  const wait = Object.values(state.nodesById).find((node) => node.kind === 'tool')!;
  assert.equal(wait.kind === 'tool' && wait.toolWait?.description, 'Waiting for a result');
  const stored = serializeChatTimelineState(state);
  assert.equal(
    stored.nodes.some((node) => node.payloadJson.includes('toolWait')),
    false
  );
  state = applyChatTimelineEvent(state, 'chat', {
    type: 'tool.wait.update',
    runId: 'run',
    toolId: 'wait',
    toolName: 'wait',
    startedAt: time,
    deadlineAt: time + 60000,
    timestamp: time + 2,
    conditions: [{ index: 0, satisfied: true, status: 'ready' }]
  });
  const updated = state.nodesById[wait.id];
  assert.equal(updated.kind === 'tool' && updated.toolWait?.conditions[0].satisfied, true);
  state = applyChatTimelineEvent(state, 'chat', { type: 'run.complete', runId: 'run', timestamp: time + 3 });
  const terminal = state.nodesById[wait.id];
  assert.equal(terminal.kind === 'tool' && terminal.toolWait, undefined);
});
