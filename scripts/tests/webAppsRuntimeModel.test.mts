import assert from 'node:assert/strict';
import test from 'node:test';

import type { WebAppCatalog, WebAppItem } from '../../src/features/webApps/types.ts';
import {
  getOpenableWebApps,
  INITIAL_WEB_APPS_RUNTIME_STATE,
  MAX_RESIDENT_WEB_APPS,
  webAppsRuntimeReducer,
  type WebAppsRuntimeState
} from '../../src/features/webApps/webAppsRuntimeModel.ts';

function webApp(id: string, patch: Partial<WebAppItem> = {}): WebAppItem {
  return {
    id,
    name: `App ${id}`,
    order: Number(id) || 0,
    createdAt: 1,
    updatedAt: 2,
    runtimeStatus: 'running',
    publishStatus: 'published',
    availability: 'available',
    publicUrl: `https://apps.example.test/${id}`,
    ...patch
  };
}

function catalog(items: readonly WebAppItem[]): WebAppCatalog {
  return {
    desktopDeviceId: 'desktop-1',
    tunnelConnected: true,
    generatedAt: '2026-07-17T08:30:00.000Z',
    items
  };
}

function loadItems(items: readonly WebAppItem[]): WebAppsRuntimeState {
  const connected = webAppsRuntimeReducer(INITIAL_WEB_APPS_RUNTIME_STATE, {
    type: 'connection.changed',
    status: 'connected'
  });
  return webAppsRuntimeReducer(connected, { type: 'snapshot.received', catalog: catalog(items) });
}

test('only running, available WebApps with HTTPS public URLs are openable', () => {
  const items = [
    webApp('safe'),
    webApp('http', { publicUrl: 'http://apps.example.test/http' }),
    webApp('offline', { availability: 'desktop-offline' }),
    webApp('stopped', { runtimeStatus: 'stopped', availability: 'webapp-stopped' })
  ];

  assert.deepEqual(
    getOpenableWebApps(items).map((item) => item.id),
    ['safe']
  );
});

test('resident WebView pool keeps the active app and evicts the least recently used entry', () => {
  const items = Array.from({ length: MAX_RESIDENT_WEB_APPS + 1 }, (_, index) => webApp(String(index)));
  let state = loadItems(items);
  state = webAppsRuntimeReducer(state, { type: 'detail.entered', preferredAppId: '0' });

  for (let index = 1; index < items.length; index += 1) {
    state = webAppsRuntimeReducer(state, { type: 'app.selected', appId: String(index) });
  }

  assert.equal(state.residents.length, MAX_RESIDENT_WEB_APPS);
  assert.equal(state.activeAppId, String(MAX_RESIDENT_WEB_APPS));
  assert.deepEqual(
    state.residents.map((resident) => resident.appId),
    ['6', '5', '4', '3', '2', '1']
  );
});

test('last safe navigation URL survives LRU eviction and is restored on selection', () => {
  const items = Array.from({ length: MAX_RESIDENT_WEB_APPS + 1 }, (_, index) => webApp(String(index)));
  let state = loadItems(items);
  state = webAppsRuntimeReducer(state, { type: 'detail.entered', preferredAppId: '0' });
  state = webAppsRuntimeReducer(state, {
    type: 'resident.urlChanged',
    appId: '0',
    url: 'https://apps.example.test/0/deep-link'
  });

  for (let index = 1; index < items.length; index += 1) {
    state = webAppsRuntimeReducer(state, { type: 'app.selected', appId: String(index) });
  }
  assert.equal(
    state.residents.some((resident) => resident.appId === '0'),
    false
  );

  state = webAppsRuntimeReducer(state, { type: 'app.selected', appId: '0' });
  assert.equal(state.residents[0]?.url, 'https://apps.example.test/0/deep-link');
});

