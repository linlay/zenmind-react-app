import assert from 'node:assert/strict';
import test from 'node:test';

import {
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
    errorReason: null,
  });
});
