import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAccountDeviceListV1, parseTrustedRouteContext } from '../../src/core/api/contracts/deviceLink.ts';
const id = '11111111-1111-4111-8111-111111111111';
const route = {
  schemaVersion: 1,
  accountId: 'account',
  sourceDeviceId: id,
  targetDesktopId: 'existing-desktop',
  requestId: id,
  jti: id,
  issuedAt: '2030-01-01T00:00:00Z',
  expiresAt: '2030-01-01T00:02:00Z'
};
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
test('route context validates session, target, request and maximum lifetime without JWT fields', () => {
  assert.deepEqual(parseTrustedRouteContext(route), route);
  assert.throws(() => parseTrustedRouteContext({ ...route, sourceDeviceId: 'phone' }));
  assert.throws(() => parseTrustedRouteContext({ ...route, jti: '' }));
  assert.throws(() => parseTrustedRouteContext({ ...route, targetDesktopId: '../target' }));
  assert.throws(() => parseTrustedRouteContext({ ...route, expiresAt: '2030-01-01T00:02:01Z' }));
  assert.throws(() => parseTrustedRouteContext({ ...route, expiresAt: route.issuedAt }));
});
