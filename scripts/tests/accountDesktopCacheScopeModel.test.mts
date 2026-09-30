import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  createEmptyAccountDesktopCacheScopeSnapshot,
  listUnassignedLegacyCacheScopes,
  resolveAccountDesktopCacheScope
} from '../../src/core/auth/accountDesktopCacheScopeModel.ts';

const DESKTOP_ID = '22222222-2222-4222-8222-222222222222';

function legacyProfile(input: { desktopDeviceId: string; serverDeviceId: string; cacheScopeId: string }) {
  return input;
}

test('exact canonical device match reuses an existing non-default scope without copying data', () => {
  const snapshot = createEmptyAccountDesktopCacheScopeSnapshot();
  const resolution = resolveAccountDesktopCacheScope({
    snapshot,
    accountId: 'account-alice',
    desktopId: DESKTOP_ID,
    legacyProfiles: [
      legacyProfile({ desktopDeviceId: 'paired:old', serverDeviceId: DESKTOP_ID, cacheScopeId: 'cs_existing' })
    ],
    nowMs: 1000,
    createScopeId: () => 'cs_unused'
  });
  assert.equal(resolution.result, 'resolved');
  if (resolution.result !== 'resolved') return;
  assert.equal(resolution.entry.cacheScopeId, 'cs_existing');
  assert.equal(resolution.entry.source, 'legacy-profile');
  assert.equal(resolution.entry.legacyProfileId, 'paired:old');
  assert.equal(Object.keys(snapshot.mappings).length, 0);
  assert.equal(Object.keys(resolution.snapshot.mappings).length, 1);
});

test('default legacy source is never auto-owned by an account desktop', () => {
  const resolution = resolveAccountDesktopCacheScope({
    snapshot: createEmptyAccountDesktopCacheScopeSnapshot(),
    accountId: 'account-alice',
    desktopId: DESKTOP_ID,
    legacyProfiles: [
      legacyProfile({ desktopDeviceId: 'manual:old', serverDeviceId: DESKTOP_ID, cacheScopeId: 'legacy' })
    ],
    nowMs: 1000,
    createScopeId: () => 'cs_new_desktop'
  });
  assert.equal(resolution.result, 'resolved');
  if (resolution.result !== 'resolved') return;
  assert.equal(resolution.entry.cacheScopeId, 'cs_new_desktop');
  assert.equal(resolution.entry.source, 'new');
});

test('conflicting exact legacy scopes fail closed instead of merging data', () => {
  const snapshot = createEmptyAccountDesktopCacheScopeSnapshot();
  const resolution = resolveAccountDesktopCacheScope({
    snapshot,
    accountId: 'account-alice',
    desktopId: DESKTOP_ID,
    legacyProfiles: [
      legacyProfile({ desktopDeviceId: 'paired:a', serverDeviceId: DESKTOP_ID, cacheScopeId: 'cs_a' }),
      legacyProfile({ desktopDeviceId: 'paired:b', serverDeviceId: DESKTOP_ID, cacheScopeId: 'cs_b' })
    ]
  });
  assert.deepEqual(resolution, {
    result: 'conflict',
    conflictingScopeIds: ['cs_a', 'cs_b'],
    snapshot
  });
});

test('all unowned scopes remain visible for explicit cleanup', () => {
  const profiles = [
    legacyProfile({ desktopDeviceId: 'paired:a', serverDeviceId: DESKTOP_ID, cacheScopeId: 'legacy' }),
    legacyProfile({ desktopDeviceId: 'paired:b', serverDeviceId: DESKTOP_ID, cacheScopeId: 'cs_b' }),
    legacyProfile({ desktopDeviceId: 'paired:c', serverDeviceId: DESKTOP_ID, cacheScopeId: 'cs_b' })
  ];
  assert.deepEqual(listUnassignedLegacyCacheScopes(createEmptyAccountDesktopCacheScopeSnapshot(), profiles), [
    { legacyProfileId: 'paired:a', cacheScopeId: 'legacy' },
    { legacyProfileId: 'paired:b', cacheScopeId: 'cs_b' }
  ]);
});

test('device profiles no longer evict or delete caches automatically', () => {
  const profilesSource = readFileSync('src/core/auth/deviceProfiles.ts', 'utf8');
  const authSource = readFileSync('src/core/auth/appAuth.ts', 'utf8');
  assert.doesNotMatch(profilesSource, /MAX_RETAINED_DEVICE_CACHE_PROFILES|evictedCacheScopeIds/u);
  assert.doesNotMatch(authSource, /cleanupEvictedDeviceCaches|deleteScope/u);
});
