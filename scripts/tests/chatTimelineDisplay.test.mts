import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyChatTimelineEvent,
  applyChatTimelineStreamDelta,
  buildChatTimelineDisplayModel,
  buildChatTimelineDisplayItems,
  deriveChatTimelineState,
} from '../../src/features/chatTimeline/index.ts';

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
    ['user-query', 'tool-group', 'assistant-content']
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
    ['reasoning', 'assistant-content']
  );
  assert.equal(reasoningItems.length, 1);
  assert.equal(reasoningItems[0]?.node.body, 'Simple greeting, just respond briefly.');
});

test('timeline display puts one assistant footer on the final content item per reply', () => {
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

  const assistantItems = buildChatTimelineDisplayItems(state).filter(
    (item) => item.kind === 'assistant-content'
  );

  assert.equal(assistantItems.length, 2);
  assert.equal(assistantItems[0]?.assistantReplyFooter, null);
  assert.deepEqual(assistantItems[1]?.assistantReplyFooter, {
    copyText: '第一段回复\n\n第二段回复',
    timestamp: 120,
    durationMs: null,
    errorReason: null,
  });
});

test('timeline display keeps one assistant footer across visible reply runs', () => {
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

  const assistantItems = buildChatTimelineDisplayItems(state).filter(
    (item) => item.kind === 'assistant-content'
  );

  assert.equal(assistantItems.length, 2);
  assert.equal(assistantItems[0]?.assistantReplyFooter, null);
  assert.deepEqual(assistantItems[1]?.assistantReplyFooter, {
    copyText: '我先看看项目结构。\n\n然后我会查看主题定义。',
    timestamp: 130,
    durationMs: null,
    errorReason: null,
  });
});

test('timeline display attaches run duration to the final assistant footer', () => {
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

  const assistantItems = buildChatTimelineDisplayItems(state).filter(
    (item) => item.kind === 'assistant-content'
  );

  assert.equal(assistantItems.length, 2);
  assert.equal(assistantItems[0]?.assistantReplyFooter, null);
  assert.deepEqual(assistantItems[1]?.assistantReplyFooter, {
    copyText: '第一段回复\n\n第二段回复',
    timestamp: 80_000,
    durationMs: 80_000,
    errorReason: null,
  });
});

test('timeline display keeps combined reply duration tied to the final assistant run', () => {
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
  assert.deepEqual(tailItem.assistantReplyFooter, {
    copyText: '先看结构。\n\n再看主题。',
    timestamp: 13_000,
    durationMs: 2_000,
    errorReason: null,
  });

  const completedEarlierRun = applyChatTimelineEvent(initial, 'chat-1', {
    type: 'run.complete',
    runId: 'run-1',
    timestamp: 11_000,
  });
  const completedEarlierModel = buildChatTimelineDisplayModel(completedEarlierRun, initialModel);
  const completedTailItem = completedEarlierModel.items[completedEarlierModel.items.length - 1];

  assert.equal(completedTailItem?.kind, 'assistant-content');
  if (!completedTailItem || completedTailItem.kind !== 'assistant-content') {
    throw new Error('expected assistant content item');
  }
  assert.equal(completedTailItem.assistantReplyFooter?.durationMs, 2_000);
});

test('timeline display model updates only the assistant footer when a hidden run completes', () => {
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
  assert.equal(initialModel.items[0].assistantReplyFooter?.durationMs, null);

  const completed = applyChatTimelineEvent(initial, 'chat-1', {
    type: 'run.complete',
    runId: 'run-1',
    timestamp: 81_000,
  });
  const completedModel = buildChatTimelineDisplayModel(completed, initialModel);

  assert.equal(completedModel.items.length, initialModel.items.length);
  assert.notEqual(completedModel.items[0], initialModel.items[0]);
  assert.equal(completedModel.items[0]?.kind, 'assistant-content');
  if (completedModel.items[0]?.kind !== 'assistant-content') {
    throw new Error('expected assistant content item');
  }
  assert.equal(completedModel.items[0].assistantReplyFooter?.durationMs, 80_000);
  assert.equal(completedModel.tailSignature, initialModel.tailSignature);
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
      type: 'content.snapshot',
      runId: 'run-1',
      contentId: 'answer-1',
      text: '第一句',
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
  assert.equal(streamedModel.items[1].assistantReplyFooter, null);
  assert.equal(streamedModel.tailSignature?.key, initialModel.tailSignature?.key);
});
