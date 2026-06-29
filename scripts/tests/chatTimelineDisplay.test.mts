import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyChatTimelineEvent,
  applyChatTimelineStreamDelta,
  buildChatTimelineDisplayModel,
  buildChatTimelineDisplayItems,
  deriveChatTimelineState,
} from '../../src/features/chatTimeline/index.ts';
import type { ChatTimelineDisplayItem } from '../../src/features/chatTimeline/index.ts';

type AssistantContentDisplayItem = ChatTimelineDisplayItem & { kind: 'assistant-content' };
type AssistantReplyFooterDisplayItem = ChatTimelineDisplayItem & { kind: 'assistant-reply-footer' };

function displayKinds(items: readonly ChatTimelineDisplayItem[]): string[] {
  return items.map((item) => item.kind);
}

function assistantContentItems(items: readonly ChatTimelineDisplayItem[]): AssistantContentDisplayItem[] {
  return items.filter((item): item is AssistantContentDisplayItem => item.kind === 'assistant-content');
}

function assistantReplyFooterItems(items: readonly ChatTimelineDisplayItem[]): AssistantReplyFooterDisplayItem[] {
  return items.filter(
    (item): item is AssistantReplyFooterDisplayItem => item.kind === 'assistant-reply-footer'
  );
}

function expectAssistantContentItem(item: ChatTimelineDisplayItem | undefined): AssistantContentDisplayItem {
  assert.equal(item?.kind, 'assistant-content');
  if (item?.kind !== 'assistant-content') {
    throw new Error('expected assistant content item');
  }
  return item;
}

function expectAssistantReplyFooterItem(
  item: ChatTimelineDisplayItem | undefined
): AssistantReplyFooterDisplayItem {
  assert.equal(item?.kind, 'assistant-reply-footer');
  if (item?.kind !== 'assistant-reply-footer') {
    throw new Error('expected assistant footer item');
  }
  return item;
}

test('timeline display groups consecutive matching tool calls in one render item', () => {
  const state = deriveChatTimelineState('chat-1', [
    {
      type: 'request.query',
      requestId: 'req-1',
      runId: 'run-1',
      message: '查日期',
      timestamp: 100,
    },
    {
      type: 'tool.snapshot',
      runId: 'run-1',
      toolId: 'tool-1',
      toolName: 'date_time',
      toolLabel: '日期时间',
      arguments: '{"timezone":"Asia/Shanghai"}',
      timestamp: 110,
    },
    {
      type: 'tool.result',
      toolId: 'tool-1',
      result: '{"date":"2026-06-03"}',
      timestamp: 120,
    },
    {
      type: 'tool.snapshot',
      runId: 'run-1',
      toolId: 'tool-2',
      toolName: 'date_time',
      toolLabel: '日期时间',
      arguments: '{"offset":"+1D","timezone":"Asia/Shanghai"}',
      timestamp: 130,
    },
    {
      type: 'tool.result',
      toolId: 'tool-2',
      result: '{"date":"2026-06-04"}',
      timestamp: 140,
    },
    {
      type: 'content.snapshot',
      runId: 'run-1',
      contentId: 'answer-1',
      text: '完成',
      timestamp: 150,
    },
  ]);

  const items = buildChatTimelineDisplayItems(state);
  assert.deepEqual(
    items.map((item) => item.kind),
    ['user-query', 'tool-group', 'assistant-content', 'assistant-reply-footer']
  );

  const toolGroup = items[1];
  assert.equal(toolGroup.kind, 'tool-group');
  if (toolGroup.kind !== 'tool-group') {
    throw new Error('expected tool group');
  }
  assert.equal(toolGroup.toolName, 'date_time');
  assert.equal(toolGroup.toolLabel, '日期时间');
  assert.equal(toolGroup.count, 2);
  assert.deepEqual(
    toolGroup.nodes.map((node) => node.id),
    ['tool:chat-1:tool-1', 'tool:chat-1:tool-2']
  );
});

