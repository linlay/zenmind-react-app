import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import type * as CloudAuth from '../../src/core/auth/cloudAuth.ts';
import type * as Selection from '../../src/core/auth/activeDesktop.ts';
import type * as Access from '../../src/features/chatPersistence/cloudAccess.ts';
import type * as Lifecycle from '../../src/features/chatPersistence/accountDesktopSource.ts';
import type * as Api from '../../src/core/api/apiClient.ts';
import type * as Runtime from '../../src/features/chatPersistence/chatSourceRuntime.ts';
import type * as Transport from '../../src/core/api/activeWsTransport.ts';
import type { WsTransportConfig } from '../../src/core/ws/wsTransportConfig.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const compiled = new Map<string, string>();
type Storage = Map<string, Map<string, string | boolean>>;
function fixture(input: { token?: string; storage?: Storage; web?: boolean; databaseDirectory?: string } = {}) {
  const storage: Storage = input.storage || new Map();
  const exportsCache = new Map<string, Record<string, unknown>>();
  const accountListeners = new Set<() => void>();
  let account: { isBootstrapping: boolean; session: { accountId: string; deviceId: string } | null } = {
    isBootstrapping: true,
    session: null
  };
  let accountGeneration = 0;
  let scope = 'signed_out';
  let stopped = 0;
  let releases = 0;
  let deletedScopes = 0;
  let deviceItems: { deviceId: string; deviceName: string; online: boolean }[] = [];
  let devicesFail = false;
  const wire: { transport: WsTransportConfig; type: string; signal?: AbortSignal }[] = [];
  let respond: (type: string, signal?: AbortSignal) => Promise<unknown> = async () => ({ code: 0, data: [] });
  let http: () => Promise<Response> = async () => new Response('{}');
  const observations: { scope: string; source: string | null }[] = [];
  const config = {
    sourceId: 'default',
    displayName: 'Cloud',
    apiBaseUrl: 'https://cloud.test',
    wsUrl: 'wss://cloud.test/ap/ws',
    authMode: 'query-token',
    accessToken: input.token ?? 'configured-token'
  };
  const override = new Map<string, unknown>();
  const at = (name: string, value: unknown) => override.set(path.join(root, name), value);
  const observe = () => observations.push({ scope, source: runtime.getActiveChatSource()?.key || null });
  override.set('expo/fetch', { fetch: () => http() });
  override.set('react-native', { Platform: { OS: input.web ? 'web' : 'android' } });
  override.set('react-native-mmkv', {
    MMKV: class {
      values: Map<string, string | boolean>;
      constructor({ id }: { id: string }) {
        this.values = storage.get(id) || new Map();
        storage.set(id, this.values);
      }
      getString(key: string) {
        const value = this.values.get(key);
        return typeof value === 'string' ? value : undefined;
      }
      getBoolean(key: string) {
        return this.values.get(key);
      }
      contains(key: string) {
        return this.values.has(key);
      }
      set(key: string, value: string | boolean) {
        this.values.set(key, value);
      }
      delete(key: string) {
        this.values.delete(key);
      }
      clearAll() {
        this.values.clear();
      }
    }
  });
  override.set('expo-file-system', {
    Directory: class {
      constructor(uri: string) {
        assert.equal(uri, 'file:///test', 'FileSystem requires an absolute file URI');
      }
      exists = false;
    },
    File: class {}
  });
  override.set('expo-sqlite', { defaultDatabaseDirectory: input.databaseDirectory ?? '/test' });
  at('src/core/auth/authConfig.ts', { readTunnelHubApiBaseUrl: () => 'https://hub.test' });
  at('src/core/config/appEnvironment.ts', { getDefaultSourceConfig: () => config });
  at('src/core/auth/accountAuth.ts', {
    getAccountAuthSnapshot: () => account,
    getAccountAuthGeneration: () => accountGeneration,
    getAccountAccessTokenForRequest: async () => 'official-proof',
    subscribeAccountAuth: (listener: () => void) => {
      accountListeners.add(listener);
      return () => accountListeners.delete(listener);
    }
  });
  at('src/core/api/services/deviceLinkApi.ts', {
    listAccountDevices: async () => {
      if (devicesFail) throw new Error('Hub unavailable');
      return { items: deviceItems };
    },
    getDesktopPlatformCredential: async (id: string) => ({
      credential: 'header.payload.signature',
      webSocketUrl: 'wss://desktop.test/ws',
      tokenMode: 'subprotocol',
      platformDeviceId: `local-${id}`,
      expiresAt: new Date(Date.now() + 3600_000).toISOString()
    })
  });
  at('src/core/debug/httpDebugLogger.ts', { logHttpError() {}, logHttpRequest() {}, logHttpResponse() {} });
  at('src/core/ws/sharedWsTransport.ts', {
    sharedWsTransport: {
      request: (request: (typeof wire)[number]) => {
        wire.push(request);
        return respond(request.type, request.signal);
      },
      releaseIfIdle() {
        releases++;
        return true;
      }
    }
  });
  at('src/features/chatRealtime/chatSyncService.ts', {
    chatSyncService: {
      stop() {
        stopped++;
      },
      start: async () => {},
      prewarmHome: async () => {},
      notifySourceAccessChanged() {}
    }
  });
  at('src/features/chatPersistence/database.ts', {
    switchChatDatabaseScope: (value: string, notify = true) => {
      scope = value;
      cache.setChatCacheScopeId(value);
      if (notify) cache.notifyChatCacheScopeChanged();
    },
    ensureChatDatabase: async () => {},
    deleteChatDatabaseScopeIfExists() {
      deletedScopes++;
    }
  });
  at('src/features/chatPersistence/homeSnapshot.ts', { clearChatDirectorySnapshotForScope() {} });
  function load(name: string): Record<string, unknown> {
    let file = name.startsWith(root) ? name : path.join(root, name);
    if (!existsSync(file) && existsSync(file + '.ts')) file += '.ts';
    if (override.has(file)) return override.get(file) as Record<string, unknown>;
    if (exportsCache.has(file)) return exportsCache.get(file)!;
    if (!compiled.has(file))
      compiled.set(
        file,
        ts.transpileModule(readFileSync(file, 'utf8'), {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
        }).outputText
      );
    const exports: Record<string, unknown> = {};
    exportsCache.set(file, exports);
    vm.runInNewContext(compiled.get(file)!, {
      exports,
      require: (id: string) => {
        if (override.has(id)) return override.get(id);
        assert.ok(id.startsWith('.'), `Unexpected external dependency ${id}`);
        return load(path.resolve(path.dirname(file), id));
      },
      Error,
      SyntaxError,
      Date,
      URL,
      URLSearchParams,
      Headers,
      fetch: () => http(),
      AbortController,
      setTimeout,
      clearTimeout,
      Uint8Array
    });
    return exports;
  }
  const cache = load(
    'src/features/chatPersistence/cacheScope.ts'
  ) as typeof import('../../src/features/chatPersistence/cacheScope.ts');
  cache.subscribeChatCacheScope(observe);
  const runtime = load('src/features/chatPersistence/chatSourceRuntime.ts') as typeof Runtime;
  const cloud = load('src/core/auth/cloudAuth.ts') as typeof CloudAuth;
  const selection = load('src/core/auth/activeDesktop.ts') as typeof Selection;
  const access = load('src/features/chatPersistence/cloudAccess.ts') as typeof Access;
  const lifecycle = load('src/features/chatPersistence/accountDesktopSource.ts') as typeof Lifecycle;
  const api = load('src/core/api/apiClient.ts') as typeof Api;
  const transport = load('src/core/api/activeWsTransport.ts') as typeof Transport;
  return {
    cloud,
    selection,
    access,
    lifecycle,
    api,
    runtime,
    transport,
    storage,
    wire,
    observations,
    scope: () => scope,
    stopped: () => stopped,
    releases: () => releases,
    deletedScopes: () => deletedScopes,
    respond: (next: typeof respond) => {
      respond = next;
    },
    http: (next: typeof http) => {
      http = next;
    },
    devices: (items: typeof deviceItems, fail = false) => {
      deviceItems = items;
      devicesFail = fail;
    },
    account: (id: string | null) => {
      accountGeneration++;
      account = { isBootstrapping: false, session: id ? { accountId: id, deviceId: 'phone' } : null };
      accountListeners.forEach((listener) => listener());
    }
  };
}
const tick = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

