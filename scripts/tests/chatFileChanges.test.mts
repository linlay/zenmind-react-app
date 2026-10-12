import assert from 'node:assert/strict';
import test from 'node:test';
import { createChatFileChangesProjector } from '../../src/features/chatPersistence/chatFileChanges.ts';
import { deriveChatTimelineState, applyChatTimelineEvent } from '../../src/features/chatTimeline/timelineReducer.ts';
import {
  serializeChatTimelineState,
  deserializeChatTimelineState
} from '../../src/features/chatTimeline/timelinePersistence.ts';
import type { ChatTimelineState, ChatTimelineToolNode } from '../../src/features/chatTimeline/types.ts';
const now = 1_791_450_000_000;
function fixture() {
  return deriveChatTimelineState('chat', [
    { type: 'request.query', runId: 'run', requestId: 'q', message: 'modify', timestamp: now },
    { type: 'run.start', runId: 'run', timestamp: now + 1 },
    {
      type: 'tool.snapshot',
      runId: 'run',
      toolId: 'write',
      toolName: 'file_write',
      agentKey: 'agent',
      timestamp: now + 2
    },
    {
      type: 'tool.result',
      runId: 'run',
      toolId: 'write',
      result: {
        status: 'written',
        filePath: '/workspace/src/a.ts',
        lineStats: { addedLines: 3, deletedLines: 0, editedLines: 0 }
      },
      timestamp: now + 3
    },
    { type: 'tool.snapshot', runId: 'run', toolId: 'edit', toolName: 'file_edit', timestamp: now + 4 },
    {
      type: 'tool.result',
      runId: 'run',
      toolId: 'edit',
      result: JSON.stringify({
        status: 'edited',
        filePath: '/workspace/src/a.ts',
        lineStats: { addedLines: '2', deletedLines: 1, editedLines: 1 }
      }),
      timestamp: now + 5
    },
    { type: 'run.finish', runId: 'run', timestamp: now + 6 }
  ]);
}
function replace(state: ChatTimelineState, overrides: Partial<ChatTimelineToolNode>): ChatTimelineState {
  const node = Object.values(state.nodesById).find(
    (n) => n.kind === 'tool' && n.toolId === 'edit'
  )! as ChatTimelineToolNode;
  return { ...state, nodesById: { ...state.nodesById, [node.id]: { ...node, ...overrides } } };
}
test('successful mutations aggregate per run/path, retain each call, replay does not increment, and cold snapshot has identical output', () => {
  const state = fixture(),
    project = createChatFileChangesProjector();
  const changes = project(state);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].addedLines, 5);
  assert.equal(changes[0].deletedLines, 1);
  assert.equal(changes[0].operations.length, 2);
  assert.deepEqual(
    changes[0].operations.map((op) => op.callId),
    ['write', 'edit']
  );
  const replay = applyChatTimelineEvent(state, state.conversationId, {
    type: 'tool.result',
    runId: 'run',
    toolId: 'edit',
    result: {
      status: 'edited',
      filePath: '/workspace/src/a.ts',
      lineStats: { addedLines: '2', deletedLines: 1, editedLines: 1 }
    },
    timestamp: now + 5
  });
  assert.deepEqual(project(replay), changes);
  const stored = serializeChatTimelineState(state);
  assert.deepEqual(createChatFileChangesProjector()(deserializeChatTimelineState(stored.meta, stored.nodes)!), changes);
  const tool = Object.values(state.nodesById).find((n) => n.kind === 'tool')! as ChatTimelineToolNode;
  const duplicate = { ...tool, id: tool.id + '-duplicate' };
  assert.equal(
    project({
      ...state,
      orderedNodeIds: [...state.orderedNodeIds, duplicate.id],
      nodesById: { ...state.nodesById, [duplicate.id]: duplicate }
    })[0].operations.length,
    2
  );
  const failedDuplicate = { ...duplicate, updatedAt: tool.updatedAt + 1, lifecycle: 'error' as const };
  assert.equal(
    project({
      ...state,
      orderedNodeIds: [...state.orderedNodeIds, failedDuplicate.id],
      nodesById: { ...state.nodesById, [failedDuplicate.id]: failedDuplicate }
    })[0].operations.length,
    1,
    'a newer failed instance suppresses a stale success for the same call'
  );
  const otherRun = { ...tool, id: 'other-run-tool', runId: 'other-run' };
  assert.equal(
    project({
      ...state,
      orderedNodeIds: [...state.orderedNodeIds, otherRun.id],
      nodesById: { ...state.nodesById, [otherRun.id]: otherRun }
    }).length,
    2
  );
});
test('failure/active/cancelled/untrusted tools and result errors cannot count as successful writes; args/output cannot invent a path', () => {
  const state = fixture();
  for (const overrides of [
    { lifecycle: 'active' as const },
    { lifecycle: 'cancelled' as const },
    { lifecycle: 'error' as const },
    { status: 'failed' },
    { resultText: JSON.stringify({ status: 'edited', filePath: '/workspace/src/a.ts', error: 'denied' }) },
    { resultText: JSON.stringify({ status: 'edited', filePath: '/workspace/src/a.ts', ok: false }) },
    { resultText: JSON.stringify({ status: 'edited', filePath: '/workspace/src/a.ts', exitCode: 1 }) },
    { resultText: JSON.stringify({ status: 'pending', filePath: '/workspace/src/a.ts' }) },
    { resultText: '{}', argsText: '{"filePath":"/workspace/src/a.ts"}' },
    { resultText: 'stdout: wrote /workspace/src/a.ts' },
    { resultText: 'x'.repeat(128 * 1024 + 1) },
    { toolName: 'file_read' }
  ])
    assert.equal(
      createChatFileChangesProjector()(replace(state, overrides))[0].operations.length,
      1,
      JSON.stringify(overrides).slice(0, 140)
    );
});
test('missing, invalid and overflowing statistics remain unknown; known zero is retained', () => {
  const state = fixture();
  const changes = createChatFileChangesProjector()(
    replace(state, {
      resultText: JSON.stringify({
        status: 'edited',
        filePath: '/workspace/src/a.ts',
        lineStats: { addedLines: -1, deletedLines: 0.5, editedLines: 'unknown' }
      })
    })
  );
  assert.equal(changes[0].addedLines, null);
  assert.equal(changes[0].deletedLines, null);
  assert.equal(changes[0].editedLines, null);
  assert.equal(changes[0].operations[0].deletedLines, 0);
  const overflow = createChatFileChangesProjector()(
    replace(state, {
      resultText: JSON.stringify({
        status: 'edited',
        filePath: '/workspace/src/a.ts',
        lineStats: { addedLines: Number.MAX_SAFE_INTEGER, deletedLines: 0, editedLines: 0 }
      })
    })
  );
  assert.equal(overflow[0].addedLines, null);
  assert.equal(
    createChatFileChangesProjector()(
      replace(state, { resultText: JSON.stringify({ status: 'edited', filePath: '/workspace/src/unknown.ts' }) })
    )[1].addedLines,
    null
  );
});
test('body/metadata refresh reuses summary reference and does not parse unchanged tool results; source change releases projection', () => {
  const state = fixture(),
    project = createChatFileChangesProjector();
  const initial = project(state),
    parse = JSON.parse;
  let calls = 0;
  JSON.parse = (...args: Parameters<typeof JSON.parse>) => {
    calls++;
    return parse(...args);
  };
  try {
    for (let i = 0; i < 20; i++) assert.strictEqual(project({ ...state, revision: state.revision + i }), initial);
    assert.equal(calls, 0);
  } finally {
    JSON.parse = parse;
  }
  assert.deepEqual(project({ ...state, conversationId: 'different', orderedNodeIds: [], nodesById: {} }), []);
});
