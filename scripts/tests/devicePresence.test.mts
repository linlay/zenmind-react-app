import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeAccountDevicePresence, parseDesktopPresence } from '../../src/core/api/contracts/devicePresence.ts';
import type { AccountDeviceListV1 } from '../../src/core/api/contracts/deviceLink.ts';

const devices: AccountDeviceListV1 = {
  schemaVersion: 1,
  items: [
    {
      deviceId: '11111111-1111-4111-8111-111111111111',
      deviceKind: 'mobile',
      deviceName: 'Phone',
      trustLevel: 'trusted',
      lastSeenAt: '2030-01-01T00:00:00Z'
    },
    {
      deviceId: '22222222-2222-4222-8222-222222222222',
      deviceKind: 'desktop',
      deviceName: 'Desktop',
      trustLevel: 'fully_trusted',
      lastSeenAt: '2030-01-01T00:00:00Z'
    },
    {
      deviceId: '33333333-3333-4333-8333-333333333333',
      deviceKind: 'desktop',
      deviceName: 'Offline',
      trustLevel: 'trusted',
      lastSeenAt: '2030-01-01T00:00:00Z'
    }
  ]
};

test('presence merge preserves Identity order and keeps offline desktops', () => {
  const presence = parseDesktopPresence({
    schemaVersion: 1,
    items: [{ deviceId: devices.items[1].deviceId, online: true, connectedAt: '2030-01-01T00:00:01Z' }]
  });
  const merged = mergeAccountDevicePresence(devices, presence);
  assert.deepEqual(
    merged.items.map((device) => device.deviceId),
    devices.items.map((device) => device.deviceId)
  );
  assert.equal(merged.items[0].online, undefined);
  assert.equal(merged.items[1].online, true);
  assert.equal(merged.items[2].online, false);
});
