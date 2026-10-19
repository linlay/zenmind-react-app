import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyAccountDesktopCacheScopeSnapshot, normalizeAccountDesktopCacheScopeSnapshot, resolveAccountDesktopCacheScope } from '../../src/core/auth/accountDesktopCacheScopeModel.ts';

test('account cloud and each account/Desktop receive different fresh scopes, with no legacy matching', () => {
  let snapshot = createEmptyAccountDesktopCacheScopeSnapshot();
  let count = 0;
  for (const [accountId, desktopId] of [['alice', ''], ['alice', 'desktop-a'], ['alice', 'desktop-b'], ['bob', 'desktop-a']]) {
    const next = resolveAccountDesktopCacheScope({ snapshot, accountId, desktopId, createScopeId: () => `as_${++count}` });
    snapshot = next.snapshot;
    assert.equal(next.created, true);
    const again = resolveAccountDesktopCacheScope({ snapshot, accountId, desktopId, createScopeId: () => { throw new Error('must reuse'); } });
    assert.equal(again.entry.cacheScopeId, next.entry.cacheScopeId);
    assert.equal(again.created, false);
  }
  assert.equal(new Set(Object.values(snapshot.mappings).map((entry) => entry.cacheScopeId)).size, 4);
});

test('old mappings and invalid or duplicate scope ownership cannot enter the new registry', () => {
  assert.deepEqual(normalizeAccountDesktopCacheScopeSnapshot({ version: 1, mappings: { a: { accountId: 'alice', desktopId: 'a', cacheScopeId: 'cs_old' } } }), { version: 2, mappings: {} });
  const result = normalizeAccountDesktopCacheScopeSnapshot({ version: 2, mappings: {
    a: { accountId: 'alice', desktopId: 'a', cacheScopeId: 'as_new' },
    b: { accountId: 'bob', desktopId: 'a', cacheScopeId: 'as_new' },
    c: { accountId: 'bob', desktopId: 'b', cacheScopeId: '../bad' }
  } });
  assert.equal(Object.keys(result.mappings).length, 1);
});
