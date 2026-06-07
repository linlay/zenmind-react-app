import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyConversationStreamDelta,
  buildHomeListState,
  patchDirectoryListPreviewByConversation,
  patchConversationMessage,
  patchHomeListState,
  upsertConversationMessage,
} from '../../src/features/chatPersistence/chatRealtimeUiState.ts';

const baseItems = [
  {
    conversationId: 'conv-1',
    title: 'One',
    lastMessageText: 'old one',
    lastMessageAt: 100,
    unreadCount: 0,
    lastMessageStatus: 'sent' as const,
    pinnedAt: 0,
  },
  {
    conversationId: 'conv-2',
    title: 'Two',
    lastMessageText: 'old two',
    lastMessageAt: 90,
    unreadCount: 2,
    lastMessageStatus: 'sent' as const,
    pinnedAt: 0,
  },
];

test('home item patch only replaces the target item and can move it to the top', () => {
  const state = buildHomeListState(baseItems, 2);
  const next = patchHomeListState(
    state,
    {
      conversationId: 'conv-2',
      lastMessageText: 'new two',
      lastMessageAt: 120,
      unreadCountDelta: 1,
      shouldMoveToTop: true,
    },
    6
  );

  assert.deepEqual(next.orderedIds, ['conv-2', 'conv-1']);
  assert.equal(next.itemsById['conv-2'].lastMessageText, 'new two');
  assert.equal(next.itemsById['conv-2'].unreadCount, 1);
  assert.equal(next.itemsById['conv-1'], state.itemsById['conv-1']);
});

test('unpinned home item patch moves after the pinned section', () => {
  const state = buildHomeListState(
    [
      {
        ...baseItems[0],
        pinnedAt: 300,
      },
      baseItems[1],
      {
        conversationId: 'conv-3',
        title: 'Three',
        lastMessageText: 'old three',
        lastMessageAt: 80,
        unreadCount: 0,
        lastMessageStatus: 'sent' as const,
        pinnedAt: 0,
      },
    ],
    3
  );

  const next = patchHomeListState(
    state,
    {
      conversationId: 'conv-3',
      lastMessageText: 'new three',
      lastMessageAt: 130,
      shouldMoveToTop: true,
    },
    6
  );

  assert.deepEqual(next.orderedIds, ['conv-1', 'conv-3', 'conv-2']);
});

test('pinned home item patch updates the target without reordering pinned items', () => {
  const state = buildHomeListState(
    [
      {
        ...baseItems[0],
        pinnedAt: 300,
      },
      {
        ...baseItems[1],
        pinnedAt: 200,
      },
    ],
    2
  );

  const next = patchHomeListState(
    state,
    {
      conversationId: 'conv-2',
      lastMessageText: 'new pinned two',
      lastMessageAt: 140,
      shouldMoveToTop: true,
    },
    6
  );

  assert.deepEqual(next.orderedIds, ['conv-1', 'conv-2']);
  assert.equal(next.itemsById['conv-2'].lastMessageText, 'new pinned two');
  assert.equal(next.itemsById['conv-1'], state.itemsById['conv-1']);
});

test('pinnedAt patch moves the conversation into pinned order', () => {
  const state = buildHomeListState(baseItems, 2);
  const next = patchHomeListState(
    state,
    {
      conversationId: 'conv-2',
      pinnedAt: 500,
    },
    6
  );

  assert.deepEqual(next.orderedIds, ['conv-2', 'conv-1']);
  assert.equal(next.itemsById['conv-2'].pinnedAt, 500);
  assert.equal(next.itemsById['conv-1'], state.itemsById['conv-1']);
});

test('directory preview patch only updates rows backed by the target conversation', () => {
  const state = {
    orderedIds: ['agent:planner', 'agent:other'],
    itemsById: {
      'agent:planner': {
        id: 'agent:planner',
        kind: 'agent' as const,
        title: 'Planner',
        subtitle: 'assistant',
        unreadCount: 1,
        pinnedAt: 0,
        sortRank: 1,
        agentKey: 'planner',
        teamId: null,
        defaultAgentKey: null,
        latestConversationId: 'conv-2',
        lastMessageText: 'old preview',
        lastMessageAt: 100,
      },
      'agent:other': {
        id: 'agent:other',
        kind: 'agent' as const,
        title: 'Other',
        subtitle: 'assistant',
        unreadCount: 0,
        pinnedAt: 0,
        sortRank: 2,
        agentKey: 'other',
        teamId: null,
        defaultAgentKey: null,
        latestConversationId: 'conv-9',
        lastMessageText: 'keep me',
        lastMessageAt: 90,
      },
    },
    total: 2,
  };

  const next = patchDirectoryListPreviewByConversation(state, {
    conversationId: 'conv-2',
    lastMessageText: 'new preview',
    lastMessageAt: 180,
  });

  assert.equal(next.itemsById['agent:planner'].lastMessageText, 'new preview');
  assert.equal(next.itemsById['agent:planner'].lastMessageAt, 180);
  assert.equal(next.itemsById['agent:other'], state.itemsById['agent:other']);
});

