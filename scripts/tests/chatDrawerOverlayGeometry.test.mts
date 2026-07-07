import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHAT_DIRECTORY_PICKER_DRAWER_GEOMETRY,
  CHAT_HISTORY_DRAWER_GEOMETRY,
  getChatDrawerHiddenOffset,
  getChatDrawerPanelWidth,
} from '../../src/features/chatPersistence/chatDrawerOverlayGeometry.ts';

test('drawer overlay geometry keeps panel width stable across drawer types', () => {
  assert.equal(getChatDrawerPanelWidth(360, CHAT_DIRECTORY_PICKER_DRAWER_GEOMETRY), 310);
  assert.equal(getChatDrawerPanelWidth(1080, CHAT_DIRECTORY_PICKER_DRAWER_GEOMETRY), 390);

  assert.equal(getChatDrawerPanelWidth(360, CHAT_HISTORY_DRAWER_GEOMETRY), 303);
  assert.equal(getChatDrawerPanelWidth(1080, CHAT_HISTORY_DRAWER_GEOMETRY), 360);
});

test('drawer overlay hidden offsets move each panel fully outside the screen', () => {
  assert.equal(getChatDrawerHiddenOffset(360, 'left', CHAT_DIRECTORY_PICKER_DRAWER_GEOMETRY), -310);
  assert.equal(getChatDrawerHiddenOffset(360, 'right', CHAT_HISTORY_DRAWER_GEOMETRY), 303);
});