test('timeline display only groups uninterrupted matching tool calls', () => {
  const state = deriveChatTimelineState('chat-1', [
    {
      type: 'request.query',
      requestId: 'req-1',
      runId: 'run-1',
      message: '查日期',
      timestamp: 100,
    },
    {
      type: 'tool.snapshot',
      runId: 'run-1',
      toolId: 'tool-1',
      toolName: 'date_time',
      toolLabel: '日期时间',
      timestamp: 110,
    },
    {
      type: 'reasoning.snapshot',
      runId: 'run-1',
      reasoningId: 'reason-1',
      text: '继续判断',
      timestamp: 115,
    },
    {
      type: 'tool.snapshot',
      runId: 'run-1',
      toolId: 'tool-2',
      toolName: 'date_time',
      toolLabel: '日期时间',
      timestamp: 120,
    },
    {
      type: 'tool.snapshot',
      runId: 'run-1',
      toolId: 'tool-3',
      toolName: 'date_time',
      toolLabel: '日期时间',
      timestamp: 130,
    },
  ]);

  const items = buildChatTimelineDisplayItems(state);
  assert.deepEqual(
    items.map((item) => item.kind),
    ['user-query', 'tool', 'reasoning', 'tool-group']
  );

  const toolGroup = items[3];
  assert.equal(toolGroup.kind, 'tool-group');
  if (toolGroup.kind !== 'tool-group') {
    throw new Error('expected tool group');
  }
  assert.deepEqual(
    toolGroup.nodes.map((node) => node.id),
    ['tool:chat-1:tool-2', 'tool:chat-1:tool-3']
  );
});

test('timeline display keeps request control events as left-side request items', () => {
  const state = deriveChatTimelineState('chat-1', [
    {
      type: 'request.query',
      requestId: 'req-1',
      runId: 'run-1',
      message: '先查今年',
      timestamp: 100,
    },
    {
      type: 'request.steer',
      requestId: 'steer-1',
      runId: 'run-1',
      message: '请先把范围缩小到 2028 年和 2029 年。',
      timestamp: 120,
    },
  ]);

  const items = buildChatTimelineDisplayItems(state);
  assert.deepEqual(
    items.map((item) => item.kind),
    ['user-query', 'request']
  );
});

test('timeline display keeps system errors as standalone alert items', () => {
  const state = deriveChatTimelineState('chat-error', [
    {
      type: 'request.query',
      requestId: 'req-1',
      runId: 'run-error',
      message: '启动任务',
      timestamp: 100,
    },
    {
      type: 'run.error',
      runId: 'run-error',
      error: {
        code: 'stream_failed',
        category: 'chat_run',
        scope: 'run',
        status: 500,
        retryable: false,
        message: 'provider deepseek has empty apiKey',
      },
      timestamp: 120,
    },
  ]);

  const items = buildChatTimelineDisplayItems(state);
  assert.deepEqual(displayKinds(items), ['user-query', 'system-message']);

  const alertItem = items[1];
  assert.equal(alertItem.kind, 'system-message');
  if (alertItem.kind !== 'system-message' || alertItem.node.kind !== 'message') {
    throw new Error('expected system alert display item');
  }
  assert.equal(alertItem.isLastInRun, true);
  assert.equal(alertItem.node.role, 'system');
  assert.equal(alertItem.node.errorDetail?.code, 'stream_failed');
});

test('timeline display hides request echoes produced after awaiting answers', () => {
  const state = deriveChatTimelineState('chat-1', [
    {
      type: 'awaiting.ask',
      runId: 'run-1',
      awaitingId: 'question-1',
      mode: 'question',
      questions: [
        {
          id: 'q1',
          question: '您目前的工作状态是？',
          type: 'select',
          options: [{ label: '全职' }],
        },
      ],
      timestamp: 100,
    },
    {
      type: 'awaiting.answer',
      runId: 'run-1',
      awaitingId: 'question-1',
      status: 'answered',
      params: [{ id: 'q1', answer: '全职' }],
      timestamp: 120,
    },
    {
      type: 'request.submit',
      runId: 'run-1',
      requestId: 'submit-1',
      timestamp: 130,
    },
    {
      type: 'reasoning.snapshot',
      runId: 'run-1',
      reasoningId: 'reason-1',
      text: '等我捋一捋',
      timestamp: 140,
    },
  ]);

  const items = buildChatTimelineDisplayItems(state);

  assert.deepEqual(
    items.map((item) => item.kind),
    ['awaiting', 'reasoning']
  );
});

