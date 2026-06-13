import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatChatDetailDuration,
  formatChatDetailTimestamp,
} from '../../src/features/chatPersistence/chatDetailFormatters.ts';

test('formats chat detail timestamps with full date for non-today messages', () => {
  const now = new Date(2026, 5, 11, 12, 0).getTime();

  assert.equal(formatChatDetailTimestamp(new Date(2026, 5, 11, 8, 5).getTime(), now), '08:05');
  assert.equal(
    formatChatDetailTimestamp(new Date(2026, 5, 10, 8, 5).getTime(), now),
    '2026/06/10 08:05'
  );
  assert.equal(
    formatChatDetailTimestamp(new Date(2025, 11, 21, 8, 5).getTime(), now),
    '2025/12/21 08:05'
  );
  assert.equal(formatChatDetailTimestamp(0, now), '');
});

test('formats chat detail durations from the largest unit down to seconds', () => {
  assert.equal(formatChatDetailDuration(0), '0秒');
  assert.equal(formatChatDetailDuration(800), '0.8秒');
  assert.equal(formatChatDetailDuration(59_000), '59秒');
  assert.equal(formatChatDetailDuration(59_050), '59.1秒');
  assert.equal(formatChatDetailDuration(80_000), '1分20秒');
  assert.equal(formatChatDetailDuration(80_100), '1分20.1秒');
  assert.equal(formatChatDetailDuration(3_723_400), '1时2分3.4秒');
  assert.equal(formatChatDetailDuration(null), '');
  assert.equal(formatChatDetailDuration(-1), '');
});
