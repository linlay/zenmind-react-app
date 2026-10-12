import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAccountSession } from '../../src/core/auth/accountAuthModel.ts';
const now = Date.parse('2030-01-01T00:00:00Z');
const session = {
  schemaVersion: 1,
  accountId: 'account',
  username: 'alice',
  deviceId: '11111111-1111-4111-8111-111111111111',
  deviceName: 'Phone',
  accessToken: 'access',
  accessTokenExpireAt: '2030-01-01T01:00:00Z',
  deviceToken: 'credential'
};
test('account session requires persistent credentials without device trust tiers', () => {
  const parsed = parseAccountSession(session, now);
  assert.equal(parsed.deviceToken, 'credential');
  assert.equal(parsed.accountId, 'account');
  assert.equal('trustLevel' in parsed, false);
  assert.equal('deviceKind' in parsed, false);
  assert.throws(() => parseAccountSession({ ...session, deviceToken: undefined }, now));
});
test('account session rejects invalid identity, missing account and expired access', () => {
  assert.throws(() => parseAccountSession({ ...session, accountId: '' }, now));
  assert.throws(() => parseAccountSession({ ...session, deviceId: 'mobile-1' }, now));
  assert.throws(() => parseAccountSession({ ...session, accessTokenExpireAt: '2029-12-31T23:59:59Z' }, now));
  assert.throws(() => parseAccountSession({ ...session, deviceName: '字'.repeat(65) }, now));
});