test('timeline display deduplicates persisted reasoning rows with the same run body', () => {
  const baseState = deriveChatTimelineState('chat-1', [
    {
      type: 'reasoning.snapshot',
      runId: 'run-1',
      reasoningId: 'reason-1',
      reasoningLabel: '思考过程',
      text: 'Simple greeting, just respond briefly.',
      timestamp: 100,
    },
    {
      type: 'content.snapshot',
      runId: 'run-1',
      contentId: 'answer-1',
      text: '仙尊大人好。',
      timestamp: 120,
    },
  ]);
  const firstReasoningId = 'reasoning:chat-1:run-1:reason-1';
  const duplicateReasoningId = 'reasoning:chat-1:run-1:reason-2';
  const firstReasoningNode = baseState.nodesById[firstReasoningId];
  if (!firstReasoningNode || firstReasoningNode.kind !== 'reasoning') {
    throw new Error('expected reasoning node');
  }
  const state = {
    ...baseState,
    orderedNodeIds: [firstReasoningId, duplicateReasoningId, ...baseState.orderedNodeIds.slice(1)],
    nodesById: {
      ...baseState.nodesById,
      [duplicateReasoningId]: {
        ...firstReasoningNode,
        id: duplicateReasoningId,
        title: 'Computing',
        updatedAt: 110,
        order: firstReasoningNode.order + 1,
      },
    },
    revision: baseState.revision + 1,
  };

  const items = buildChatTimelineDisplayItems(state);
  const reasoningItems = items.filter((item) => item.kind === 'reasoning');

  assert.deepEqual(
    items.map((item) => item.kind),
    ['reasoning', 'assistant-content', 'assistant-reply-footer']
  );
  assert.equal(reasoningItems.length, 1);
  assert.equal(reasoningItems[0]?.node.body, 'Simple greeting, just respond briefly.');
});

test('timeline display folds active backend reasoning titles into one visible row', () => {
  let state = deriveChatTimelineState('chat-1', [
    {
      type: 'reasoning.delta',
      runId: 'run-1',
      contentId: 'reasoning-title',
      reasoningLabel: 'Thinking',
      delta: 'Thinking',
      timestamp: 100,
    },
    {
      type: 'reasoning.delta',
      runId: 'run-1',
      reasoningId: 'reasoning-body',
      delta: 'Simple greeting, just respond briefly.',
      timestamp: 110,
    },
  ]);

  let items = buildChatTimelineDisplayItems(state);
  assert.deepEqual(displayKinds(items), ['reasoning']);
  assert.equal(items[0]?.node.kind, 'reasoning');
  assert.equal(items[0]?.node.title, 'Thinking');
  assert.equal(items[0]?.node.body, 'Simple greeting, just respond briefly.');
  assert.equal('streaming' in items[0]!.node ? items[0]!.node.streaming : false, true);

  state = applyChatTimelineEvent(state, 'chat-1', {
    type: 'run.complete',
    runId: 'run-1',
    timestamp: 120,
  });

  items = buildChatTimelineDisplayItems(state);
  assert.deepEqual(displayKinds(items), ['reasoning']);
  assert.equal(items[0]?.node.kind, 'reasoning');
  assert.equal(items[0]?.node.title, '');
  assert.equal(items[0]?.node.body, 'Simple greeting, just respond briefly.');
  assert.equal('streaming' in items[0]!.node ? items[0]!.node.streaming : true, false);
});

