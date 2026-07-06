import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatChatDetailDuration,
  formatChatDetailRunningDuration,
  formatChatDetailTimestamp,
} from '../../src/features/chatPersistence/chatDetailFormatters.ts';
import { createTranslator } from '../../src/shared/i18n/translate.ts';

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
