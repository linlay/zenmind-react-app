import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deserializeChatTimelineState,
  deriveChatTimelineState,
  serializeChatTimelineState,
  timelinePersistenceInternals,
} from '../../src/features/chatTimeline/index.ts';

test('timeline persistence roundtrips rich runtime nodes without replaying events', () => {
  const state = deriveChatTimelineState('chat-rich', [
    {
      type: 'request.query',
      requestId: 'req-1',
      message: 'build it',
      timestamp: 100,
    },
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 110,
    },
    {
      type: 'reasoning.snapshot',
      runId: 'run-1',
      reasoningId: 'reason-1',
      text: 'thinking',
      timestamp: 120,
    },
    {
      type: 'tool.result',
      runId: 'run-1',
      toolCallId: 'tool-1',
      toolName: 'read_file',
      result: { ok: true },
      timestamp: 130,
    },
    {
      type: 'content.snapshot',
      runId: 'run-1',
      contentId: 'answer-1',
      text: 'done',
      timestamp: 140,
    },
    {
      type: 'awaiting.ask',
      runId: 'run-1',
      awaitingId: 'approval-1',
      requiresApproval: true,
      prompt: 'approve?',
      timestamp: 150,
    },
    {
      type: 'usage.snapshot',
      runId: 'run-1',
      model: { key: 'gpt-5-mini' },
      contextWindow: {
        currentSize: 120,
        maxSize: 1000,
        estimatedNextCallSize: 150,
      },
      usage: {
        current: {
          promptTokens: 12,
          completionTokens: 3,
          totalTokens: 15,
          promptTokensDetails: {
            cacheHitTokens: 4,
            cacheMissTokens: 8,
          },
          completionTokensDetails: {
            reasoningTokens: 2,
          },
          estimatedCost: {
            total: 0.02,
          },
          llmChatCompletionCount: 1,
        },
        run: {
          promptTokens: 12,
          completionTokens: 3,
          totalTokens: 15,
          llmChatCompletionCount: 1,
        },
        chat: {
          promptTokens: 12,
          completionTokens: 3,
          totalTokens: 15,
          promptTokensDetails: {
            cacheHitTokens: 4,
            cacheMissTokens: 8,
          },
          estimatedCost: {
            total: 0.02,
          },
          llmChatCompletionCount: 1,
        },
      },
      timestamp: 160,
    },
    {
      type: 'run.complete',
      runId: 'run-1',
      timestamp: 170,
    },
  ]);

  const serialized = serializeChatTimelineState(state);
  const restored = deserializeChatTimelineState(serialized.meta, serialized.nodes);

  assert.notEqual(restored, null);
  assert.deepEqual(restored?.orderedNodeIds, state.orderedNodeIds);
  assert.equal(restored?.awaiting?.mode, 'approval');
  assert.equal(restored?.usageLabel, '输入 12 · 输出 3 · 总计 15');
  assert.equal(restored?.usageSummary?.current.promptTokens, 12);
  assert.equal(restored?.usageSummary?.chat.totalTokens, 15);
  assert.equal(restored?.usageSummary?.modelKey, 'gpt-5-mini');
  assert.equal(restored?.usageSummary?.contextWindow.percent, 12);
  assert.equal(restored?.usageSummary?.current.reasoningTokens, 2);
  assert.equal(restored?.usageSummary?.chat.cacheHitTokens, 4);
  assert.equal(restored?.usageSummary?.chat.estimatedCost?.total, 0.02);
  assert.deepEqual(
    restored?.orderedNodeIds.map((id) => restored.nodesById[id]?.kind),
    ['message', 'run', 'reasoning', 'tool', 'message', 'awaiting', 'usage']
  );
});

test('timeline persistence roundtrips structured question awaiting payloads', () => {
  const state = deriveChatTimelineState('chat-questions', [
    {
      type: 'awaiting.ask',
      runId: 'run-question',
      awaitingId: 'awaiting-question',
      mode: 'question',
      viewportType: 'builtin',
      viewportKey: 'question',
      timeout: 120000,
      agentKey: 'askUser.demo',
      questions: [
        {
          id: 'q1',
          type: 'select',
          question: '岗位类型？',
          options: [{ label: 'engineering 工程部' }],
        },
      ],
      timestamp: 100,
    },
  ]);

  const serialized = serializeChatTimelineState(state);
  const restored = deserializeChatTimelineState(serialized.meta, serialized.nodes);

  assert.equal(restored?.awaiting?.runId, 'run-question');
  assert.equal(restored?.awaiting?.awaitingId, 'awaiting-question');
  assert.equal(restored?.awaiting?.interactive?.kind, 'question');
  assert.equal(
    restored?.awaiting?.interactive?.questions[0].options?.[0].label,
    'engineering 工程部'
  );
});

test('timeline persistence rejects corrupted persisted node payloads', () => {
  const state = deriveChatTimelineState('chat-rich', [
    {
      type: 'request.query',
      requestId: 'req-1',
      message: 'hello',
      timestamp: 100,
    },
  ]);
  const serialized = serializeChatTimelineState(state);
  const corrupted = serialized.nodes.map((node, index) =>
    index === 0 ? { ...node, payloadJson: '{bad json' } : node
  );

  assert.equal(deserializeChatTimelineState(serialized.meta, corrupted), null);
});

test('timeline persistence hashes are stable and isolate changed nodes', () => {
  const base = deriveChatTimelineState('chat-rich', [
    {
      type: 'request.query',
      requestId: 'req-1',
      message: 'hello',
      timestamp: 100,
    },
    {
      type: 'content.snapshot',
      runId: 'run-1',
      contentId: 'answer-1',
      text: 'first',
      timestamp: 110,
    },
  ]);
  const changed = deriveChatTimelineState('chat-rich', [
    {
      type: 'request.query',
      requestId: 'req-1',
      message: 'hello',
      timestamp: 100,
    },
    {
      type: 'content.snapshot',
      runId: 'run-1',
      contentId: 'answer-1',
      text: 'second',
      timestamp: 110,
    },
  ]);

  const left = serializeChatTimelineState(base);
  const right = serializeChatTimelineState(changed);
  const leftById = new Map(left.nodes.map((node) => [node.nodeId, node]));
  const changedHashes = right.nodes.filter(
    (node) => leftById.get(node.nodeId)?.payloadHash !== node.payloadHash
  );

  assert.equal(
    timelinePersistenceInternals.hashText(left.nodes[0].payloadJson),
    left.nodes[0].payloadHash
  );
  assert.deepEqual(
    changedHashes.map((node) => node.kind),
    ['message']
  );
});
