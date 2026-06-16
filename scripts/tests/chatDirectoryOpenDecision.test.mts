import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isActiveTimelinePayload,
  shouldOpenLatestConversationFromSummary,
  type ChatDirectoryLatestConversationSummary,
} from '../../src/features/chatPersistence/chatDirectoryOpenDecision.ts';

const baseSummary: ChatDirectoryLatestConversationSummary = {
  unreadCount: 0,
  isRead: 1,
  readAt: null,
  readRunId: null,
  lastMessageStatus: 'sent',
  activeRunId: '',
};

test('directory open decision keeps read and completed latest conversations closed', () => {
  assert.equal(shouldOpenLatestConversationFromSummary(baseSummary), false);
  assert.equal(
    shouldOpenLatestConversationFromSummary({
      ...baseSummary,
      isRead: null,
    }),
    false
  );
  assert.equal(
    shouldOpenLatestConversationFromSummary({
      ...baseSummary,
      unreadCount: 1,
    }),
    false
  );
});

test('directory open decision opens unread latest conversations', () => {
  assert.equal(
    shouldOpenLatestConversationFromSummary({
      ...baseSummary,
      isRead: 0,
    }),
    true
  );
  assert.equal(
    shouldOpenLatestConversationFromSummary({
      ...baseSummary,
      isRead: undefined,
      unreadCount: 1,
    }),
    true
  );
  assert.equal(
    shouldOpenLatestConversationFromSummary({
      ...baseSummary,
      isRead: null,
      unreadCount: 1,
    }),
    true
  );
});

test('directory open decision opens non-terminal latest conversations', () => {
  assert.equal(
    shouldOpenLatestConversationFromSummary({
      ...baseSummary,
      lastMessageStatus: 'pending',
    }),
    true
  );
  assert.equal(
    shouldOpenLatestConversationFromSummary({
      ...baseSummary,
      activeRunId: 'run-1',
    }),
    true
  );
});

test('directory open decision detects active persisted timeline payloads', () => {
  assert.equal(isActiveTimelinePayload(JSON.stringify({ lifecycle: 'active' })), true);
  assert.equal(isActiveTimelinePayload(JSON.stringify({ lifecycle: 'complete' })), false);
  assert.equal(isActiveTimelinePayload(JSON.stringify({ streaming: true })), true);
  assert.equal(isActiveTimelinePayload(JSON.stringify({ streaming: false })), false);
  assert.equal(isActiveTimelinePayload('{not-json'), false);
});
