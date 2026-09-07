import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyDeviceNameToSession,
  MAX_DEVICE_NAME_LENGTH,
  resolveMigratedDeviceNameOverride,
  resolvePreferredDeviceName,
  validateDeviceNameOverride
} from '../../src/core/auth/deviceNameModel.ts';

test('preferred device name falls back to the current effective device id', () => {
  assert.equal(resolvePreferredDeviceName('', 'device-local-1'), 'device-local-1');
  assert.equal(resolvePreferredDeviceName('  My Phone  ', 'device-local-1'), 'My Phone');
});

test('legacy generated platform names are not migrated as user overrides', () => {
  assert.equal(resolveMigratedDeviceNameOverride('iPhone'), '');
  assert.equal(resolveMigratedDeviceNameOverride('Android'), '');
  assert.equal(resolveMigratedDeviceNameOverride('RN Device'), '');
  assert.equal(resolveMigratedDeviceNameOverride('  Alice Phone  '), 'Alice Phone');
});

test('device name overrides are trimmed and limited to 64 characters', () => {
  assert.equal(validateDeviceNameOverride('  Work Phone  '), 'Work Phone');
  assert.equal(validateDeviceNameOverride('x'.repeat(MAX_DEVICE_NAME_LENGTH)), 'x'.repeat(MAX_DEVICE_NAME_LENGTH));
  assert.throws(() => validateDeviceNameOverride('   '), /required/u);
  assert.throws(() => validateDeviceNameOverride('x'.repeat(MAX_DEVICE_NAME_LENGTH + 1)), /at most/u);
});

test('updating a session preserves its other fields and avoids unnecessary copies', () => {
  const session = { deviceName: 'device-1', deviceId: 'device-1', username: 'alice' };
  const updated = applyDeviceNameToSession(session, 'Alice Phone');

  assert.deepEqual(updated, {
    deviceName: 'Alice Phone',
    deviceId: 'device-1',
    username: 'alice'
  });
  assert.equal(applyDeviceNameToSession(updated, 'Alice Phone'), updated);
  assert.equal(applyDeviceNameToSession(null, 'Alice Phone'), null);
});
