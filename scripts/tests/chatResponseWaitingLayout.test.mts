import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHAT_RESPONSE_WAITING_DOCK_OFFSET_RATIO,
  CHAT_RESPONSE_WAITING_INDICATOR_HEIGHT,
  getChatResponseWaitingBaseContentHeight,
  getChatResponseWaitingDockBottomOffset,
  resolveChatResponseWaitingPlacement
} from '../../src/features/chatPersistence/components/chatResponseWaitingLayout.ts';

test('docks the waiting indicator when content fits above its default bottom position', () => {
  const availableHeight = 720;
  const contentLimit =
    availableHeight - CHAT_RESPONSE_WAITING_INDICATOR_HEIGHT - getChatResponseWaitingDockBottomOffset(availableHeight);

  assert.equal(resolveChatResponseWaitingPlacement({ availableHeight, contentHeight: contentLimit - 120 }), 'docked');
  assert.equal(resolveChatResponseWaitingPlacement({ availableHeight, contentHeight: contentLimit }), 'docked');
});

test('places the waiting indicator at the timeline end when content exceeds the docked area', () => {
  const availableHeight = 720;
  const contentLimit =
    availableHeight - CHAT_RESPONSE_WAITING_INDICATOR_HEIGHT - getChatResponseWaitingDockBottomOffset(availableHeight);

  assert.equal(
    resolveChatResponseWaitingPlacement({ availableHeight, contentHeight: contentLimit + 2 }),
    'timeline-footer'
  );
});

test('uses the docked position until layout measurements are available', () => {
  assert.equal(resolveChatResponseWaitingPlacement({ availableHeight: 0, contentHeight: 900 }), 'docked');
});

test('moves the docked waiting indicator up by five percent of the available height', () => {
  assert.equal(CHAT_RESPONSE_WAITING_DOCK_OFFSET_RATIO, 0.05);
  assert.equal(getChatResponseWaitingDockBottomOffset(720), 36);
});

test('removes the timeline footer indicator height from measured content', () => {
  assert.equal(getChatResponseWaitingBaseContentHeight(548, true), 500);
  assert.equal(getChatResponseWaitingBaseContentHeight(500, false), 500);
});
