import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHAT_WONDER_VISIBLE_COUNT,
  pickChatWonderSuggestions,
} from '../../src/features/chatPersistence/components/chatWonderDisplay.ts';
import type { AgentWonderSuggestion } from '../../src/core/api/services/chatApi.ts';

function createWonder(index: number): AgentWonderSuggestion {
  return {
    id: `wonder-${index}`,
    title: `推荐问题 ${index}`,
    text: `问题内容 ${index}`,
    raw: `问题内容 ${index}`,
  };
}

test('chat wonder display uses a fixed three item window', () => {
  assert.equal(CHAT_WONDER_VISIBLE_COUNT, 3);
});

test('chat wonder picker keeps first render stable and refreshes deterministically', () => {
  const wonders = Array.from({ length: 6 }, (_, index) => createWonder(index + 1));

  assert.deepEqual(
    pickChatWonderSuggestions(wonders, 0).map((wonder) => wonder.id),
    ['wonder-1', 'wonder-2', 'wonder-3']
  );

  const refreshed = pickChatWonderSuggestions(wonders, 1).map((wonder) => wonder.id);
  assert.equal(refreshed.length, CHAT_WONDER_VISIBLE_COUNT);
  assert.deepEqual(
    refreshed,
    pickChatWonderSuggestions(wonders, 1).map((wonder) => wonder.id)
  );
  assert.notDeepEqual(refreshed, ['wonder-1', 'wonder-2', 'wonder-3']);
});

test('chat wonder picker returns all items when there are too few to refresh', () => {
  const wonders = [createWonder(1), createWonder(2)];

  assert.deepEqual(pickChatWonderSuggestions(wonders, 9), wonders);
  assert.deepEqual(pickChatWonderSuggestions([], 9), []);
});
