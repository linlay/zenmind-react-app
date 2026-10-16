import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeChatConversationHistoryScope,
  getChatConversationHistoryScopeKey
} from '../../src/features/chatPersistence/chatHistoryScope.ts';
test('history has exactly one normalized root Agent owner', () => {
  assert.deepEqual(normalizeChatConversationHistoryScope({ agentKey: ' root ' }), { agentKey: 'root' });
  assert.equal(normalizeChatConversationHistoryScope({ agentKey: ' ' }), null);
  assert.equal(getChatConversationHistoryScopeKey({ agentKey: 'root' }), 'agent:root');
  assert.equal(getChatConversationHistoryScopeKey(null), '');
});
