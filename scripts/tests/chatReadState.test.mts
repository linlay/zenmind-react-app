import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasChatReadStateInput,
  isChatUnread,
  mergeChatReadState,
  normalizeChatReadPatch,
  normalizeChatReadState,
  normalizeConversationUnreadCount,
} from '../../src/features/chatPersistence/chatReadState.ts';

test('normalizes structured read state with webclient defaults', () => {
  assert.deepEqual(normalizeChatReadState({ read: { isRead: false } }), {
    isRead: false,
    readAt: null,
    readRunId: null,
  });
  assert.deepEqual(normalizeChatReadState({ read: { readAt: 1_700_000_000 } }), {
    isRead: true,
    readAt: 1_700_000_000_000,
    readRunId: null,
  });
  assert.equal(isChatUnread({ read: { isRead: false } }), true);
  assert.equal(isChatUnread({ read: {} }), false);
  assert.equal(isChatUnread({}), false);
});

test('distinguishes absent read payloads from explicit read patches', () => {
  assert.equal(normalizeChatReadPatch({}), undefined);
  assert.equal(normalizeChatReadPatch({ read: undefined }), undefined);
  assert.equal(normalizeChatReadPatch({ readAt: 1_700_000_000, readRunId: 'run-1' }), undefined);
  assert.deepEqual(normalizeChatReadPatch({ read: { isRead: false } }), {
    isRead: false,
    readAt: null,
    readRunId: null,
  });
  assert.deepEqual(normalizeChatReadPatch({ read: { readAt: 1_700_000_000 } }), {
    isRead: true,
    readAt: 1_700_000_000_000,
    readRunId: null,
  });
});

test('normalizes legacy unread run count as a conversation unread flag', () => {
  assert.equal(normalizeConversationUnreadCount({ unreadRunCount: 3 }), 1);
  assert.equal(normalizeConversationUnreadCount({ unreadRunCount: 1 }), 1);
  assert.equal(normalizeConversationUnreadCount({ unreadRunCount: 0 }), 0);
});

test('merges partial read patches without clearing read metadata', () => {
  assert.deepEqual(
    mergeChatReadState(
      {
        read: {
          isRead: false,
          readAt: 1_700_000_000_000,
          readRunId: 'run-1',
        },
      },
      {
        read: {
          isRead: true,
        },
      }
    ),
    {
      isRead: true,
      readAt: 1_700_000_000_000,
      readRunId: 'run-1',
    }
  );
});

test('normalizes read status and read boolean payloads', () => {
  assert.equal(normalizeConversationUnreadCount({ readStatus: 0 }), 1);
  assert.equal(normalizeConversationUnreadCount({ readStatus: 1 }), 0);
  assert.equal(normalizeConversationUnreadCount({ readStatus: 1, unreadCount: 5 }), 0);
  assert.equal(normalizeConversationUnreadCount({ readStatus: 1, unreadRunCount: 5 }), 0);
  assert.equal(normalizeConversationUnreadCount({ read: false }), 1);
  assert.equal(normalizeConversationUnreadCount({ read: true }), 0);
  assert.equal(normalizeConversationUnreadCount({ read: true, unreadCount: 2 }), 0);
  assert.equal(normalizeConversationUnreadCount({ read: true, unreadRunCount: 2 }), 0);
  assert.equal(normalizeConversationUnreadCount({ read: 'false' }), 1);
  assert.equal(normalizeConversationUnreadCount({ read: 'true' }), 0);
});

test('normalizes scalar unread values and detects read payload presence', () => {
  assert.equal(normalizeConversationUnreadCount(2), 1);
  assert.equal(normalizeConversationUnreadCount('1'), 1);
  assert.equal(normalizeConversationUnreadCount(0), 0);
  assert.equal(normalizeConversationUnreadCount({}), 0);
  assert.equal(normalizeConversationUnreadCount(null), 0);
  assert.equal(hasChatReadStateInput({}), false);
  assert.equal(hasChatReadStateInput({ readAt: 1_700_000_000, readRunId: 'run-1' }), false);
  assert.equal(hasChatReadStateInput({ read: { isRead: true } }), true);
});