test('message patch replaces only the matching message object', () => {
  const messages = [
    {
      messageId: 'm1',
      clientMessageId: null,
      serverMessageId: 's1',
      conversationId: 'conv-1',
      role: 'assistant' as const,
      content: 'first',
      createdAt: 100,
      deliveryStatus: 'sent' as const,
      errorReason: null,
    },
    {
      messageId: 'm2',
      clientMessageId: 'c2',
      serverMessageId: null,
      conversationId: 'conv-1',
      role: 'user' as const,
      content: 'second',
      createdAt: 110,
      deliveryStatus: 'pending' as const,
      errorReason: null,
    },
  ];

  const patched = patchConversationMessage(messages, 'm2', {
    deliveryStatus: 'sent',
    serverMessageId: 's2',
  });

  assert.equal(patched[0], messages[0]);
  assert.notEqual(patched[1], messages[1]);
  assert.equal(patched[1].deliveryStatus, 'sent');
  assert.equal(patched[1].serverMessageId, 's2');
});

test('stream delta appends to the matched assistant bubble without rebuilding the list', () => {
  const messages = [
    {
      messageId: 'assistant:run-1',
      clientMessageId: null,
      serverMessageId: null,
      conversationId: 'conv-1',
      role: 'assistant' as const,
      content: 'hello',
      createdAt: 100,
      deliveryStatus: 'sent' as const,
      errorReason: null,
    },
  ];

  const next = applyConversationStreamDelta(messages, {
    messageId: 'assistant:run-1',
    createdAt: 140,
    delta: ' world',
  });

  assert.equal(next[0].content, 'hello world');
  assert.equal(next[0].createdAt, 140);
});

test('stream snapshot replaces the assistant bubble instead of appending duplicate text', () => {
  const messages = [
    {
      messageId: 'assistant:run-1',
      clientMessageId: null,
      serverMessageId: null,
      conversationId: 'conv-1',
      role: 'assistant' as const,
      content: 'hello',
      createdAt: 100,
      deliveryStatus: 'sent' as const,
      errorReason: null,
    },
  ];

  const next = applyConversationStreamDelta(messages, {
    messageId: 'assistant:run-1',
    createdAt: 150,
    delta: ' ignored',
    snapshotText: 'hello world',
  });

  assert.equal(next[0].content, 'hello world');
  assert.equal(next[0].createdAt, 150);
});

test('stream delta for an unknown message leaves the list untouched', () => {
  const messages = [
    {
      messageId: 'assistant:run-1',
      clientMessageId: null,
      serverMessageId: null,
      conversationId: 'conv-1',
      role: 'assistant' as const,
      content: 'hello',
      createdAt: 100,
      deliveryStatus: 'sent' as const,
      errorReason: null,
    },
  ];

  const next = applyConversationStreamDelta(messages, {
    messageId: 'assistant:run-2',
    createdAt: 150,
    delta: ' world',
  });

  assert.equal(next, messages);
});

test('message insert keeps chronological order', () => {
  const next = upsertConversationMessage(
    [
      {
        messageId: 'm2',
        clientMessageId: null,
        serverMessageId: 's2',
        conversationId: 'conv-1',
        role: 'assistant' as const,
        content: 'second',
        createdAt: 200,
        deliveryStatus: 'sent' as const,
        errorReason: null,
      },
    ],
    {
      messageId: 'm1',
      clientMessageId: null,
      serverMessageId: 's1',
      conversationId: 'conv-1',
      role: 'user' as const,
      content: 'first',
      createdAt: 100,
      deliveryStatus: 'sent' as const,
      errorReason: null,
    }
  );

  assert.deepEqual(
    next.map((message) => message.messageId),
    ['m1', 'm2']
  );
});
