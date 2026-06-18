import assert from 'node:assert/strict';
import test from 'node:test';

import {
  pickChatWonderSuggestions,
  resolveChatWonderGridConfig,
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

test('chat wonder grid uses four cards on narrow screens and three on wide screens', () => {
  assert.deepEqual(resolveChatWonderGridConfig(0), { columnCount: 2, visibleCount: 4 });
  assert.deepEqual(resolveChatWonderGridConfig(360), { columnCount: 2, visibleCount: 4 });
  assert.deepEqual(resolveChatWonderGridConfig(420), { columnCount: 3, visibleCount: 3 });
});

test('chat wonder picker keeps first render stable and refreshes deterministically', () => {
  const wonders = Array.from({ length: 6 }, (_, index) => createWonder(index + 1));

  assert.deepEqual(
    pickChatWonderSuggestions(wonders, 4, 0).map((wonder) => wonder.id),
    ['wonder-1', 'wonder-2', 'wonder-3', 'wonder-4']
  );

  const refreshed = pickChatWonderSuggestions(wonders, 4, 1).map((wonder) => wonder.id);
  assert.equal(refreshed.length, 4);
  assert.deepEqual(refreshed, pickChatWonderSuggestions(wonders, 4, 1).map((wonder) => wonder.id));
  assert.notDeepEqual(refreshed, ['wonder-1', 'wonder-2', 'wonder-3', 'wonder-4']);
});

test('chat wonder picker returns all items when there are too few to refresh', () => {
  const wonders = [createWonder(1), createWonder(2)];

  assert.deepEqual(pickChatWonderSuggestions(wonders, 4, 9), wonders);
  assert.deepEqual(pickChatWonderSuggestions(wonders, 0, 9), []);
});
