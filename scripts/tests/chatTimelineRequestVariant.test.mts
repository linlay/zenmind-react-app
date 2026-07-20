import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyChatTimelineEvent,
  buildChatTimelineDisplayItems,
  deriveChatTimelineState,
  deserializeChatTimelineState,
  normalizeChatTimelineRequestMessageVariant,
  projectTimelineMessages,
  serializeChatTimelineState,
  timelinePersistenceInternals
} from '../../src/features/chatTimeline/index.ts';

const REQUEST_VARIANT_EVENTS = [
  {
    type: 'request.steer',
    requestId: 'steer-1',
    steerId: 'steer-stable-1',
    runId: 'run-1',
    message: '请收窄范围',
    timestamp: 120
  },
  {
    type: 'request.remember',
    requestId: 'remember-1',
    runId: 'run-1',
    message: '记住我偏好简洁回答',
    timestamp: 130
  },
  {
    type: 'request.learn.complete',
    requestId: 'learn-1',
    runId: 'run-1',
    message: '学习这条项目规则',
    timestamp: 140
  }
] as const;

test('request message variant normalization recognizes supported commands and rejects unknown types', () => {
  assert.equal(normalizeChatTimelineRequestMessageVariant('request.STEER'), 'steer');
  assert.equal(normalizeChatTimelineRequestMessageVariant('request.remember.start'), 'remember');
  assert.equal(normalizeChatTimelineRequestMessageVariant('request.learn.complete'), 'learn');
  assert.equal(normalizeChatTimelineRequestMessageVariant('request.query'), null);
  assert.equal(normalizeChatTimelineRequestMessageVariant('request.future_command'), null);
  assert.equal(normalizeChatTimelineRequestMessageVariant('tool.steer'), null);
});

test('request command events become idempotent user message variants while unknown requests keep their fallback node', () => {
  const events = [
    ...REQUEST_VARIANT_EVENTS,
    {
      type: 'request.future_command',
      requestId: 'future-1',
      runId: 'run-1',
      message: '保留未知请求',
      timestamp: 150
    }
  ];
  const state = deriveChatTimelineState('chat-request-variant', events);
  const commandNodes = state.orderedNodeIds
    .map((nodeId) => state.nodesById[nodeId])
    .filter((node) => node?.kind === 'message');

  assert.deepEqual(
    commandNodes.map((node) => node.messageVariant),
    ['steer', 'remember', 'learn']
  );
  assert.deepEqual(
    commandNodes.map((node) => node.content),
    ['请收窄范围', '记住我偏好简洁回答', '学习这条项目规则']
  );
  assert.equal(commandNodes[0]?.id, 'message:chat-request-variant:request:steer-stable-1');

  const unknownNode = state.orderedNodeIds
    .map((nodeId) => state.nodesById[nodeId])
    .find((node) => node?.kind === 'request');
  assert.equal(unknownNode?.kind, 'request');
  assert.equal(unknownNode?.body, '保留未知请求');

  const duplicate = applyChatTimelineEvent(state, 'chat-request-variant', REQUEST_VARIANT_EVENTS[0]);
  assert.equal(duplicate, state);

  const stale = applyChatTimelineEvent(state, 'chat-request-variant', {
    ...REQUEST_VARIANT_EVENTS[0],
    message: '旧内容不得覆盖',
    timestamp: 110
  });
  assert.equal(stale, state);
});

test('live reduction and history replay produce the same request message variants', () => {
  const history = deriveChatTimelineState('chat-request-replay', REQUEST_VARIANT_EVENTS);
  const live = REQUEST_VARIANT_EVENTS.reduce(
    (state, event) => applyChatTimelineEvent(state, 'chat-request-replay', event),
    null as ReturnType<typeof applyChatTimelineEvent> | null
  );

  assert.deepEqual(
    serializeChatTimelineState(live).nodes.map((node) => node.payloadJson),
    serializeChatTimelineState(history).nodes.map((node) => node.payloadJson)
  );
});

test('request command variants render as request rows and stay out of base message projection', () => {
  const state = deriveChatTimelineState('chat-request-display', [
    {
      type: 'request.query',
      requestId: 'query-1',
      runId: 'run-1',
      message: '普通问题',
      timestamp: 100
    },
    {
      type: 'content.snapshot',
      contentId: 'content-1',
      runId: 'run-1',
      text: '普通回答',
      timestamp: 110
    },
    ...REQUEST_VARIANT_EVENTS,
    {
      type: 'request.future_command',
      requestId: 'future-1',
      runId: 'run-1',
      message: '未知请求仍按原样显示',
      timestamp: 150
    }
  ]);
  const items = buildChatTimelineDisplayItems(state);
  const requestItems = items.filter((item) => item.kind === 'request');

  assert.equal(items[0]?.kind, 'user-query');
  assert.equal(requestItems.length, 4);
  assert.deepEqual(
    requestItems
      .map((item) => item.node)
      .filter((node) => node.kind === 'message')
      .map((node) => node.messageVariant),
    ['steer', 'remember', 'learn']
  );
  assert.deepEqual(
    projectTimelineMessages(state).map((message) => message.content),
    ['普通问题', '普通回答']
  );
});

test('request message variants survive rich snapshot restore and legacy messages migrate to default', () => {
  const state = deriveChatTimelineState('chat-request-persistence', [
    {
      type: 'request.query',
      requestId: 'query-1',
      message: 'legacy query',
      timestamp: 100
    },
    REQUEST_VARIANT_EVENTS[0]
  ]);
  const serialized = serializeChatTimelineState(state);
  const restored = deserializeChatTimelineState(serialized.meta, serialized.nodes);
  const restoredVariants = restored?.orderedNodeIds
    .map((nodeId) => restored.nodesById[nodeId])
    .filter((node) => node?.kind === 'message')
    .map((node) => node.messageVariant);
  assert.deepEqual(restoredVariants, ['default', 'steer']);

  const legacyRows = serialized.nodes.map((row) => {
    const payload = JSON.parse(row.payloadJson) as Record<string, unknown>;
    if (payload.messageVariant !== 'default') {
      return row;
    }
    delete payload.messageVariant;
    const payloadJson = timelinePersistenceInternals.stableStringify(payload);
    return {
      ...row,
      payloadJson,
      payloadHash: timelinePersistenceInternals.hashText(payloadJson)
    };
  });
  const legacyRestored = deserializeChatTimelineState(serialized.meta, legacyRows);
  const queryNode = legacyRestored?.orderedNodeIds
    .map((nodeId) => legacyRestored.nodesById[nodeId])
    .find((node) => node?.kind === 'message' && node.content === 'legacy query');
  assert.equal(queryNode?.kind, 'message');
  assert.equal(queryNode?.messageVariant, 'default');

  const uppercaseRows = serialized.nodes.map((row) => {
    const payload = JSON.parse(row.payloadJson) as Record<string, unknown>;
    if (payload.messageVariant !== 'steer') {
      return row;
    }
    payload.messageVariant = 'STEER';
    const payloadJson = timelinePersistenceInternals.stableStringify(payload);
    return {
      ...row,
      payloadJson,
      payloadHash: timelinePersistenceInternals.hashText(payloadJson)
    };
  });
  const uppercaseRestored = deserializeChatTimelineState(serialized.meta, uppercaseRows);
  const steerNode = uppercaseRestored?.orderedNodeIds
    .map((nodeId) => uppercaseRestored.nodesById[nodeId])
    .find((node) => node?.kind === 'message' && node.content === '请收窄范围');
  assert.equal(steerNode?.kind, 'message');
  assert.equal(steerNode?.messageVariant, 'steer');
});