test('timeline display keeps completed reasoning body complete when an active backend title row remains', () => {
  const base = deriveChatTimelineState('chat-1', [
    {
      type: 'reasoning.snapshot',
      runId: 'run-1',
      reasoningId: 'reasoning-body',
      text: 'Simple greeting, just respond briefly.',
      timestamp: 110,
    },
  ]);
  const bodyId = 'reasoning:chat-1:run-1:reasoning-body';
  const titleId = 'reasoning:chat-1:run-1:reasoning-title';
  const bodyNode = base.nodesById[bodyId];
  if (!bodyNode || bodyNode.kind !== 'reasoning') {
    throw new Error('expected reasoning body node');
  }
  const state = {
    ...base,
    orderedNodeIds: [titleId, bodyId],
    nodesById: {
      ...base.nodesById,
      [titleId]: {
        ...bodyNode,
        id: titleId,
        title: 'Thinking',
        body: '',
        status: 'updating',
        streaming: true,
        lifecycle: 'active',
        createdAt: 100,
        updatedAt: 100,
        order: 0,
      },
      [bodyId]: {
        ...bodyNode,
        order: 1,
      },
    },
    nextOrder: 2,
    revision: base.revision + 1,
  };

  const items = buildChatTimelineDisplayItems(state);

  assert.deepEqual(displayKinds(items), ['reasoning']);
  assert.equal(items[0]?.node.kind, 'reasoning');
  assert.equal(items[0]?.node.title, '');
  assert.equal(items[0]?.node.body, 'Simple greeting, just respond briefly.');
  assert.equal(items[0]?.node.lifecycle, 'complete');
  assert.equal('streaming' in items[0]!.node ? items[0]!.node.streaming : true, false);
});

test('timeline display does not fold later reasoning titles across runtime rows', () => {
  const state = deriveChatTimelineState('chat-1', [
    {
      type: 'reasoning.snapshot',
      runId: 'run-1',
      reasoningId: 'reasoning-1',
      text: '先判断日期。',
      timestamp: 100,
    },
    {
      type: 'tool.snapshot',
      runId: 'run-1',
      toolCallId: 'tool-1',
      toolName: 'date_time',
      toolLabel: '日期时间',
      result: { date: '2026-06-24' },
      timestamp: 110,
    },
    {
      type: 'reasoning.delta',
      runId: 'run-1',
      contentId: 'reasoning-title',
      reasoningLabel: 'Pondering',
      delta: 'Pondering',
      timestamp: 120,
    },
  ]);

  const items = buildChatTimelineDisplayItems(state);
  assert.deepEqual(displayKinds(items), ['reasoning', 'tool', 'reasoning']);
  assert.equal(items[0]?.node.kind, 'reasoning');
  assert.equal(items[0]?.node.title, '');
  assert.equal(items[2]?.node.kind, 'reasoning');
  assert.equal(items[2]?.node.title, 'Pondering');
});

test('timeline display appends one assistant footer item per completed reply', () => {
  const state = deriveChatTimelineState('chat-1', [
    {
      type: 'content.snapshot',
      runId: 'run-1',
      contentId: 'answer-1',
      text: '第一段回复',
      timestamp: 100,
    },
    {
      type: 'reasoning.snapshot',
      runId: 'run-1',
      reasoningId: 'reason-1',
      text: '中间思考',
      timestamp: 110,
    },
    {
      type: 'content.snapshot',
      runId: 'run-1',
      contentId: 'answer-2',
      text: '第二段回复',
      timestamp: 120,
    },
  ]);

  const items = buildChatTimelineDisplayItems(state);
  const assistantItems = assistantContentItems(items);
  const footerItems = assistantReplyFooterItems(items);

  assert.deepEqual(displayKinds(items), [
    'assistant-content',
    'reasoning',
    'assistant-content',
    'assistant-reply-footer',
  ]);
  assert.equal(assistantItems.length, 2);
  assert.equal(footerItems.length, 1);
  assert.deepEqual(footerItems[0]?.footer, {
    copyText: '第一段回复\n\n第二段回复',
    timestamp: 120,
    durationMs: null,
    errorReason: null,
  });
});

