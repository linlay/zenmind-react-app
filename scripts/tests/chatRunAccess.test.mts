import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyChatTimelineEvent,
  createChatTimelineState,
  mergeChatTimelineState,
  serializeChatTimelineState,
  deserializeChatTimelineState
} from '../../src/features/chatTimeline/index.ts';
import { applyChatTimelineRunAccess, getChatTimelineRun } from '../../src/features/chatTimeline/timelineRunAccess.ts';
const now = 1_791_400_000_000;
const active = () =>
  applyChatTimelineEvent(createChatTimelineState('chat'), 'chat', { type: 'run.start', runId: 'run', timestamp: now });
test('access events update versioned metadata without ending a run or changing duration and ignore duplicate/old values', () => {
  const base = active();
  const changed = applyChatTimelineEvent(base, 'chat', {
    type: 'run.access_level.changed',
    runId: 'run',
    accessLevel: 'auto_approve',
    version: 2,
    timestamp: now + 100
  });
  const node = getChatTimelineRun(changed, 'run')!;
  assert.equal(node.accessLevel, 'auto_approve');
  assert.equal(node.accessLevelVersion, 2);
  assert.equal(node.lifecycle, 'active');
  assert.equal(node.startedAt, now);
  assert.equal(node.completedAt, null);
  assert.equal(changed.activeRunId, 'run');
  assert.equal(node.updatedAt, getChatTimelineRun(base, 'run')!.updatedAt);
  for (const event of [
    { version: 1, accessLevel: 'default' },
    { version: 2, accessLevel: 'full_access' },
    { version: 3, accessLevel: 'root' }
  ])
    assert.equal(
      applyChatTimelineEvent(changed, 'chat', {
        ...event,
        type: 'run.access_level.changed',
        runId: 'run',
        timestamp: now + 200
      }),
      changed
    );
});
test('initial query authority cannot roll back a later runtime permission and merge preserves version across terminal/newer snapshots', () => {
  let state = applyChatTimelineRunAccess(active(), 'run', { accessLevel: 'full_access', version: 3 });
  state = applyChatTimelineEvent(state, 'chat', {
    type: 'request.query',
    runId: 'run',
    requestId: 'query',
    message: 'hello',
    accessLevel: 'default',
    timestamp: now + 200
  });
  assert.equal(getChatTimelineRun(state, 'run')!.accessLevel, 'full_access');
  const terminal = applyChatTimelineEvent(active(), 'chat', {
    type: 'run.complete',
    runId: 'run',
    timestamp: now + 300
  });
  const merged = mergeChatTimelineState(state, terminal);
  assert.equal(getChatTimelineRun(merged, 'run')!.accessLevel, 'full_access');
  assert.equal(getChatTimelineRun(merged, 'run')!.lifecycle, 'complete');
  assert.equal(merged.activeRunId, '');
});
test('pending permission changes stay transient while confirmed values survive existing rich snapshots', () => {
  let state = applyChatTimelineRunAccess(active(), 'run', {
    accessLevel: 'default',
    version: 1,
    update: { phase: 'sending', requestId: 'change', baselineVersion: 1 }
  });
  state = applyChatTimelineRunAccess(state, 'run', { accessLevel: 'full_access', version: 2 });
  assert.equal(getChatTimelineRun(state, 'run')!.accessUpdate?.phase, 'sending');
  state = applyChatTimelineRunAccess(state, 'run', {
    update: { phase: 'unknown', requestId: 'change', baselineVersion: 1 }
  });
  assert.equal(getChatTimelineRun(state, 'run')!.accessUpdate, undefined);
  state = applyChatTimelineRunAccess(state, 'run', {
    update: { phase: 'unknown', requestId: 'other', baselineVersion: 2 }
  });
  const serialized = serializeChatTimelineState(state),
    restored = deserializeChatTimelineState(serialized.meta, serialized.nodes)!;
  assert.equal(getChatTimelineRun(restored, 'run')!.accessLevel, 'full_access');
  assert.equal(getChatTimelineRun(restored, 'run')!.accessUpdate, undefined);
  assert.equal(getChatTimelineRun(mergeChatTimelineState(state, active()), 'run')!.accessUpdate?.phase, 'unknown');
});

test('wire query before run.start initializes the original permission without a provisional run or timing change', () => {
  const queried = applyChatTimelineEvent(createChatTimelineState('chat'), 'chat', {
    type: 'request.query',
    runId: 'run',
    requestId: 'query',
    message: 'hello',
    accessLevel: 'auto_approve',
    timestamp: now
  });
  assert.equal(queried.activeRunId, '');
  const started = applyChatTimelineEvent(queried, 'chat', {
    type: 'run.start',
    runId: 'run',
    requestId: 'query',
    timestamp: now + 1
  });
  const node = getChatTimelineRun(started, 'run')!;
  assert.equal(node.accessLevel, 'auto_approve');
  assert.equal(node.accessLevelVersion, 1);
  assert.equal(node.startedAt, now + 1);
  const replay = mergeChatTimelineState(
    applyChatTimelineRunAccess(started, 'run', { accessLevel: 'full_access', version: 2 }),
    active()
  );
  assert.equal(getChatTimelineRun(replay, 'run')!.accessLevel, 'full_access');
});

test('synthetic detail requests with unknown initial options do not invent default permissions', async () => {
  const { projectRemoteChatDetail } = await import('../../src/features/chatPersistence/chatProjector.ts');
  const projected = projectRemoteChatDetail({
    chatId: 'chat',
    runs: [{ runId: 'run', initialMessage: 'old message', startedAt: now }],
    activeRun: { runId: 'run', startedAt: now }
  })!;
  assert.equal(getChatTimelineRun(projected.timelineState, 'run')!.accessLevel, undefined);
});

test('terminal events with another transport request identity keep one run and its confirmed permission', () => {
  let state = applyChatTimelineEvent(createChatTimelineState('chat'), 'chat', {
    type: 'run.start',
    runId: 'run',
    requestId: 'query',
    timestamp: now
  });
  state = applyChatTimelineRunAccess(state, 'run', {
    accessLevel: 'full_access',
    version: 2,
    update: { phase: 'sending', requestId: 'pending', baselineVersion: 2 }
  });
  state = applyChatTimelineEvent(state, 'chat', { type: 'run.complete', runId: 'run', timestamp: now + 5 });
  const runs = state.orderedNodeIds.map((id) => state.nodesById[id]).filter((node) => node.kind === 'run');
  assert.equal(runs.length, 1);
  assert.equal(getChatTimelineRun(state, 'run')!.accessLevel, 'full_access');
  assert.equal(getChatTimelineRun(state, 'run')!.durationMs, 5);
  assert.equal(getChatTimelineRun(state, 'run')!.accessUpdate, undefined);
});
