import assert from 'node:assert/strict';
import test from 'node:test';

import { formatConversationTimestamp } from '../../src/shared/visual/foundation.ts';

test('formats chat list timestamps by day and year boundaries', () => {
  const now = new Date(2026, 4, 28, 12, 0).getTime();

  assert.equal(formatConversationTimestamp(new Date(2026, 4, 28, 8, 5).getTime(), now), '08:05');
  assert.equal(formatConversationTimestamp(new Date(2026, 4, 21, 8, 5).getTime(), now), '05-21');
  assert.equal(formatConversationTimestamp(new Date(2025, 11, 21, 8, 5).getTime(), now), '2025-12');
  assert.equal(formatConversationTimestamp(0, now), '');
});
