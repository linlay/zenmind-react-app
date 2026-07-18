import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyChatTimelineEvent,
  buildChatTimelineDisplayModel,
  deserializeChatTimelineState,
  serializeChatTimelineState,
  timelinePersistenceInternals,
  type ChatTimelineContextCompactNode,
  type ChatTimelineState,
  type SerializedTimelineMeta,
  type SerializedTimelineNode
} from '../../src/features/chatTimeline/index.ts';

const EPOCH_MS = 1_700_000_000_000;

function getContextNodes(state: ChatTimelineState): ChatTimelineContextCompactNode[] {
  return state.orderedNodeIds
    .map((nodeId) => state.nodesById[nodeId])
    .filter((node): node is ChatTimelineContextCompactNode => node?.kind === 'context');
}

function getContextNode(state: ChatTimelineState): ChatTimelineContextCompactNode {
  const node = getContextNodes(state)[0];
  assert.ok(node);
  return node;
}

test('context compact start and complete merge into one semantic display node', () => {
  let state = applyChatTimelineEvent(null, 'chat-compact', {
    type: 'context.compact.start',
    requestId: 'request-compact',
    runId: 'run-1',
    preCompactEstimatedTokens: 12_000,
    timestamp: EPOCH_MS
  });
  assert.equal(getContextNode(state).status, 'running');

  state = applyChatTimelineEvent(state, 'chat-compact', {
    type: 'context.compact.complete',
    requestId: 'request-compact',
    compactId: 'compact-1',
    runId: 'run-1',
    postCompactEstimatedTokens: 4_500,
    timestamp: EPOCH_MS + 100
  });

  const node = getContextNode(state);
  assert.equal(getContextNodes(state).length, 1);
  assert.equal(node.compactId, 'compact-1');
  assert.equal(node.status, 'completed');
  assert.equal(node.lifecycle, 'complete');
  assert.equal(node.preCompactTokens, 12_000);
  assert.equal(node.postCompactTokens, 4_500);
  assert.equal(node.savedTokens, 7_500);
  assert.equal(node.savedPercent, 63);
  assert.equal(Object.hasOwn(node, 'body'), false);

  const display = buildChatTimelineDisplayModel(state).items;
  assert.equal(display.length, 1);
  assert.equal(display[0]?.kind, 'context');
  assert.equal(display[0]?.node, node);
});

test('context compact failure keeps only a display-safe reason', () => {
  let state = applyChatTimelineEvent(null, 'chat-compact-failed', {
    type: 'context.compact.start',
    compactId: 'compact-failed',
    timestamp: EPOCH_MS
  });
  state = applyChatTimelineEvent(state, 'chat-compact-failed', {
    type: 'context.compact.error',
    compactId: 'compact-failed',
    payload: {
      error: {
        message: 'Context limit unavailable',
        diagnostics: { secret: 'must not render' }
      }
    },
    timestamp: EPOCH_MS + 50
  });

  const node = getContextNode(state);
  assert.equal(node.status, 'failed');
  assert.equal(node.lifecycle, 'error');
  assert.equal(node.errorReason, 'Context limit unavailable');
  assert.equal(JSON.stringify(node).includes('must not render'), false);
});

test('context compact completion updates the same usage summary used by the header', () => {
  let state = applyChatTimelineEvent(null, 'chat-compact-usage', {
    type: 'usage.snapshot',
    runId: 'run-1',
    contextWindow: {
      currentSize: 12_000,
      estimatedNextCallSize: 12_500,
      maxSize: 20_000
    },
    usage: {
      chat: { totalTokens: 15_000 }
    },
    timestamp: EPOCH_MS
  });
  state = applyChatTimelineEvent(state, 'chat-compact-usage', {
    type: 'context.compact.complete',
    compactId: 'compact-usage',
    preCompactEstimatedTokens: 12_000,
    postCompactEstimatedTokens: 4_500,
    compactionUsage: {
      promptTokens: 500,
      completionTokens: 50,
      totalTokens: 550,
      toolCallCount: 4
    },
    timestamp: EPOCH_MS + 100
  });

  assert.equal(state.usageSummary?.contextWindow.currentSize, 4_500);
  assert.equal(state.usageSummary?.contextWindow.estimatedNextCallSize, 4_500);
  assert.equal(state.usageSummary?.contextWindow.maxSize, 20_000);
  assert.equal(state.usageSummary?.contextWindow.percent, 23);
  assert.equal(state.usageSummary?.chat.totalTokens, 15_000);
  assert.equal(state.usageSummary?.compact?.totalTokens, 550);
  assert.equal(state.usageSummary?.compact?.toolCallCount, 4);
});

