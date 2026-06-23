import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeDesktopWsStorageUrl, normalizeDesktopWsTokenMode } from '../../src/core/auth/desktopWsTransport.ts';

test('desktop ws storage url keeps ws targets but strips sensitive token data', () => {
  assert.equal(
    normalizeDesktopWsStorageUrl('ws://127.0.0.1:7082/ws?token=secret&source=mobile#debug'),
    'ws://127.0.0.1:7082/ws'
  );
  assert.equal(normalizeDesktopWsStorageUrl('wss://example.test/custom?foo=1&token=secret'), 'wss://example.test/ws');
});

test('desktop ws storage url rejects non websocket protocols', () => {
  assert.equal(normalizeDesktopWsStorageUrl('http://127.0.0.1:7082/ws'), '');
  assert.equal(normalizeDesktopWsStorageUrl('not a url'), '');
});

test('desktop ws token mode defaults to query', () => {
  assert.equal(normalizeDesktopWsTokenMode('subprotocol'), 'subprotocol');
  assert.equal(normalizeDesktopWsTokenMode('query'), 'query');
  assert.equal(normalizeDesktopWsTokenMode(''), 'query');
});