test('timeline display keeps one assistant footer item across visible reply runs', () => {
  const state = deriveChatTimelineState('chat-1', [
    {
      type: 'request.query',
      requestId: 'req-1',
      runId: 'run-1',
      message: '先了解项目结构',
      timestamp: 90,
    },
    {
      type: 'content.snapshot',
      runId: 'run-1',
      contentId: 'answer-1',
      text: '我先看看项目结构。',
      timestamp: 100,
    },
    {
      type: 'tool.snapshot',
      runId: 'run-2',
      toolId: 'tool-1',
      toolName: 'find_files',
      toolLabel: '查找文件',
      arguments: '{"query":"theme"}',
      timestamp: 110,
    },
    {
      type: 'reasoning.snapshot',
      runId: 'run-2',
      reasoningId: 'reason-1',
      text: '继续判断颜色入口。',
      timestamp: 120,
    },
    {
      type: 'content.snapshot',
      runId: 'run-2',
      contentId: 'answer-2',
      text: '然后我会查看主题定义。',
      timestamp: 130,
    },
  ]);

  const items = buildChatTimelineDisplayItems(state);
  const assistantItems = assistantContentItems(items);
  const footerItems = assistantReplyFooterItems(items);

  assert.equal(assistantItems.length, 2);
  assert.equal(footerItems.length, 1);
  assert.equal(items[items.length - 1]?.kind, 'assistant-reply-footer');
  assert.deepEqual(footerItems[0]?.footer, {
    copyText: '我先看看项目结构。\n\n然后我会查看主题定义。',
    timestamp: 130,
    durationMs: null,
    errorReason: null,
  });
});

test('timeline display attaches run duration to the assistant footer item', () => {
  const state = deriveChatTimelineState('chat-1', [
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 1_000,
    },
    {
      type: 'content.snapshot',
      runId: 'run-1',
      contentId: 'answer-1',
      text: '第一段回复',
      timestamp: 30_000,
    },
    {
      type: 'content.snapshot',
      runId: 'run-1',
      contentId: 'answer-2',
      text: '第二段回复',
      timestamp: 80_000,
    },
    {
      type: 'run.complete',
      runId: 'run-1',
      timestamp: 81_000,
    },
  ]);

  const items = buildChatTimelineDisplayItems(state);
  const assistantItems = assistantContentItems(items);
  const footerItem = expectAssistantReplyFooterItem(items[items.length - 1]);

  assert.equal(assistantItems.length, 2);
  assert.deepEqual(footerItem.footer, {
    copyText: '第一段回复\n\n第二段回复',
    timestamp: 80_000,
    durationMs: 80_000,
    errorReason: null,
  });
});

test('timeline display appends combined reply footer after all visible reply runs finish', () => {
  const initial = deriveChatTimelineState('chat-1', [
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 1_000,
    },
    {
      type: 'content.snapshot',
      runId: 'run-1',
      contentId: 'answer-1',
      text: '先看结构。',
      timestamp: 2_000,
    },
    {
      type: 'run.start',
      runId: 'run-2',
      timestamp: 12_000,
    },
    {
      type: 'content.snapshot',
      runId: 'run-2',
      contentId: 'answer-2',
      text: '再看主题。',
      timestamp: 13_000,
    },
    {
      type: 'run.complete',
      runId: 'run-2',
      timestamp: 14_000,
    },
  ]);
  const initialModel = buildChatTimelineDisplayModel(initial);
  const tailItem = initialModel.items[initialModel.items.length - 1];

  assert.equal(tailItem?.kind, 'assistant-content');
  if (!tailItem || tailItem.kind !== 'assistant-content') {
    throw new Error('expected assistant content item');
  }
  assert.equal(assistantReplyFooterItems(initialModel.items).length, 0);

  const completedEarlierRun = applyChatTimelineEvent(initial, 'chat-1', {
    type: 'run.complete',
    runId: 'run-1',
    timestamp: 11_000,
  });
  const completedEarlierModel = buildChatTimelineDisplayModel(completedEarlierRun, initialModel);
  const completedTailItem = completedEarlierModel.items[completedEarlierModel.items.length - 1];
  const footerItem = expectAssistantReplyFooterItem(completedTailItem);

  assert.deepEqual(footerItem.footer, {
    copyText: '先看结构。\n\n再看主题。',
    timestamp: 13_000,
    durationMs: 2_000,
    errorReason: null,
  });
});

