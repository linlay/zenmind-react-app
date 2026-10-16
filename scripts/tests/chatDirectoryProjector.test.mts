import assert from 'node:assert/strict';
import test from 'node:test';
import {
  projectRemoteDirectory,
  projectRemoteHomeDirectory
} from '../../src/features/chatPersistence/chatDirectoryProjector.ts';
import { createChatConversationTarget } from '../../src/features/chatPersistence/chatConversationTarget.ts';
test('TEAM shares the Agent directory and retains the root Agent through navigation', () => {
  const items = projectRemoteDirectory([
    { key: 'root', name: 'Team', mode: 'TEAM' },
    { key: 'worker', name: 'Worker', mode: 'GENERAL' },
    { key: 'root' }
  ]);
  assert.equal(items.length, 2);
  assert.equal(items[0].kind, 'agent');
  assert.equal(items[0].agentKey, 'root');
  const target = createChatConversationTarget(items[0]);
  assert.equal(target?.agentKey, 'root');
  assert.equal(target?.agentMode, 'TEAM');
});
test('home summaries bind preview and unread counts to their root Agent', () => {
  const now = 1792057310000;
  const result = projectRemoteHomeDirectory({
    agents: [{ key: 'root', mode: 'TEAM' }, { key: 'worker' }],
    chats: [
      { chatId: 'older', agentKey: 'root', lastRunContent: 'old', updatedAt: now - 1000, read: { isRead: false } },
      { chatId: 'newer', agentKey: 'root', lastRunContent: 'new', updatedAt: now, read: { isRead: false } },
      { chatId: 'empty', agentKey: 'root', lastRunContent: '', updatedAt: now + 1000, read: { isRead: true } }
    ]
  });
  assert.equal(result.directoryItems[0].latestConversationId, 'newer');
  assert.equal(result.directoryItems[0].unreadCount, 2);
  assert.equal(result.directoryItems[1].latestConversationId, null);
});