test('first launch verifies both empty directory responses and enters cloud without waiting for Identity', async () => {
  const f = fixture();
  const stop = f.lifecycle.startAccountSourceLifecycle();
  try {
    await tick();
    assert.equal(f.cloud.getCloudAuthSnapshot().status, 'available');
    assert.equal(f.selection.getSelectedSource()?.kind, 'cloud');
    assert.ok(f.scope().startsWith('cs_'));
    assert.deepEqual(
      f.wire.map((r) => r.type),
      ['/api/agents', '/api/chats']
    );
    assert.ok(f.wire.every((r) => r.transport.accessToken === 'configured-token'));
  } finally {
    stop();
  }
});

test('startup preserves historical cache files and credentials instead of purging them', async () => {
  const old = new Map<string, string | boolean>([['auth_device_token_v1', 'historical-credential']]);
  const storage: Storage = new Map([
    ['zenmind-auth-session', old],
    ['zenmind-device-profiles', new Map([['legacy-profile', 'retained']])]
  ]);
  const f = fixture({ storage });
  const stop = f.lifecycle.startAccountSourceLifecycle();
  try {
    await tick();
    assert.equal(f.deletedScopes(), 0);
    assert.equal(old.get('auth_device_token_v1'), 'historical-credential');
    assert.equal(storage.get('zenmind-device-profiles')?.get('legacy-profile'), 'retained');
  } finally {
    stop();
  }
});

