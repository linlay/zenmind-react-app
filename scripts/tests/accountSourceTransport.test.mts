import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import type { WsTransportConfig } from '../../src/core/ws/wsTransportConfig.ts';
import type { AccountSession } from '../../src/core/auth/accountAuthModel.ts';

const compiled = ts.transpileModule(
  readFileSync(new URL('../../src/core/api/activeWsTransport.ts', import.meta.url), 'utf8'),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }
).outputText;
function fixture(authMode: 'none' | 'query-token' = 'query-token') {
  let session: AccountSession | null = null;
  let desktopId = '';
  let selection = { kind: 'cloud' };
  let generation = 0;
  let requests = 0;
  let cloudScope = 'cs_cloud';
  let cloudStatus = 'available';
  const route = () => ({
    credential: 'route-token',
    webSocketUrl: 'wss://desktop.test/ws',
    tokenMode: 'query',
    routeContext: {
      accountId: 'a',
      sourceDeviceId: 'phone',
      targetDesktopId: desktopId,
      expiresAt: new Date(Date.now() + 120_000).toISOString()
    }
  });
  let issue = async () => route();
  const dependencies: Record<string, unknown> = {
    '../auth/accountAuth.ts': {
      getAccountAuthSnapshot: () => ({ session }),
      getAccountAuthGeneration: () => generation,
      getAccountAccessTokenForRequest: async () => session?.accessToken || null
    },
    '../auth/authConfig': { readIdentityApiBaseUrl: () => 'https://identity.test' },
    '../auth/activeDesktop.ts': {
      readActiveDesktopId: () => desktopId,
      isActiveDesktopOffline: () => false,
      getSelectedSource: () => selection
    },
    '../auth/cloudAuth': {
      getCloudAuthSnapshot: () => ({ status: cloudStatus }),
      readCloudCredential: () =>
        cloudScope ? { scopeId: cloudScope, token: authMode === 'none' ? '' : 'existing-cloud-token' } : null
    },
    '../config/appEnvironment': {
      getDefaultSourceConfig: () => ({
        sourceId: 'cloud',
        apiBaseUrl: 'https://cloud.test',
        authMode,
        accessToken: 'existing-cloud-token'
      })
    },
    './services/deviceLinkApi.ts': {
      issueDesktopRouteCredential: async () => {
        requests++;
        return issue();
      }
    }
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (id: string) => {
      assert.ok(id in dependencies, `Unexpected legacy dependency: ${id}`);
      return dependencies[id];
    },
    Date,
    Error,
    Uint8Array
  });
  const transport = exports as {
    resolveDefaultWsTransportConfig(): WsTransportConfig | null;
    resolveActiveWsTransportConfig(ns: 'ap'): Promise<WsTransportConfig | null>;
  };
  return {
    transport,
    route,
    requests: () => requests,
    login: () => {
      generation++;
      session = {
        accountId: 'a',
        deviceId: 'phone',
        accessToken: 'account-token',
        accessExpireAtMs: Date.now() + 3600000
      } as AccountSession;
    },
    logoutCloud: () => {
      cloudScope = '';
      cloudStatus = 'login_required';
    },
    logout: () => {
      generation++;
      session = null;
    },
    select: (id: string) => {
      desktopId = id;
      selection = { kind: id ? 'desktop' : 'cloud' };
    },
    setIssue: (next: typeof issue) => {
      issue = next;
    }
  };
}

test('signed-out account can use verified cloud credentials but never a Desktop route', async () => {
  const f = fixture();
  assert.equal(f.transport.resolveDefaultWsTransportConfig()?.accessToken, 'existing-cloud-token');
  assert.equal(await f.transport.resolveActiveWsTransportConfig('ap'), null);
  assert.equal(f.requests(), 0);
});

test('cloud keeps its own credential across account logout and expires only with cloud logout', async () => {
  const f = fixture();
  f.login();
  const config = f.transport.resolveDefaultWsTransportConfig()!;
  assert.equal(config.accessToken, 'existing-cloud-token');
  assert.equal(await config.accessTokenProvider!(), 'existing-cloud-token');
  f.logout();
  assert.equal(await config.accessTokenProvider!(), 'existing-cloud-token');
  f.logoutCloud();
  await assert.rejects(config.accessTokenProvider!(), /superseded/);
});

test('cloud authMode none does not inject a phone account token', async () => {
  const f = fixture('none');
  f.login();
  const config = f.transport.resolveDefaultWsTransportConfig()!;
  assert.equal(config.accessToken, '');
  assert.equal(await config.accessTokenProvider!(), '');
});

test('an old cloud provider cannot be used after selecting a computer', async () => {
  const f = fixture();
  f.login();
  const config = f.transport.resolveDefaultWsTransportConfig()!;
  f.select('desktop-a');
  await assert.rejects(config.accessTokenProvider!(), /superseded/);
});

test('a delayed Desktop route cannot cross a source switch', async () => {
  const f = fixture();
  f.login();
  f.select('desktop-a');
  const route = f.route();
  let finish!: (value: typeof route) => void;
  f.setIssue(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const request = f.transport.resolveActiveWsTransportConfig('ap');
  f.select('desktop-b');
  finish(route);
  await assert.rejects(request, /superseded/);
});

test('a route for the wrong account, caller or target is rejected', async () => {
  for (const key of ['accountId', 'sourceDeviceId', 'targetDesktopId'] as const) {
    const f = fixture();
    f.login();
    f.select('desktop-a');
    const route = f.route();
    route.routeContext[key] = 'other';
    f.setIssue(async () => route);
    await assert.rejects(f.transport.resolveActiveWsTransportConfig('ap'), /identity mismatch/);
  }
});

test('route resolution shares one pending issuance, while each socket authentication gets a fresh JTI', async () => {
  const f = fixture();
  f.login();
  f.select('desktop-a');
  let finish!: (value: ReturnType<typeof f.route>) => void;
  f.setIssue(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const one = f.transport.resolveActiveWsTransportConfig('ap');
  const two = f.transport.resolveActiveWsTransportConfig('ap');
  assert.equal(f.requests(), 1);
  finish(f.route());
  const [first] = await Promise.all([one, two]);
  await f.transport.resolveActiveWsTransportConfig('ap');
  assert.equal(f.requests(), 1);
  f.setIssue(async () => f.route());
  await first!.accessTokenProvider!();
  assert.equal(f.requests(), 2);
  assert.equal(f.transport.resolveDefaultWsTransportConfig(), null);
});