test('timeline display model appends assistant footer when a hidden run completes', () => {
  const initial = deriveChatTimelineState('chat-1', [
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 1_000,
    },
    {
      type: 'content.snapshot',
      runId: 'run-1',
      contentId: 'answer-1',
      text: '第一句',
      timestamp: 30_000,
    },
  ]);
  const initialModel = buildChatTimelineDisplayModel(initial);
  assert.equal(initialModel.items[0]?.kind, 'assistant-content');
  if (initialModel.items[0]?.kind !== 'assistant-content') {
    throw new Error('expected assistant content item');
  }
  assert.equal(assistantReplyFooterItems(initialModel.items).length, 0);

  const completed = applyChatTimelineEvent(initial, 'chat-1', {
    type: 'run.complete',
    runId: 'run-1',
    timestamp: 81_000,
  });
  const completedModel = buildChatTimelineDisplayModel(completed, initialModel);
  const footerItem = expectAssistantReplyFooterItem(completedModel.items[completedModel.items.length - 1]);

  assert.equal(completedModel.items.length, initialModel.items.length + 1);
  assert.deepEqual(completedModel.items[0], initialModel.items[0]);
  assert.equal(completedModel.items[0]?.kind, 'assistant-content');
  if (completedModel.items[0]?.kind !== 'assistant-content') {
    throw new Error('expected assistant content item');
  }
  assert.deepEqual(footerItem.footer, {
    copyText: '第一句',
    timestamp: 30_000,
    durationMs: 80_000,
    errorReason: null,
  });
  assert.notEqual(completedModel.tailSignature?.key, initialModel.tailSignature?.key);
});

test('timeline display model replaces only the visible tail item for stream deltas', () => {
  const initial = deriveChatTimelineState('chat-1', [
    {
      type: 'request.query',
      requestId: 'req-1',
      runId: 'run-1',
      message: '写一段摘要',
      timestamp: 100,
    },
    {
      type: 'content.delta',
      runId: 'run-1',
      contentId: 'answer-1',
      delta: '第一句',
      timestamp: 120,
    },
  ]);
  const initialModel = buildChatTimelineDisplayModel(initial);
  const tailItem = initialModel.items[initialModel.items.length - 1];
  assert.equal(tailItem?.kind, 'assistant-content');
  if (!tailItem || tailItem.kind !== 'assistant-content' || tailItem.node.kind !== 'message') {
    throw new Error('expected assistant tail item');
  }

  const streamed = applyChatTimelineStreamDelta(initial, {
    messageId: tailItem.node.messageId,
    createdAt: 140,
    delta: '，第二句',
  });
  const streamedModel = buildChatTimelineDisplayModel(streamed, initialModel);

  assert.equal(streamedModel.items.length, initialModel.items.length);
  assert.equal(streamedModel.items[0], initialModel.items[0]);
  assert.notEqual(streamedModel.items[1], initialModel.items[1]);
  assert.equal(streamedModel.items[1]?.kind, 'assistant-content');
  if (streamedModel.items[1]?.kind !== 'assistant-content') {
    throw new Error('expected assistant content item');
  }
  assert.equal(streamedModel.items[1].node.content, '第一句，第二句');
  assert.equal(streamedModel.tailSignature?.key, initialModel.tailSignature?.key);
});

test('timeline display suppresses assistant footer while following runtime is active', () => {
  const active = deriveChatTimelineState('chat-1', [
    {
      type: 'content.snapshot',
      runId: 'run-1',
      contentId: 'answer-1',
      text: '八月十四，那中秋是 9月12日，再验证：',
      timestamp: 100,
    },
    {
      type: 'tool.args',
      runId: 'run-2',
      toolCallId: 'tool-1',
      toolName: 'date_time',
      toolLabel: '日期时间',
      args: { timezone: 'Asia/Shanghai' },
      timestamp: 110,
    },
  ]);
  const activeModel = buildChatTimelineDisplayModel(active);
  const activeAssistantItems = assistantContentItems(activeModel.items);

  assert.equal(activeAssistantItems.length, 1);
  assert.equal(assistantReplyFooterItems(activeModel.items).length, 0);

  const completed = applyChatTimelineEvent(active, 'chat-1', {
    type: 'tool.result',
    toolCallId: 'tool-1',
    result: { ok: true },
    timestamp: 120,
  });
  const completedModel = buildChatTimelineDisplayModel(completed, activeModel);
  const completedAssistantItems = assistantContentItems(completedModel.items);
  const footerItem = expectAssistantReplyFooterItem(completedModel.items[completedModel.items.length - 1]);

  assert.equal(completedAssistantItems.length, 1);
  assert.deepEqual(footerItem.footer, {
    copyText: '八月十四，那中秋是 9月12日，再验证：',
    timestamp: 100,
    durationMs: null,
    errorReason: null,
  });
});

