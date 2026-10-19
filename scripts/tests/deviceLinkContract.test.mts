import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAccountDeviceListV1, parseDesktopPlatformCredential } from '../../src/core/api/contracts/deviceLink.ts';
test('Hub directory requires explicit presence and preserves persisted Desktop IDs', () => {
  const list = { schemaVersion: 1, items: [{ deviceId: 'existing-desktop', deviceName: '电脑', online: false }] };
  assert.deepEqual(parseAccountDeviceListV1(list), list);
  assert.throws(() => parseAccountDeviceListV1({ ...list, schemaVersion: 2 }));
  assert.throws(() =>
    parseAccountDeviceListV1({ schemaVersion: 1, items: [{ deviceId: 'existing-desktop', deviceName: '电脑' }] })
  );
  assert.throws(() =>
    parseAccountDeviceListV1({
      schemaVersion: 1,
      items: [{ deviceId: 'invalid/target', deviceName: '电脑', online: true }]
    })
  );
});
test('Platform credential validates expiry, local device and safe bearer transport', () => {
  const now = Date.parse('2030-01-01T00:00:00Z');
  const credential = {
    schemaVersion: 1,
    credential: 'header.payload.signature',
    platformDeviceId: 'local-device',
    webSocketUrl: 'wss://desktop.test/ws',
    tokenMode: 'subprotocol',
    expiresAt: '2030-01-01T00:30:00Z'
  };
  assert.deepEqual(parseDesktopPlatformCredential(credential, now), credential);
  for (const wrong of [
    { credential: 'tr_old' },
    { platformDeviceId: '' },
    { tokenMode: 'query' },
    { expiresAt: '2029-01-01T00:00:00Z' },
    { webSocketUrl: 'wss://desktop.test/ws?token=secret' },
    { webSocketUrl: 'wss://user:secret@desktop.test/ws' }
  ])
    assert.throws(() => parseDesktopPlatformCredential({ ...credential, ...wrong }, now));
});