test('account login and logout do not invalidate an in-flight cloud HTTP request, its selection or scope', async () => {
  const f = fixture();
  const stop = f.lifecycle.startAccountSourceLifecycle();
  try {
    await tick();
    const scope = f.scope();
    let finish!: () => void;
    f.http(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(new Response('{"ok":true}'));
        })
    );
    const request = f.api.authenticatedApiRequest({ path: '/api/chats' });
    await tick();
    f.account('a');
    f.account(null);
    finish();
    assert.equal(((await request) as { ok: boolean }).ok, true);
    assert.equal(f.scope(), scope);
    assert.equal(f.selection.getSelectedSource()?.kind, 'cloud');
  } finally {
    stop();
  }
});

test('manual Token persists only after verification, restores its scope, and changing Token never reuses old message scope', async () => {
  const f = fixture();
  f.cloud.restoreCloudCredential();
  assert.equal(await f.access.verifyDefaultCloud('manual-one'), 'available');
  const one = f.cloud.getCloudAuthSnapshot().scopeId;
  const restored = fixture({ storage: f.storage });
  restored.cloud.restoreCloudCredential();
  assert.equal(restored.cloud.readCloudCredential()?.token, 'manual-one');
  assert.equal(await restored.access.verifyDefaultCloud(), 'available');
  assert.equal(restored.cloud.getCloudAuthSnapshot().scopeId, one);
  assert.equal(await restored.access.verifyDefaultCloud('manual-two'), 'available');
  assert.notEqual(restored.cloud.getCloudAuthSnapshot().scopeId, one);
  restored.cloud.logoutCloud();
  const signedOut = fixture({ storage: f.storage });
  signedOut.cloud.restoreCloudCredential();
  assert.equal(signedOut.cloud.readCloudCredential(), null);
  assert.equal(await signedOut.access.verifyDefaultCloud(), 'login_required');
  assert.equal(signedOut.wire.length, 0);
});

test('cloud failures distinguish authentication, permission, service, network and protocol; manual credentials never fall back', async () => {
  for (const [error, expected] of [
    [{ status: 401 }, 'login_required'],
    [{ status: 403 }, 'forbidden'],
    [{ status: 503 }, 'service_error'],
    [new Error('offline'), 'network_error'],
    [null, 'protocol_error']
  ] as const) {
    const f = fixture();
    f.cloud.restoreCloudCredential();
    await f.access.verifyDefaultCloud('manual-one');
    f.respond(async () => {
      if (error) throw error;
      return { unexpected: true };
    });
    assert.equal(await f.access.verifyDefaultCloud(), expected);
    assert.equal(f.cloud.readCloudCredential()?.token, 'manual-one');
    assert.equal(f.cloud.getCloudAuthSnapshot().cacheAllowed, expected !== 'login_required');
    assert.ok(f.releases() >= 2);
  }
});

test('a failed replacement Token cannot replace or disable a previously valid credential', async () => {
  const f = fixture();
  f.cloud.restoreCloudCredential();
  await f.access.verifyDefaultCloud('good');
  const scope = f.cloud.getCloudAuthSnapshot().scopeId;
  f.respond(async () => {
    throw { status: 401 };
  });
  assert.equal(await f.access.verifyDefaultCloud('bad'), 'login_required');
  assert.equal(f.cloud.getCloudAuthSnapshot().status, 'available');
  assert.equal(f.cloud.getCloudAuthSnapshot().scopeId, scope);
  assert.equal(f.cloud.readCloudCredential()?.token, 'good');
});

test('verification is single flight and late completion cannot reopen cloud after logout or a newer Token', async () => {
  const f = fixture();
  f.cloud.restoreCloudCredential();
  const finishes: (() => void)[] = [];
  f.respond(
    () =>
      new Promise((resolve) => {
        finishes.push(() => resolve([]));
      })
  );
  const one = f.access.verifyDefaultCloud();
  assert.equal(f.access.verifyDefaultCloud(), one);
  f.cloud.logoutCloud();
  finishes.splice(0).forEach((finish) => finish());
  await one;
  assert.equal(f.cloud.getCloudAuthSnapshot().status, 'login_required');
  const old = f.access.verifyDefaultCloud('old');
  await tick();
  const oldFinishes = finishes.splice(0);
  f.respond(async () => []);
  assert.equal(await f.access.verifyDefaultCloud('new'), 'available');
  oldFinishes.forEach((finish) => finish());
  await old;
  assert.equal(f.cloud.readCloudCredential()?.token, 'new');
});