test('context compact reducer ignores duplicate and terminal regression events', () => {
  const completeEvent = {
    type: 'context.compact.done',
    requestId: 'request-idempotent',
    beforeTokens: 1_000,
    afterTokens: 400,
    timestamp: EPOCH_MS + 100
  };
  const completed = applyChatTimelineEvent(null, 'chat-compact-idempotent', completeEvent);
  const duplicate = applyChatTimelineEvent(completed, 'chat-compact-idempotent', completeEvent);
  const staleStart = applyChatTimelineEvent(completed, 'chat-compact-idempotent', {
    type: 'context.compact.start',
    requestId: 'request-idempotent',
    timestamp: EPOCH_MS
  });

  assert.equal(duplicate, completed);
  assert.equal(staleStart, completed);
  assert.equal(getContextNode(completed).savedTokens, 600);
});

test('context compact updates patch only their display item', () => {
  let state = applyChatTimelineEvent(null, 'chat-compact-display', {
    type: 'request.query',
    requestId: 'query-before-compact',
    message: 'compact this conversation',
    timestamp: EPOCH_MS
  });
  state = applyChatTimelineEvent(state, 'chat-compact-display', {
    type: 'context.compact.start',
    compactId: 'compact-display',
    timestamp: EPOCH_MS + 10
  });
  const runningModel = buildChatTimelineDisplayModel(state);
  const queryItem = runningModel.items.find((item) => item.kind === 'user-query');
  const runningItem = runningModel.items.find((item) => item.kind === 'context');
  assert.ok(queryItem);
  assert.ok(runningItem);

  state = applyChatTimelineEvent(state, 'chat-compact-display', {
    type: 'context.compact.complete',
    compactId: 'compact-display',
    preCompactEstimatedTokens: 500,
    postCompactEstimatedTokens: 200,
    timestamp: EPOCH_MS + 20
  });
  const completedModel = buildChatTimelineDisplayModel(state, runningModel);
  const completedQueryItem = completedModel.items.find((item) => item.kind === 'user-query');
  const completedItem = completedModel.items.find((item) => item.kind === 'context');

  assert.equal(completedQueryItem, queryItem);
  assert.notEqual(completedItem, runningItem);
  assert.equal(completedItem?.node, getContextNode(state));
});

test('context compact persistence roundtrips typed nodes and migrates legacy records', () => {
  const state = applyChatTimelineEvent(null, 'chat-compact-persisted', {
    type: 'context.compact.complete',
    compactId: 'compact-persisted',
    preCompactEstimatedTokens: 800,
    postCompactEstimatedTokens: 300,
    timestamp: EPOCH_MS
  });
  const serialized = serializeChatTimelineState(state);
  const restored = deserializeChatTimelineState(serialized.meta, serialized.nodes);
  assert.ok(restored);
  assert.deepEqual(getContextNode(restored), getContextNode(state));
  assert.equal(restored.usageSummary?.contextWindow.currentSize, 300);
  assert.equal(restored.usageSummary?.contextWindow.estimatedNextCallSize, 300);

  const legacyNode = {
    id: 'context:chat-compact-legacy:run-1:compact-legacy',
    kind: 'context',
    title: 'context',
    body: '{"preCompactEstimatedTokens":900,"postCompactEstimatedTokens":250}',
    status: 'completed',
    streaming: false,
    runId: 'run-1',
    createdAt: EPOCH_MS,
    updatedAt: EPOCH_MS + 100,
    order: 0,
    lifecycle: 'complete'
  };
  const payloadJson = timelinePersistenceInternals.stableStringify(legacyNode);
  const meta: SerializedTimelineMeta = {
    conversationId: 'chat-compact-legacy',
    activeRunId: '',
    awaitingId: null,
    usageLabel: '',
    updatedAt: EPOCH_MS + 100,
    revision: 1,
    nextOrder: 1
  };
  const rows: SerializedTimelineNode[] = [
    {
      conversationId: meta.conversationId,
      nodeId: legacyNode.id,
      kind: 'context',
      runId: 'run-1',
      orderIndex: 0,
      createdAt: EPOCH_MS,
      updatedAt: EPOCH_MS + 100,
      payloadHash: timelinePersistenceInternals.hashText(payloadJson),
      payloadJson
    }
  ];
  const migrated = deserializeChatTimelineState(meta, rows);
  assert.ok(migrated);
  const node = getContextNode(migrated);
  assert.equal(node.status, 'completed');
  assert.equal(node.preCompactTokens, 900);
  assert.equal(node.postCompactTokens, 250);
  assert.equal(node.savedTokens, 650);
  assert.equal(Object.hasOwn(node, 'body'), false);
});
