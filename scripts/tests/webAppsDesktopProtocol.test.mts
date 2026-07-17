import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyWebAppChanged,
  parseWebAppCatalog,
  parseWebAppChanged,
  parseWebAppChangedFrame,
  parseWebAppItem
} from '../../src/features/webApps/webAppsDesktopProtocol.ts';

function rawItem(id: string, patch: Record<string, unknown> = {}) {
  return {
    id,
    label: `App ${id}`,
    order: 0,
    createdAt: 1,
    updatedAt: 2,
    runtimeStatus: 'running',
    publishStatus: 'published',
    available: true,
    publicUrl: `https://apps.example.test/${id}`,
    availability: 'available',
    ...patch
  };
}

function rawCatalog(items: unknown[]) {
  return {
    desktopDeviceId: 'desktop-1',
    tunnelConnected: true,
    generatedAt: '2026-07-17T08:30:00.000Z',
    items
  };
}

test('Desktop protocol parser accepts all documented runtime, publish, and availability values', () => {
  const runtimeStatuses = ['stopped', 'starting', 'running', 'error'] as const;
  const publishStatuses = ['not-configured', 'ready', 'publishing', 'published', 'unpublished', 'error'] as const;
  const availabilities = [
    'available',
    'not-published',
    'publishing',
    'desktop-offline',
    'webapp-stopped',
    'publish-error'
  ] as const;

  runtimeStatuses.forEach((runtimeStatus) => {
    assert.equal(parseWebAppItem(rawItem(runtimeStatus, { runtimeStatus })).runtimeStatus, runtimeStatus);
  });
  publishStatuses.forEach((publishStatus) => {
    assert.equal(parseWebAppItem(rawItem(publishStatus, { publishStatus })).publishStatus, publishStatus);
  });
  availabilities.forEach((availability) => {
    const item = parseWebAppItem(rawItem(availability, { availability, available: availability === 'available' }));
    assert.equal(item.availability, availability);
  });
});

test('catalog parsing rejects invalid structures and duplicate ids', () => {
  assert.throws(() => parseWebAppCatalog({}), /Invalid WebApps catalog/);
  assert.throws(
    () => parseWebAppCatalog(rawCatalog([rawItem('duplicate'), rawItem('duplicate')])),
    /Duplicate WebApp id/
  );
  assert.throws(
    () => parseWebAppItem(rawItem('mismatch', { availability: 'available', available: false })),
    /available flag/
  );
});

test('non-HTTPS public URLs stay in the catalog but can never become launch URLs', () => {
  const item = parseWebAppItem(rawItem('unsafe', { publicUrl: 'http://127.0.0.1:3000' }));
  assert.equal(item.id, 'unsafe');
  assert.equal(item.publicUrl, undefined);
});

test('catalog sorting is stable for equal order values', () => {
  const catalog = parseWebAppCatalog(
    rawCatalog([
      rawItem('third', { order: 2 }),
      rawItem('first', { order: 0 }),
      rawItem('second-a', { order: 1 }),
      rawItem('second-b', { order: 1 })
    ])
  );
  assert.deepEqual(
    catalog.items.map((item) => item.id),
    ['first', 'second-a', 'second-b', 'third']
  );
});

test('webapp.changed validates ids and applies ordered upserts and removals', () => {
  const installed = parseWebAppChanged({
    reason: 'installed',
    webappId: 'b',
    changedAt: '2026-07-17T08:31:00.000Z',
    item: rawItem('b', { order: 0 })
  });
  const initial = parseWebAppCatalog(rawCatalog([rawItem('a', { order: 1 })]));
  const withInstalled = applyWebAppChanged(initial, installed);
  assert.deepEqual(
    withInstalled.items.map((item) => item.id),
    ['b', 'a']
  );

  const removed = parseWebAppChangedFrame({
    ns: 'd',
    frame: 'push',
    type: 'webapp.changed',
    data: {
      reason: 'removed',
      webappId: 'b',
      changedAt: '2026-07-17T08:32:00.000Z',
      item: null
    }
  });
  assert.ok(removed);
  assert.deepEqual(
    applyWebAppChanged(withInstalled, removed).items.map((item) => item.id),
    ['a']
  );

  assert.throws(
    () =>
      parseWebAppChanged({
        reason: 'updated',
        webappId: 'a',
        changedAt: '2026-07-17T08:33:00.000Z',
        item: rawItem('b')
      }),
    /Mismatched/
  );
});

test('unrelated push frames are ignored', () => {
  assert.equal(parseWebAppChangedFrame({ ns: 'ap', frame: 'push', type: 'webapp.changed', data: {} }), null);
  assert.equal(parseWebAppChangedFrame({ ns: 'd', frame: 'push', type: 'chat.updated', data: {} }), null);
});
