import assert from 'node:assert/strict';
import test from 'node:test';

import type { WsSocketStatus } from '../../src/core/ws/wsClient.ts';
import type { WsTransportConfig } from '../../src/core/ws/wsTransportConfig.ts';
import type { WebAppsGatewayEvent } from '../../src/features/webApps/types.ts';
import {
  createDesktopWebAppsGateway,
  type WebAppsGatewayDependencies
} from '../../src/features/webApps/webAppsGatewayCore.ts';

type RequestOptions = Parameters<WebAppsGatewayDependencies['request']>[0];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitFor(predicate: () => boolean, message = 'condition'): Promise<void> {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) {
      return;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.fail(`Timed out waiting for ${message}`);
}

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

function rawCatalog(items: unknown[], desktopDeviceId = 'desktop-1') {
  return {
    desktopDeviceId,
    tunnelConnected: true,
    generatedAt: '2026-07-17T08:30:00.000Z',
    items
  };
}

function createHarness(options: { profileKind?: 'http' | 'desktop-ws'; status?: WsSocketStatus } = {}) {
  const requests: RequestOptions[] = [];
  const pushListeners = new Set<(frame: unknown) => void>();
  const statusListeners = new Set<(status: WsSocketStatus) => void>();
  const transport: WsTransportConfig = {
    kind: 'desktop-ws',
    wsUrl: 'wss://desktop.example.test/ws',
    tokenMode: 'subprotocol',
    accessToken: 'token',
    namespace: 'd'
  };
  let status = options.status ?? 'connected';
  let requestHandler = async (request: RequestOptions): Promise<unknown> => {
    if (request.type === 'event.subscribe' || request.type === 'event.unsubscribe') {
      return { types: ['webapp.changed'] };
    }
    return rawCatalog([rawItem('a')]);
  };

  const dependencies: WebAppsGatewayDependencies = {
    getActiveProfile: () => ({
      transportKind: options.profileKind ?? 'desktop-ws',
      desktopDeviceId: 'desktop-1'
    }),
    resolveTransport: async () => transport,
    request: async <T,>(request: RequestOptions): Promise<T> => {
      requests.push(request);
      return (await requestHandler(request)) as T;
    },
    subscribePush: (listener) => {
      pushListeners.add(listener);
      return () => pushListeners.delete(listener);
    },
    subscribeStatus: (listener) => {
      statusListeners.add(listener);
      listener(status);
      return () => statusListeners.delete(listener);
    },
    getStatus: () => status
  };

  return {
    dependencies,
    requests,
    setRequestHandler(handler: typeof requestHandler) {
      requestHandler = handler;
    },
    emitPush(frame: unknown) {
      pushListeners.forEach((listener) => listener(frame));
    },
    emitStatus(nextStatus: WsSocketStatus) {
      status = nextStatus;
      statusListeners.forEach((listener) => listener(nextStatus));
    },
    listenerCounts() {
      return { push: pushListeners.size, status: statusListeners.size };
    }
  };
}

function changedPush(reason: string, webappId: string, item: unknown) {
  return {
    ns: 'd',
    frame: 'push',
    type: 'webapp.changed',
    data: {
      reason,
      webappId,
      changedAt: '2026-07-17T08:31:00.000Z',
      item
    }
  };
}

test('Gateway subscribes before listing and replays buffered pushes over the snapshot', async () => {
  const harness = createHarness();
  const list = deferred<unknown>();
  harness.setRequestHandler(async (request) => {
    if (request.type === 'event.subscribe' || request.type === 'event.unsubscribe') {
      return { types: ['webapp.changed'] };
    }
    return list.promise;
  });
  const gateway = createDesktopWebAppsGateway(harness.dependencies);
  const events: WebAppsGatewayEvent[] = [];
  gateway.open((event) => events.push(event));

  await waitFor(() => harness.requests.some((request) => request.type === 'web.webapp.list'), 'catalog request');
  assert.deepEqual(
    harness.requests.slice(0, 2).map((request) => request.type),
    ['event.subscribe', 'web.webapp.list']
  );
  harness.emitPush(changedPush('updated', 'a', rawItem('a', { label: 'Updated A' })));
  list.resolve(rawCatalog([rawItem('a')]));

  await waitFor(() => events.some((event) => event.type === 'snapshot'), 'snapshot event');
  const snapshot = events.find((event) => event.type === 'snapshot');
  assert.equal(snapshot?.type === 'snapshot' ? snapshot.catalog.items[0]?.name : '', 'Updated A');
  assert.equal(events.at(-1)?.type, 'connection');

  harness.emitPush(changedPush('removed', 'a', null));
  assert.deepEqual(events.at(-1), { type: 'remove', appId: 'a' });
  gateway.close();
});

test('Gateway re-subscribes and reloads the snapshot after reconnect without duplicate connected syncs', async () => {
  const harness = createHarness();
  let listCount = 0;
  harness.setRequestHandler(async (request) => {
    if (request.type === 'event.subscribe' || request.type === 'event.unsubscribe') {
      return { types: ['webapp.changed'] };
    }
    listCount += 1;
    return rawCatalog([rawItem(listCount === 1 ? 'a' : 'b')]);
  });
  const gateway = createDesktopWebAppsGateway(harness.dependencies);
  const events: WebAppsGatewayEvent[] = [];
  gateway.open((event) => events.push(event));
  await waitFor(() => events.filter((event) => event.type === 'snapshot').length === 1, 'initial snapshot');

  harness.emitStatus('reconnecting');
  harness.emitStatus('connected');
  await waitFor(() => events.filter((event) => event.type === 'snapshot').length === 2, 'reconnected snapshot');
  harness.emitStatus('connected');
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(listCount, 2);
  assert.equal(harness.requests.filter((request) => request.type === 'event.subscribe').length, 2);
  const snapshots = events.filter((event) => event.type === 'snapshot');
  assert.equal(snapshots[1]?.type === 'snapshot' ? snapshots[1].catalog.items[0]?.id : '', 'b');
  gateway.close();
});

