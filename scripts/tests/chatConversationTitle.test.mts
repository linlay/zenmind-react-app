import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHAT_CONVERSATION_FALLBACK_TITLE,
  resolveChatConversationDisplayTitle,
  resolveChatConversationStoredTitle,
  resolveChatConversationTitleCandidate,
} from '../../src/features/chatPersistence/chatConversationTitle.ts';

test('conversation title candidates reject empty and remote placeholder values', () => {
  assert.equal(resolveChatConversationTitleCandidate('', '  ', null), undefined);
  assert.equal(resolveChatConversationTitleCandidate('default'), undefined);
  assert.equal(resolveChatConversationTitleCandidate(' DeFaUlT '), undefined);
});

test('conversation title candidates use the first normalized usable value', () => {
  assert.equal(
    resolveChatConversationTitleCandidate('default', '  图片里的文字  ', 'later'),
    '图片里的文字'
  );
});

test('stored conversation titles prefer incoming, then current, then fallback', () => {
  assert.equal(resolveChatConversationStoredTitle('新的有效标题', '已有标题'), '新的有效标题');
  assert.equal(resolveChatConversationStoredTitle('default', '已有标题'), '已有标题');
  assert.equal(
    resolveChatConversationStoredTitle(undefined, undefined),
    CHAT_CONVERSATION_FALLBACK_TITLE
  );
});

test('conversation title display keeps the fallback at the UI boundary', () => {
  assert.equal(resolveChatConversationDisplayTitle('default'), CHAT_CONVERSATION_FALLBACK_TITLE);
  assert.equal(resolveChatConversationDisplayTitle('  有效标题  '), '有效标题');
});
