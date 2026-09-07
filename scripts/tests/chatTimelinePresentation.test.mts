import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyChatTimelineEvent,
  applyChatTimelineRunUnavailable,
  buildChatTimelineDisplayItems,
  buildChatTimelinePresentationItems,
  deriveChatTimelineState,
  type ChatTimelinePresentationItem
} from '../../src/features/chatTimeline/index.ts';

function presentationKinds(items: readonly ChatTimelinePresentationItem[]): string[] {
  return items.map((item) => item.kind);
}

test('active runs and content end keep the existing timeline visible', () => {
  const active = deriveChatTimelineState('chat-active', [
    { type: 'run.start', runId: 'run-1', timestamp: 1_000 },
    {
      type: 'reasoning.snapshot',
      runId: 'run-1',
      reasoningId: 'reasoning-1',
      text: '先检查上下文。',
      timestamp: 1_100
    },
    {
      type: 'content.end',
      runId: 'run-1',
      contentId: 'answer-1',
      text: '最终回答',
      timestamp: 1_200
    }
  ]);
  const displayItems = buildChatTimelineDisplayItems(active);
  const presentationItems = buildChatTimelinePresentationItems(active, displayItems, new Set());

  assert.deepEqual(presentationKinds(presentationItems), presentationKinds(displayItems));
  assert.deepEqual(
    presentationItems.map((item) => item.key),
    displayItems.map((item) => item.key)
  );
});

test('run unavailable fallback does not fold without an explicit terminal event', () => {
  let state = deriveChatTimelineState('chat-unavailable', [
    { type: 'run.start', runId: 'run-1', timestamp: 1_000 },
    {
      type: 'reasoning.snapshot',
      runId: 'run-1',
      reasoningId: 'reasoning-1',
      text: '仍在处理。',
      timestamp: 1_100
    }
  ]);
  state = applyChatTimelineRunUnavailable(state, 'chat-unavailable', {
    runId: 'run-1',
    timestamp: 1_200
  });

  const displayItems = buildChatTimelineDisplayItems(state);
  const presentationItems = buildChatTimelinePresentationItems(state, displayItems, new Set());

  assert.deepEqual(presentationKinds(presentationItems), presentationKinds(displayItems));
});

test('completed runs collapse process rows and keep the final answer visible', () => {
  const state = deriveChatTimelineState('chat-complete', [
    { type: 'run.start', runId: 'run-1', timestamp: 1_000 },
    {
      type: 'reasoning.snapshot',
      runId: 'run-1',
      reasoningId: 'reasoning-1',
      text: '先检查上下文。',
      timestamp: 1_100
    },
    {
      type: 'content.snapshot',
      runId: 'run-1',
      contentId: 'commentary-1',
      text: '我先看看当前实现。',
      timestamp: 1_200
    },
    {
      type: 'tool.snapshot',
      runId: 'run-1',
      toolId: 'tool-1',
      toolName: 'search',
      toolLabel: '搜索',
      result: { ok: true },
      timestamp: 1_300
    },
    {
      type: 'content.snapshot',
      runId: 'run-1',
      contentId: 'answer-1',
      text: '这是最终回答。',
      timestamp: 1_400
    },
    { type: 'run.complete', runId: 'run-1', timestamp: 173_000 }
  ]);
  const displayItems = buildChatTimelineDisplayItems(state);
  const collapsed = buildChatTimelinePresentationItems(state, displayItems, new Set());

  assert.deepEqual(presentationKinds(collapsed), ['process-summary', 'assistant-content', 'assistant-reply-footer']);
  const summary = collapsed[0];
  assert.equal(summary?.kind, 'process-summary');
  if (summary?.kind !== 'process-summary') {
    throw new Error('expected process summary');
  }
  assert.equal(summary.terminalStatus, 'completed');
  assert.equal(summary.durationMs, 172_000);
  assert.equal(summary.expanded, false);
  assert.equal(collapsed[1]?.kind, 'assistant-content');
  if (collapsed[1]?.kind !== 'assistant-content' || collapsed[1].node.kind !== 'message') {
    throw new Error('expected final assistant content');
  }
  assert.equal(collapsed[1].node.content, '这是最终回答。');

  const expanded = buildChatTimelinePresentationItems(state, displayItems, new Set([summary.processId]));
  assert.deepEqual(presentationKinds(expanded), [
    'process-summary',
    'reasoning',
    'assistant-content',
    'tool',
    'assistant-content',
    'assistant-reply-footer'
  ]);
  assert.equal(expanded[0]?.kind === 'process-summary' && expanded[0].expanded, true);
  assert.deepEqual(
    expanded.slice(1, -2).map((item) => item.key),
    displayItems.slice(0, -2).map((item) => item.key)
  );
});