test('stopping the active WebApp unloads it and selects the recent available fallback', () => {
  let state = loadItems([webApp('a', { order: 0 }), webApp('b', { order: 1 })]);
  state = webAppsRuntimeReducer(state, { type: 'detail.entered', preferredAppId: 'a' });
  state = webAppsRuntimeReducer(state, { type: 'app.selected', appId: 'b' });
  state = webAppsRuntimeReducer(state, {
    type: 'item.received',
    item: webApp('b', {
      order: 1,
      runtimeStatus: 'stopped',
      availability: 'webapp-stopped'
    })
  });

  assert.equal(state.activeAppId, 'a');
  assert.deepEqual(
    state.residents.map((resident) => resident.appId),
    ['a']
  );
  assert.equal(state.lastUrlById.b, undefined);
});

test('transient Desktop offline and publish errors retain an existing resident', () => {
  let state = loadItems([webApp('a')]);
  state = webAppsRuntimeReducer(state, { type: 'detail.entered', preferredAppId: 'a' });
  const generation = state.residents[0]?.generation;

  state = webAppsRuntimeReducer(state, {
    type: 'item.received',
    item: webApp('a', { availability: 'desktop-offline' })
  });
  assert.equal(state.activeAppId, 'a');
  assert.equal(state.residents[0]?.generation, generation);

  state = webAppsRuntimeReducer(state, {
    type: 'item.received',
    item: webApp('a', { publishStatus: 'error', availability: 'publish-error', publicUrl: undefined })
  });
  assert.equal(state.activeAppId, 'a');
  assert.equal(state.residents[0]?.generation, generation);

  state = webAppsRuntimeReducer(state, { type: 'item.received', item: webApp('a') });
  assert.equal(state.residents[0]?.generation, generation);
});

test('unpublished and removed WebApps unload their residents', () => {
  let state = loadItems([webApp('a')]);
  state = webAppsRuntimeReducer(state, { type: 'detail.entered', preferredAppId: 'a' });
  state = webAppsRuntimeReducer(state, {
    type: 'item.received',
    item: webApp('a', {
      publishStatus: 'unpublished',
      availability: 'not-published',
      publicUrl: undefined
    })
  });
  assert.equal(state.activeAppId, null);
  assert.equal(state.residents.length, 0);

  state = loadItems([webApp('a')]);
  state = webAppsRuntimeReducer(state, { type: 'detail.entered', preferredAppId: 'a' });
  state = webAppsRuntimeReducer(state, { type: 'item.removed', appId: 'a' });
  assert.equal(state.activeAppId, null);
  assert.equal(state.residents.length, 0);
});

test('a changed public URL resets the resident exactly once', () => {
  let state = loadItems([webApp('a')]);
  state = webAppsRuntimeReducer(state, { type: 'detail.entered', preferredAppId: 'a' });
  state = webAppsRuntimeReducer(state, {
    type: 'resident.urlChanged',
    appId: 'a',
    url: 'https://apps.example.test/a/deep-link'
  });
  const generation = state.residents[0]?.generation ?? -1;

  const changed = webApp('a', { publicUrl: 'https://new-apps.example.test/a' });
  state = webAppsRuntimeReducer(state, { type: 'item.received', item: changed });
  assert.equal(state.residents[0]?.launchUrl, 'https://new-apps.example.test/a');
  assert.equal(state.residents[0]?.url, 'https://new-apps.example.test/a');
  assert.equal(state.residents[0]?.generation, generation + 1);

  state = webAppsRuntimeReducer(state, { type: 'item.received', item: changed });
  assert.equal(state.residents[0]?.generation, generation + 1);
});

test('disconnecting retains loaded residents but blocks selecting a new WebApp', () => {
  let state = loadItems([webApp('a', { order: 0 }), webApp('b', { order: 1 })]);
  state = webAppsRuntimeReducer(state, { type: 'detail.entered', preferredAppId: 'a' });
  state = webAppsRuntimeReducer(state, { type: 'connection.changed', status: 'disconnected' });
  state = webAppsRuntimeReducer(state, { type: 'app.selected', appId: 'b' });

  assert.equal(state.activeAppId, 'a');
  assert.deepEqual(
    state.residents.map((resident) => resident.appId),
    ['a']
  );
});
