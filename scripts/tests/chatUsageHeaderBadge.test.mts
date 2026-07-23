import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const USAGE_BADGE_SOURCE = readFileSync(
  'src/features/chatPersistence/components/ChatUsageHeaderBadge.tsx',
  'utf8'
);
const EN_MESSAGES_SOURCE = readFileSync('src/shared/i18n/messages/en-US.ts', 'utf8');
const ZH_MESSAGES_SOURCE = readFileSync('src/shared/i18n/messages/zh-CN.ts', 'utf8');

test('usage section header keeps PC metric order and wraps without measurement state', () => {
  const labelIndexes = [
    "label: t('usage.metric.firstTokenLatency')",
    "label: t('usage.metric.outputTokensPerSecond')",
    "label: t('usage.call.llm')",
    "label: t('usage.call.tool')",
  ].map((label) => USAGE_BADGE_SOURCE.indexOf(label));

  assert.ok(labelIndexes.every((index) => index >= 0));
  assert.deepEqual(labelIndexes, [...labelIndexes].sort((left, right) => left - right));
  assert.match(USAGE_BADGE_SOURCE, /USAGE_CALL_COUNTS_CLASS[\s\S]*flex-row flex-wrap justify-end/u);
  assert.match(USAGE_BADGE_SOURCE, /resolveChatUsageToolCallCount\(stats\)/u);
  assert.match(
    USAGE_BADGE_SOURCE,
    /usageSummary\.compact[\s\S]*showTiming=\{false\}/u
  );
  assert.doesNotMatch(USAGE_BADGE_SOURCE, /onLayout|useWindowDimensions|Dimensions\.addEventListener/u);
});

test('usage timing and tool labels stay aligned in Chinese and English', () => {
  assert.match(ZH_MESSAGES_SOURCE, /'usage\.metric\.firstTokenLatency': '首字延迟'/u);
  assert.match(ZH_MESSAGES_SOURCE, /'usage\.metric\.outputTokensPerSecond': '输出速度'/u);
  assert.match(ZH_MESSAGES_SOURCE, /'usage\.call\.tool': '工具调用'/u);
  assert.match(EN_MESSAGES_SOURCE, /'usage\.metric\.firstTokenLatency': 'First token'/u);
  assert.match(EN_MESSAGES_SOURCE, /'usage\.metric\.outputTokensPerSecond': 'Output speed'/u);
  assert.match(EN_MESSAGES_SOURCE, /'usage\.call\.tool': 'Tool calls'/u);
});
