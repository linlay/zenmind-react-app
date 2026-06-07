import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getChatConversationHistoryScopeKey,
  normalizeChatConversationHistoryScope,
} from '../../src/features/chatPersistence/chatHistoryScope.ts';

test('history scope normalizes to one worker dimension', () => {
  assert.deepEqual(
    normalizeChatConversationHistoryScope({
      agentKey: 'agent-a',
      teamId: 'team-a',
    }),
    {
      agentKey: null,
      teamId: 'team-a',
    }
  );
  assert.deepEqual(normalizeChatConversationHistoryScope({ agentKey: ' agent-a ' }), {
    agentKey: 'agent-a',
    teamId: null,
  });
  assert.equal(normalizeChatConversationHistoryScope({ agentKey: ' ', teamId: '' }), null);
});

test('history scope key is stable for subscriptions and hook resets', () => {
  assert.equal(getChatConversationHistoryScopeKey({ agentKey: 'agent-a' }), 'agent:agent-a');
  assert.equal(getChatConversationHistoryScopeKey({ teamId: 'team-a' }), 'team:team-a');
  assert.equal(getChatConversationHistoryScopeKey(null), '');
});