test('Gateway coalesces overlapping refreshes and discards aborted results', async () => {
  const harness = createHarness();
  let listCount = 0;
  let refreshList = deferred<unknown>();
  harness.setRequestHandler(async (request) => {
    if (request.type === 'event.subscribe' || request.type === 'event.unsubscribe') {
      return { types: ['webapp.changed'] };
    }
    listCount += 1;
    return listCount === 1 ? rawCatalog([rawItem('a')]) : refreshList.promise;
  });
  const gateway = createDesktopWebAppsGateway(harness.dependencies);
  const events: WebAppsGatewayEvent[] = [];
  gateway.open((event) => events.push(event));
  await waitFor(() => events.some((event) => event.type === 'snapshot'), 'initial snapshot');

  const firstRefresh = gateway.refresh();
  const secondRefresh = gateway.refresh();
  await waitFor(() => listCount === 2, 'single refresh request');
  refreshList.resolve(rawCatalog([rawItem('b')]));
  await Promise.all([firstRefresh, secondRefresh]);
  assert.equal(listCount, 2);

  refreshList = deferred<unknown>();
  const controller = new AbortController();
  const abortedRefresh = gateway.refresh(controller.signal);
  await waitFor(() => listCount === 3, 'abortable refresh request');
  controller.abort();
  refreshList.resolve(rawCatalog([rawItem('stale')]));
  await assert.rejects(abortedRefresh, { name: 'AbortError' });
  assert.equal(events.filter((event) => event.type === 'snapshot').length, 2);
  gateway.close();
});

test('Gateway rejects HTTP profiles without sending WebApp requests', async () => {
  const harness = createHarness({ profileKind: 'http', status: 'idle' });
  const gateway = createDesktopWebAppsGateway(harness.dependencies);
  const events: WebAppsGatewayEvent[] = [];
  gateway.open((event) => events.push(event));

  await waitFor(() => events.some((event) => event.type === 'error'), 'Desktop-required error');
  const error = events.find((event) => event.type === 'error');
  assert.equal(error?.type === 'error' ? error.error.code : '', 'desktop-required');
  assert.equal(harness.requests.length, 0);
  gateway.close();
});

test('Gateway rejects snapshots from another Desktop device', async () => {
  const harness = createHarness();
  harness.setRequestHandler(async (request) => {
    if (request.type === 'event.subscribe' || request.type === 'event.unsubscribe') {
      return { types: ['webapp.changed'] };
    }
    return rawCatalog([rawItem('a')], 'desktop-2');
  });
  const gateway = createDesktopWebAppsGateway(harness.dependencies);
  const events: WebAppsGatewayEvent[] = [];
  gateway.open((event) => events.push(event));

  await waitFor(() => events.some((event) => event.type === 'error'), 'device mismatch');
  const error = events.find((event) => event.type === 'error');
  assert.equal(error?.type === 'error' ? error.error.code : '', 'device-mismatch');
  assert.equal(
    events.some((event) => event.type === 'snapshot'),
    false
  );
  gateway.close();
});

test('Gateway close removes only its listeners and performs a scoped unsubscribe', async () => {
  const harness = createHarness();
  const gateway = createDesktopWebAppsGateway(harness.dependencies);
  const events: WebAppsGatewayEvent[] = [];
  gateway.open((event) => events.push(event));
  await waitFor(() => events.some((event) => event.type === 'snapshot'), 'initial snapshot');
  assert.deepEqual(harness.listenerCounts(), { push: 1, status: 1 });

  gateway.close();
  await waitFor(
    () => harness.requests.some((request) => request.type === 'event.unsubscribe'),
    'event.unsubscribe request'
  );
  assert.deepEqual(harness.listenerCounts(), { push: 0, status: 0 });
  const unsubscribe = harness.requests.find((request) => request.type === 'event.unsubscribe');
  assert.deepEqual(unsubscribe?.payload, { types: ['webapp.changed'] });
});

test('Gateway can reopen immediately while an old session request is still aborting', async () => {
  const harness = createHarness();
  const firstList = deferred<unknown>();
  let listCount = 0;
  harness.setRequestHandler(async (request) => {
    if (request.type === 'event.subscribe' || request.type === 'event.unsubscribe') {
      return { types: ['webapp.changed'] };
    }
    listCount += 1;
    return listCount === 1 ? firstList.promise : rawCatalog([rawItem('fresh')]);
  });
  const gateway = createDesktopWebAppsGateway(harness.dependencies);
  gateway.open(() => undefined);
  await waitFor(() => listCount === 1, 'old session request');
  gateway.close();
  harness.emitStatus('idle');

  const events: WebAppsGatewayEvent[] = [];
  gateway.open((event) => events.push(event));
  firstList.resolve(rawCatalog([rawItem('stale')]));
  await waitFor(() => events.some((event) => event.type === 'snapshot'), 'reopened snapshot');

  const snapshot = events.find((event) => event.type === 'snapshot');
  assert.equal(snapshot?.type === 'snapshot' ? snapshot.catalog.items[0]?.id : '', 'fresh');
  assert.equal(listCount, 2);
  gateway.close();
});
