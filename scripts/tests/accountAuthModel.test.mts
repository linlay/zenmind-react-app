import assert from 'node:assert/strict';
import test from 'node:test';

import { canPersistAccountSession, parseAccountSession } from '../../src/core/auth/accountAuthModel.ts';

const now = Date.parse('2030-01-01T00:00:00Z');
const base = {
  schemaVersion: 1,
  accountId: 'account-alice',
  username: 'alice',
  deviceId: '11111111-1111-4111-8111-111111111111',
  deviceKind: 'mobile',
  deviceName: 'Alice Phone',
  trustLevel: 'trusted',
  accessToken: 'access-token',
  accessTokenExpireAt: '2030-01-01T01:00:00Z',
  deviceToken: 'device-token'
};

test('persistent account sessions require and retain device credentials', () => {
  const session = parseAccountSession(base, now);
  assert.equal(canPersistAccountSession(session), true);
  assert.equal(session.deviceToken, 'device-token');
  assert.throws(() => parseAccountSession({ ...base, deviceToken: undefined }, now));
});

test('session trust never accepts a persistent device credential', () => {
  assert.throws(() => parseAccountSession({ ...base, trustLevel: 'session' }, now));
  const session = parseAccountSession({ ...base, trustLevel: 'session', deviceToken: undefined }, now);
  assert.equal(canPersistAccountSession(session), false);
});

test('account session parsing fails closed on enum, id and expiry changes', () => {
  assert.throws(() => parseAccountSession({ ...base, deviceKind: 'tablet' }, now));
  assert.throws(() => parseAccountSession({ ...base, deviceId: 'mobile-1' }, now));
  assert.throws(() => parseAccountSession({ ...base, accessTokenExpireAt: '2029-12-31T23:59:59Z' }, now));
});