test('timeline display suppresses assistant footer while preceding runtime is active', () => {
  const state = deriveChatTimelineState('chat-1', [
    {
      type: 'tool.args',
      runId: 'run-1',
      toolCallId: 'tool-1',
      toolName: 'date_time',
      toolLabel: '日期时间',
      args: { timezone: 'Asia/Shanghai' },
      timestamp: 100,
    },
    {
      type: 'content.snapshot',
      runId: 'run-1',
      contentId: 'answer-1',
      text: '继续验证。',
      timestamp: 110,
    },
  ]);

  const items = buildChatTimelineDisplayItems(state);
  const assistantItems = assistantContentItems(items);

  assert.equal(assistantItems.length, 1);
  assert.equal(assistantReplyFooterItems(items).length, 0);
});

test('timeline display keeps assistant footer hidden between content end and run completion', () => {
  const initial = deriveChatTimelineState('chat-1', [
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 100,
    },
    {
      type: 'content.delta',
      runId: 'run-1',
      contentId: 'answer-1',
      delta: '第一句',
      timestamp: 120,
    },
  ]);
  const initialModel = buildChatTimelineDisplayModel(initial);

  assert.equal(assistantReplyFooterItems(initialModel.items).length, 0);

  const contentEnded = applyChatTimelineEvent(initial, 'chat-1', {
    type: 'content.end',
    runId: 'run-1',
    contentId: 'answer-1',
    text: '第一句完成',
    timestamp: 140,
  });
  const contentEndedModel = buildChatTimelineDisplayModel(contentEnded, initialModel);
  const contentEndedTail = expectAssistantContentItem(
    contentEndedModel.items[contentEndedModel.items.length - 1]
  );

  assert.equal(contentEndedTail.node.streaming, false);
  assert.equal(assistantReplyFooterItems(contentEndedModel.items).length, 0);

  const completed = applyChatTimelineEvent(contentEnded, 'chat-1', {
    type: 'run.complete',
    runId: 'run-1',
    timestamp: 180,
  });
  const completedModel = buildChatTimelineDisplayModel(completed, contentEndedModel);
  const footerItem = expectAssistantReplyFooterItem(completedModel.items[completedModel.items.length - 1]);

  assert.deepEqual(footerItem.footer, {
    copyText: '第一句完成',
    timestamp: 140,
    durationMs: 80,
    errorReason: null,
  });
});

test('timeline display keeps assistant footer suppressed on tail completion with prior active runtime', () => {
  const initial = deriveChatTimelineState('chat-1', [
    {
      type: 'content.snapshot',
      runId: 'run-1',
      contentId: 'answer-1',
      text: '先算到八月十四。',
      timestamp: 100,
    },
    {
      type: 'tool.args',
      runId: 'run-2',
      toolCallId: 'tool-1',
      toolName: 'date_time',
      toolLabel: '日期时间',
      args: { timezone: 'Asia/Shanghai' },
      timestamp: 110,
    },
    {
      type: 'content.delta',
      runId: 'run-2',
      contentId: 'answer-2',
      delta: '再验证：',
      timestamp: 120,
    },
  ]);
  const initialModel = buildChatTimelineDisplayModel(initial);
  const initialTail = expectAssistantContentItem(initialModel.items[initialModel.items.length - 1]);
  assert.equal(initialTail.node.streaming, true);
  assert.equal(assistantReplyFooterItems(initialModel.items).length, 0);

  const completedTail = applyChatTimelineEvent(initial, 'chat-1', {
    type: 'content.end',
    runId: 'run-2',
    contentId: 'answer-2',
    text: '再验证：',
    timestamp: 130,
  });
  const completedTailModel = buildChatTimelineDisplayModel(completedTail, initialModel);
  const completedTailItem = expectAssistantContentItem(
    completedTailModel.items[completedTailModel.items.length - 1]
  );
  assert.equal(completedTailItem.node.streaming, false);
  assert.equal(assistantReplyFooterItems(completedTailModel.items).length, 0);
});
