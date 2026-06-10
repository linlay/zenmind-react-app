import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChatDatabaseName,
  buildChatDirectorySnapshotKey,
  CHAT_LEGACY_CACHE_SCOPE_ID,
  getChatCacheScopeId,
  normalizeChatCacheScopeId,
  setChatCacheScopeId,
} from '../../src/features/chatPersistence/cacheScope.ts';

test('chat cache scope keeps legacy database name for existing installs', () => {
  setChatCacheScopeId(CHAT_LEGACY_CACHE_SCOPE_ID);

  assert.equal(getChatCacheScopeId(), 'legacy');
  assert.equal(buildChatDatabaseName(), 'zenmind-chat-demo.db');
  assert.equal(buildChatDirectorySnapshotKey(), 'legacy:chat_directory_snapshot_v1');
});

test('chat cache scope maps valid profile scopes to isolated files and keys', () => {
  assert.equal(setChatCacheScopeId('cs_abc_123'), true);
  assert.equal(getChatCacheScopeId(), 'cs_abc_123');
  assert.equal(buildChatDatabaseName(), 'zenmind-chat-cs_abc_123.db');
  assert.equal(buildChatDirectorySnapshotKey(), 'cs_abc_123:chat_directory_snapshot_v1');
  assert.equal(setChatCacheScopeId('cs_abc_123'), false);
});

test('chat cache scope rejects unsafe file name characters', () => {
  assert.equal(normalizeChatCacheScopeId('../bad'), 'legacy');
  assert.equal(normalizeChatCacheScopeId('has space'), 'legacy');
  assert.equal(normalizeChatCacheScopeId(''), 'legacy');
});
