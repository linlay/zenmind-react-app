import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const chatSyncServiceSource = readFileSync(
  new URL('../../src/features/chatRealtime/chatSyncService.ts', import.meta.url),
  'utf8'
);
const chatDetailControllerSource = readFileSync(
  new URL('../../src/features/chatPersistence/useChatDetailConversationController.ts', import.meta.url),
  'utf8'
);

function extractSourceSection(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `Missing source marker: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `Missing source marker: ${endNeedle}`);
  return source.slice(start, end);
}

test('detail reconcile treats disconnected websocket as recoverable background work', () => {
  const recoverableSource = extractSourceSection(
    chatSyncServiceSource,
    'function isRecoverableReconcileError',
    'function isInactiveInterruptResponse'
  );
  const detailOpenSource = extractSourceSection(
    chatDetailControllerSource,
    'if (!skipInitialReconcile)',
    'const unsubscribe = chatSyncService.subscribe'
  );

  assert.match(chatSyncServiceSource, /import \{ WsClientDisconnectedError \} from '\.\/wsClient'/);
  assert.match(recoverableSource, /error instanceof WsClientDisconnectedError/);
  assert.match(detailOpenSource, /\.reconcileConversation\(/);
  assert.match(detailOpenSource, /\.catch\(\(error\) =>/);
  assert.doesNotMatch(detailOpenSource, /void chatSyncService\.reconcileConversation\([^;]+;/);
});
