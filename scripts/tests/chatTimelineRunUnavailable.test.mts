import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyChatTimelineRunUnavailable,
  deriveChatTimelineState,
  type ChatTimelineState,
} from '../../src/features/chatTimeline/index.ts';

function buildState(): ChatTimelineState {
  const conversationId = 'chat-stale';
  const runId = 'run-stale';
  return deriveChatTimelineState(conversationId, [
    {
      type: 'run.start',
      runId,
      agentKey: 'zenmind',
      timestamp: 100,
    },
    {
      type: 'reasoning.start',
      runId,
      contentId: 'reasoning-1',
      text: 'Thinking',
      timestamp: 110,
    },
    {
      type: 'awaiting.ask',
      awaitingId: 'awaiting-1',
      mode: 'plan',
      viewportType: 'native',
      viewportKey: 'plan:awaiting-1',
      runId,
      agentKey: 'zenmind',
      prompt: 'Approve this plan?',
      plan: {
        id: 'plan-1',
        title: 'Plan',
        options: [],
      },
      timestamp: 120,
    },
  ]);
}

test('marks unavailable active run as inactive while preserving awaiting submit state', () => {
  const state = buildState();
  const next = applyChatTimelineRunUnavailable(state, state.conversationId, {
    runId: state.activeRunId,
    timestamp: 200,
  });

  assert.equal(next.activeRunId, '');
  assert.deepEqual(next.activeReasoningNodeIdsByRun, {});
  const runNode = Object.values(next.nodesById).find((node) => node.kind === 'run');
  assert.equal(runNode?.lifecycle, 'complete');
  const reasoningNode = Object.values(next.nodesById).find((node) => node.kind === 'reasoning');
  if (!reasoningNode || reasoningNode.kind !== 'reasoning') {
    assert.fail('expected reasoning node');
  }
  assert.equal(reasoningNode.lifecycle, 'complete');
  assert.equal(reasoningNode.streaming, false);
  const awaitingNode = next.awaiting ? next.nodesById[next.awaiting.id] : null;
  assert.equal(awaitingNode?.lifecycle, 'active');
  assert.equal(next.awaiting?.awaitingId, 'awaiting-1');
  assert.equal(next.awaiting?.runId, 'run-stale');
});

test('leaves unrelated unavailable run untouched', () => {
  const state = buildState();
  const next = applyChatTimelineRunUnavailable(state, state.conversationId, {
    runId: 'run-other',
    timestamp: 200,
  });

  assert.equal(next, state);
});