test('cancelled and failed runs use distinct terminal summaries while errors stay visible', () => {
  const cancelled = deriveChatTimelineState('chat-cancelled', [
    { type: 'run.start', runId: 'run-cancelled', timestamp: 1_000 },
    {
      type: 'reasoning.snapshot',
      runId: 'run-cancelled',
      reasoningId: 'reasoning-1',
      text: '处理中。',
      timestamp: 1_100
    },
    { type: 'run.cancel', runId: 'run-cancelled', timestamp: 2_000 }
  ]);
  const cancelledItems = buildChatTimelinePresentationItems(
    cancelled,
    buildChatTimelineDisplayItems(cancelled),
    new Set()
  );
  assert.deepEqual(presentationKinds(cancelledItems), ['process-summary']);
  assert.equal(cancelledItems[0]?.kind === 'process-summary' && cancelledItems[0].terminalStatus, 'cancelled');

  const failed = deriveChatTimelineState('chat-failed', [
    { type: 'run.start', runId: 'run-failed', timestamp: 1_000 },
    {
      type: 'reasoning.snapshot',
      runId: 'run-failed',
      reasoningId: 'reasoning-1',
      text: '处理中。',
      timestamp: 1_100
    },
    {
      type: 'run.error',
      runId: 'run-failed',
      error: { code: 'stream_failed', message: '连接已中断' },
      timestamp: 2_000
    }
  ]);
  const failedItems = buildChatTimelinePresentationItems(failed, buildChatTimelineDisplayItems(failed), new Set());
  assert.deepEqual(presentationKinds(failedItems), ['process-summary', 'system-message']);
  assert.equal(failedItems[0]?.kind === 'process-summary' && failedItems[0].terminalStatus, 'error');
  assert.equal(failedItems[1]?.kind, 'system-message');
});

test('missing run metadata and runs without process rows keep the original display', () => {
  const withoutRun = deriveChatTimelineState('chat-without-run', [
    {
      type: 'reasoning.snapshot',
      runId: 'run-missing',
      reasoningId: 'reasoning-1',
      text: '历史思考。',
      timestamp: 1_100
    }
  ]);
  const withoutRunDisplay = buildChatTimelineDisplayItems(withoutRun);
  const withoutRunPresentation = buildChatTimelinePresentationItems(withoutRun, withoutRunDisplay, new Set());
  assert.deepEqual(presentationKinds(withoutRunPresentation), ['reasoning']);

  const answerOnly = deriveChatTimelineState('chat-answer-only', [
    { type: 'run.start', runId: 'run-answer', timestamp: 1_000 },
    {
      type: 'content.snapshot',
      runId: 'run-answer',
      contentId: 'answer-1',
      text: '直接回答。',
      timestamp: 1_100
    },
    { type: 'run.complete', runId: 'run-answer', timestamp: 2_000 }
  ]);
  const answerOnlyItems = buildChatTimelinePresentationItems(
    answerOnly,
    buildChatTimelineDisplayItems(answerOnly),
    new Set()
  );
  assert.deepEqual(presentationKinds(answerOnlyItems), ['assistant-content', 'assistant-reply-footer']);
});

test('multiple completed runs expand independently and retain stable rail framing', () => {
  let state = deriveChatTimelineState('chat-multiple', [
    { type: 'run.start', runId: 'run-1', timestamp: 1_000 },
    {
      type: 'reasoning.snapshot',
      runId: 'run-1',
      reasoningId: 'reasoning-1',
      text: '第一段思考。',
      timestamp: 1_100
    },
    {
      type: 'content.snapshot',
      runId: 'run-1',
      contentId: 'answer-1',
      text: '第一段回答。',
      timestamp: 1_200
    },
    { type: 'run.complete', runId: 'run-1', timestamp: 2_000 },
    { type: 'run.start', runId: 'run-2', timestamp: 3_000 },
    {
      type: 'reasoning.snapshot',
      runId: 'run-2',
      reasoningId: 'reasoning-2',
      text: '第二段思考。',
      timestamp: 3_100
    },
    {
      type: 'content.snapshot',
      runId: 'run-2',
      contentId: 'answer-2',
      text: '第二段回答。',
      timestamp: 3_200
    }
  ]);
  state = applyChatTimelineEvent(state, 'chat-multiple', {
    type: 'run.complete',
    runId: 'run-2',
    timestamp: 4_000
  });
  const displayItems = buildChatTimelineDisplayItems(state);
  const collapsed = buildChatTimelinePresentationItems(state, displayItems, new Set());
  const summaries = collapsed.filter((item) => item.kind === 'process-summary');
  assert.equal(summaries.length, 2);
  assert.deepEqual(presentationKinds(collapsed), [
    'process-summary',
    'assistant-content',
    'process-summary',
    'assistant-content',
    'assistant-reply-footer'
  ]);

  const firstSummary = summaries[0];
  if (!firstSummary || firstSummary.kind !== 'process-summary') {
    throw new Error('expected first process summary');
  }
  const firstExpanded = buildChatTimelinePresentationItems(state, displayItems, new Set([firstSummary.processId]));
  assert.deepEqual(presentationKinds(firstExpanded), [
    'process-summary',
    'reasoning',
    'assistant-content',
    'process-summary',
    'assistant-content',
    'assistant-reply-footer'
  ]);
  const firstRunItems = firstExpanded.filter(
    (item) => item.kind !== 'assistant-reply-footer' && item.runId === 'run-1'
  );
  assert.deepEqual(
    firstRunItems.map((item) => [item.groupIndex, item.isFirstInRun, item.isLastInRun]),
    [
      [0, true, false],
      [1, false, false],
      [2, false, true]
    ]
  );
});
