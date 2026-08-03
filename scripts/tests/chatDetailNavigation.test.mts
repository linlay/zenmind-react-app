import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChatDetailRouteParams,
  getAgentDetailPrewarmKeyForEmptyConversation,
} from '../../src/features/chatPersistence/chatDetailNavigation.ts';
import type { DirectoryConversationOpenResult } from '../../src/features/chatPersistence/chatRepository.ts';
import type { ChatDirectoryItem } from '../../src/features/chatPersistence/types.ts';

const source = {
  kind: 'paired',
  key: 'paired:desktop-test',
  sourceId: 'desktop-test',
  displayName: 'Test Desktop',
} as const;

const baseDirectoryItem: ChatDirectoryItem = {
  source,
  id: 'agent:assistant',
  kind: 'agent',
  title: 'Assistant',
  subtitle: 'Helpful agent',
  icon: null,
  unreadCount: 0,
  pinnedAt: 0,
  sortRank: 1,
  agentKey: 'assistant',
  teamId: null,
  defaultAgentKey: null,
  agentMode: 'chat',
  modelKey: 'model-a',
  reasoningEffort: 'LOW',
  latestConversationId: null,
  lastMessageText: '',
  lastMessageAt: 0,
};

const baseOpenResult: DirectoryConversationOpenResult = {
  conversation: {
    source,
    conversationId: 'conversation-1',
    title: 'Assistant',
    lastMessageText: '',
    lastMessageAt: 100,
    unreadCount: 0,
    lastMessageStatus: 'sent',
    pinnedAt: 0,
  },
  historyScope: {
    agentKey: 'assistant',
    teamId: null,
  },
  skipInitialReconcile: true,
};

test('chat detail route params carry directory target and open result', () => {
  const params = buildChatDetailRouteParams(baseDirectoryItem, baseOpenResult);

  assert.equal(params.conversationId, 'conversation-1');
  assert.equal(params.conversationSubtitle, 'Helpful agent');
  assert.equal(params.initialConversation, baseOpenResult.conversation);
  assert.equal(params.historyScope, baseOpenResult.historyScope);
  assert.equal(params.skipInitialReconcile, true);
  assert.deepEqual(params.conversationTarget, {
    source,
    kind: 'agent',
    title: 'Assistant',
    subtitle: 'Helpful agent',
    agentKey: 'assistant',
    teamId: null,
    agentMode: 'CHAT',
    modelKey: 'model-a',
    reasoningEffort: 'LOW',
  });
});

test('agent detail prewarm key is only derived for empty skip-reconcile conversations', () => {
  assert.equal(getAgentDetailPrewarmKeyForEmptyConversation(baseDirectoryItem, baseOpenResult), 'assistant');
  assert.equal(
    getAgentDetailPrewarmKeyForEmptyConversation(baseDirectoryItem, {
      ...baseOpenResult,
      skipInitialReconcile: false,
    }),
    null
  );
  assert.equal(
    getAgentDetailPrewarmKeyForEmptyConversation(baseDirectoryItem, {
      ...baseOpenResult,
      conversation: {
        ...baseOpenResult.conversation,
        lastMessageText: 'already has content',
      },
    }),
    null
  );
});
