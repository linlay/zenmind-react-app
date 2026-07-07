import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const CHAT_DETAIL_SCREEN_SOURCE = readFileSync('src/features/chatPersistence/ChatDetailScreen.tsx', 'utf8');

test('chat detail history drawer is mounted outside the safe-area keyboard content', () => {
  const drawerRenderIndex = CHAT_DETAIL_SCREEN_SOURCE.lastIndexOf('<ChatDetailHistoryDrawer');
  const keyboardContentEndIndex = CHAT_DETAIL_SCREEN_SOURCE.indexOf('</ChatDetailKeyboardAvoider>');
  const skeletonOverlayEndIndex = CHAT_DETAIL_SCREEN_SOURCE.indexOf('</Animated.View>', keyboardContentEndIndex);
  const copyToastIndex = CHAT_DETAIL_SCREEN_SOURCE.indexOf('<CopyToast', skeletonOverlayEndIndex);

  assert.ok(drawerRenderIndex > keyboardContentEndIndex);
  assert.ok(drawerRenderIndex > skeletonOverlayEndIndex);
  assert.ok(drawerRenderIndex < copyToastIndex);
});
