import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldApplyChatDetailAsyncResult } from '../../src/features/chatPersistence/chatDetailAsyncScope.ts';

test('async result guard only applies when conversation and request id still match', () => {
  assert.equal(
    shouldApplyChatDetailAsyncResult({
      activeConversationId: 'chat-1',
      targetConversationId: 'chat-1',
      currentRequestId: 3,
      requestId: 3,
    }),
    true
  );
  assert.equal(
    shouldApplyChatDetailAsyncResult({
      activeConversationId: 'chat-2',
      targetConversationId: 'chat-1',
      currentRequestId: 3,
      requestId: 3,
    }),
    false
  );
  assert.equal(
    shouldApplyChatDetailAsyncResult({
      activeConversationId: 'chat-1',
      targetConversationId: 'chat-1',
      currentRequestId: 4,
      requestId: 3,
    }),
    false
  );
});
