import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatChatDetailDuration,
  formatChatDetailRunningDuration,
  formatChatDetailTimestamp,
  formatChatUsageEstimatedCost,
  formatChatUsageFirstTokenLatency,
  formatChatUsageOutputSpeed,
  hasChatUsageStatsData,
  resolveChatUsageToolCallCount,
} from '../../src/features/chatPersistence/chatDetailFormatters.ts';
import type { ChatTimelineUsageStats } from '../../src/features/chatTimeline/index.ts';
import { createTranslator } from '../../src/shared/i18n/translate.ts';

function createUsageStats(patch: Partial<ChatTimelineUsageStats> = {}): ChatTimelineUsageStats {
  return {
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    reasoningTokens: null,
    cacheHitTokens: null,
    cacheMissTokens: null,
    llmChatCompletionCount: null,
    toolCallCount: null,
    estimatedCost: null,
    timing: {
      firstTokenLatencyMs: null,
      firstTokenLatencyTotalMs: null,
      firstTokenLatencyCount: null,
      generationDurationMs: null,
    },
    ...patch,
  };
}

test('formats chat detail timestamps for timeline footers and history rows', () => {
  const now = new Date(2026, 5, 11, 12, 0).getTime();

  assert.equal(formatChatDetailTimestamp(new Date(2026, 5, 11, 8, 5).getTime(), now), '今天 08:05');
  assert.equal(formatChatDetailTimestamp(new Date(2026, 5, 10, 8, 5).getTime(), now), '昨天 08:05');
  assert.equal(
    formatChatDetailTimestamp(new Date(2026, 5, 11, 8, 5).getTime(), now, 'Today', 'Yesterday'),
    'Today 08:05'
  );
  assert.equal(
    formatChatDetailTimestamp(new Date(2026, 5, 10, 8, 5).getTime(), now, 'Yesterday'),
    'Yesterday 08:05'
  );
  assert.equal(
    formatChatDetailTimestamp(new Date(2026, 5, 10, 8, 5).getTime(), now, 'Today', 'Yesterday'),
    'Yesterday 08:05'
  );
  assert.equal(
    formatChatDetailTimestamp(
      new Date(2025, 11, 31, 23, 59).getTime(),
      new Date(2026, 0, 1, 1, 0).getTime()
    ),
    '昨天 23:59'
  );
  assert.equal(
    formatChatDetailTimestamp(new Date(2026, 5, 9, 8, 5).getTime(), now),
    '06/09 08:05'
  );
  assert.equal(
    formatChatDetailTimestamp(new Date(2025, 11, 21, 8, 5).getTime(), now),
    '2025/12/21 08:05'
  );
  assert.equal(formatChatDetailTimestamp(0, now), '');
});

test('formats chat detail durations from the largest unit down to seconds', () => {
  const enT = createTranslator('en-US');

  assert.equal(formatChatDetailDuration(0), '0秒');
  assert.equal(formatChatDetailDuration(800), '0.8秒');
  assert.equal(formatChatDetailDuration(59_000), '59秒');
  assert.equal(formatChatDetailDuration(59_050), '59.1秒');
  assert.equal(formatChatDetailDuration(80_000), '1分20秒');
  assert.equal(formatChatDetailDuration(80_100), '1分20.1秒');
  assert.equal(formatChatDetailDuration(3_723_400), '1时2分3.4秒');
  assert.equal(formatChatDetailDuration(3_723_400, enT), '1h 2m 3.4s');
  assert.equal(formatChatDetailDuration(null), '');
  assert.equal(formatChatDetailDuration(-1), '');
});

test('formats running tool duration in whole seconds after the first second', () => {
  assert.equal(formatChatDetailRunningDuration(1_000, 1_999), '');
  assert.equal(formatChatDetailRunningDuration(1_000, 2_000), '1s');
  assert.equal(formatChatDetailRunningDuration(1_000, 3_400), '2s');
  assert.equal(formatChatDetailRunningDuration(null, 3_400), '');
  assert.equal(formatChatDetailRunningDuration(3_400, 3_400), '');
});

test('formats usage latency and output speed with PC-compatible rules', () => {
  assert.equal(
    formatChatUsageFirstTokenLatency(
      createUsageStats({
        timing: {
          firstTokenLatencyMs: 820,
          firstTokenLatencyTotalMs: null,
          firstTokenLatencyCount: null,
          generationDurationMs: null,
        },
      })
    ),
    '820ms'
  );
  assert.equal(
    formatChatUsageFirstTokenLatency(
      createUsageStats({
        timing: {
          firstTokenLatencyMs: null,
          firstTokenLatencyTotalMs: 21_200,
          firstTokenLatencyCount: 2,
          generationDurationMs: null,
        },
      })
    ),
    '10.6s'
  );
  assert.equal(
    formatChatUsageOutputSpeed(
      createUsageStats({
        completionTokens: 47,
        timing: {
          firstTokenLatencyMs: null,
          firstTokenLatencyTotalMs: null,
          firstTokenLatencyCount: null,
          generationDurationMs: 880,
        },
      })
    ),
    '53.4/s'
  );
  assert.equal(
    formatChatUsageOutputSpeed(
      createUsageStats({
        completionTokens: 47,
        timing: {
          firstTokenLatencyMs: null,
          firstTokenLatencyTotalMs: null,
          firstTokenLatencyCount: null,
          generationDurationMs: 0,
        },
      })
    ),
    null
  );
});

test('formats usage costs in yuan and preserves empty-section tool semantics', () => {
  assert.equal(
    formatChatUsageEstimatedCost(
      {
        currency: 'CNY',
        inputCacheHit: null,
        inputCacheMiss: null,
        output: null,
        total: 0.0174,
      },
      'zh-CN'
    ),
    '¥0.0174'
  );
  assert.equal(
    formatChatUsageEstimatedCost(
      {
        currency: 'USD',
        inputCacheHit: null,
        inputCacheMiss: null,
        output: null,
        total: 0.0123,
      },
      'en-US'
    ),
    '$0.01'
  );
  assert.equal(
    formatChatUsageEstimatedCost(
      {
        currency: '',
        inputCacheHit: null,
        inputCacheMiss: null,
        output: null,
        total: 0.0174,
      },
      'zh-CN'
    ),
    '0.0174'
  );

  const emptyStats = createUsageStats();
  const populatedStats = createUsageStats({ totalTokens: 8_259 });
  assert.equal(hasChatUsageStatsData(emptyStats), false);
  assert.equal(resolveChatUsageToolCallCount(emptyStats), null);
  assert.equal(resolveChatUsageToolCallCount(populatedStats), 0);
  assert.equal(resolveChatUsageToolCallCount(createUsageStats({ toolCallCount: 3 })), 3);
});
