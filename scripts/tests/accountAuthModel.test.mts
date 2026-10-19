import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAccountSession, parseOfficialUser } from '../../src/core/auth/accountAuthModel.ts';
const now = Date.parse('2030-01-01T00:00:00Z');
const user = { id: 42, email: 'user@example.test', displayName: 'User', avatarUrl: '', enabled: true };
const response = {
  ok: true,
  user,
  accessToken: 'official-token',
  tokenType: 'Bearer',
  expiresAt: '2030-01-01T01:00:00Z'
};
test('official session uses verified user and a new cache namespace without persistent device credentials', () => {
  const session = parseAccountSession(response, 'https://official.test', user, now);
  assert.equal(session.accountId, 'official:https://official.test:42');
  assert.equal('deviceToken' in session, false);
  assert.equal('deviceId' in session, false);
  assert.notEqual(session.accountId, '42');
  assert.equal(parseOfficialUser(user).displayName, 'User');
});
test('official session rejects disabled users, mismatched identities, expired or incompatible responses', () => {
  assert.throws(() => parseOfficialUser({ ...user, enabled: false }));
  assert.throws(() =>
    parseAccountSession({ ...response, user: { ...user, id: 7 } }, 'https://official.test', user, now)
  );
  assert.throws(() =>
    parseAccountSession({ ...response, expiresAt: '2029-12-31T00:00:00Z' }, 'https://official.test', user, now)
  );
  assert.throws(() => parseAccountSession({ ...response, tokenType: 'Device' }, 'https://official.test', user, now));
});