test('online Desktop switching uses the same scope/selection; cloud logout leaves Desktop intact, revocation closes to no source', async () => {
  const f = fixture();
  const stop = f.lifecycle.startAccountSourceLifecycle();
  try {
    await tick();
    f.devices([{ deviceId: 'pc', deviceName: 'PC', online: true }]);
    f.account('a');
    await tick();
    await f.lifecycle.activateAccountDesktopSource('a', { deviceId: 'pc', deviceName: 'PC', online: true });
    const scope = f.scope();
    const stops = f.stopped();
    f.cloud.logoutCloud();
    assert.equal(f.scope(), scope);
    assert.equal(f.stopped(), stops);
    assert.equal(f.selection.readActiveDesktopId('a'), 'pc');
    f.devices([], true);
    await assert.rejects(f.lifecycle.refreshAccountDesktopDirectory(), /Hub/);
    assert.equal(f.scope(), scope);
    f.devices([]);
    await f.lifecycle.refreshAccountDesktopDirectory();
    assert.equal(f.scope(), 'signed_out');
    assert.equal(f.selection.getSelectedSource(), null);
    assert.equal(f.runtime.getActiveChatSource(), null);
  } finally {
    stop();
  }
});

test('offline Desktop remains selected with its cache but issues no remote credential; account logout hides it without fallback', async () => {
  const f = fixture({ token: '' });
  const stop = f.lifecycle.startAccountSourceLifecycle();
  try {
    await tick();
    f.account('a');
    await tick();
    await f.lifecycle.activateAccountDesktopSource('a', { deviceId: 'pc', deviceName: 'PC', online: false });
    assert.ok(f.scope().startsWith('as_'));
    assert.equal(await f.transport.resolveActiveWsTransportConfig('ap'), null);
    assert.equal(f.transport.resolveDefaultWsTransportConfig(), null);
    f.account(null);
    assert.equal(f.scope(), 'signed_out');
    assert.equal(f.selection.getSelectedSource(), null);
  } finally {
    stop();
  }
});

test('cloud logout and credential rejection discard delayed HTTP responses and hide cached content', async () => {
  for (const revoke of ['logout', '401'] as const) {
    const f = fixture();
    const stop = f.lifecycle.startAccountSourceLifecycle();
    try {
      await tick();
      let finish!: () => void;
      f.http(
        () =>
          new Promise((resolve) => {
            finish = () => resolve(new Response('{}'));
          })
      );
      const request = f.api.authenticatedApiRequest({ path: '/api/chats' });
      await tick();
      if (revoke === 'logout') f.cloud.logoutCloud();
      else f.cloud.reportCloudFailure('login_required', f.cloud.getCloudAuthSnapshot().generation);
      finish();
      await assert.rejects(request, /superseded/);
      assert.equal(f.scope(), 'signed_out');
      assert.equal(f.runtime.getActiveChatSource(), null);
    } finally {
      stop();
    }
  }
});

test('Web never saves a manual Token to persistent storage', async () => {
  const f = fixture({ web: true });
  f.cloud.restoreCloudCredential();
  await f.access.verifyDefaultCloud('web-secret');
  assert.equal(f.storage.has('zenmind-cloud-credential'), false);
});

test('an existing Desktop preference waits for its matching account instead of auto-selecting cloud', async () => {
  const storage: Storage = new Map([
    ['zenmind-active-account-desktop', new Map([['active_desktop_by_account_v1', JSON.stringify({ a: 'pc' })]])]
  ]);
  const f = fixture({ storage });
  f.devices([{ deviceId: 'pc', deviceName: 'PC', online: true }]);
  const stop = f.lifecycle.startAccountSourceLifecycle();
  try {
    await tick();
    assert.equal(f.selection.getSelectedSource(), null);
    assert.equal(f.scope(), 'signed_out');
    f.account('a');
    await tick();
    assert.equal(f.selection.readActiveDesktopId('a'), 'pc');
    assert.ok(f.scope().startsWith('as_'));
  } finally {
    stop();
  }
});

test('changing the configured source never forwards a saved manual Token to a new host', async () => {
  const f = fixture();
  f.cloud.restoreCloudCredential();
  await f.access.verifyDefaultCloud('manual');
  const raw = f.storage.get('zenmind-cloud-credential')?.get('default_cloud_credential_v1');
  assert.equal(typeof raw, 'string');
  const saved = JSON.parse(raw as string);
  saved.binding = JSON.stringify(['other', 'https://other.test', 'wss://other.test/ws', 'query-token']);
  f.storage.get('zenmind-cloud-credential')!.set('default_cloud_credential_v1', JSON.stringify(saved));
  const restored = fixture({ storage: f.storage });
  restored.cloud.restoreCloudCredential();
  await restored.access.verifyDefaultCloud();
  assert.ok(restored.wire.every((request) => request.transport.accessToken === 'configured-token'));
});
