import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { ApiError } from '../../src/core/api/apiError.ts';
import type * as Auth from '../../src/core/auth/accountAuth.ts';
import type { AccountSession } from '../../src/core/auth/accountAuthModel.ts';

const compiled = ts.transpileModule(readFileSync('src/core/auth/accountAuth.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const session = (id = 'employee'): AccountSession => ({
  accountId: `enterprise:https://sso.test:${id}`,
  user: { displayName: id, email: '', avatarUrl: '' },
  accessToken: `private-${id}`,
  accessExpireAtMs: Date.now() + 3600_000
});
function fixture() {
  const stored = new Map<string, unknown>();
  const writes: string[] = [];
  let saved: AccountSession | null = session();
  const behavior = {
    verify: async () => session(),
    restore: async () => saved,
    clear: async () => {
      saved = null;
    }
  };
  const deps: Record<string, unknown> = {
    'react-native-mmkv': {
      MMKV: class {
        getBoolean(k: string) {
          return stored.get(k);
        }
        set(k: string, v: unknown) {
          stored.set(k, v);
        }
      }
    },
    './authConfig.ts': {
      ACCOUNT_LOGIN_METHOD: 'enterprise-sso',
      readAccountApiBaseUrl: () => 'https://sso.test',
      readTunnelHubApiBaseUrl: () => 'https://hub.test'
    },
    './accountAuthModel.ts': {},
    '../api/apiError.ts': { ApiError },
    '../api/accountRequest.ts': {
      sendAccountApiRequest: () => {
        throw new Error('official endpoint used');
      }
    },
    '../api/contracts/accountEmail.ts': {},
    './enterpriseAccount': {
      verifyEnterpriseLogin: () => behavior.verify(),
      restoreEnterpriseSession: () => behavior.restore(),
      saveEnterpriseSession: async (value: AccountSession) => {
        saved = value;
        writes.push(value.accountId);
      },
      clearEnterpriseSession: () => behavior.clear()
    }
  };
  const exported: Partial<typeof Auth> = {};
  vm.runInNewContext(compiled, {
    exports: exported,
    require: (key: string) => {
      assert.ok(key in deps, key);
      return deps[key];
    },
    URL,
    Date,
    Error,
    Promise
  });
  return { auth: exported as typeof Auth, behavior, stored, writes, saved: () => saved };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test('enterprise login uses the existing snapshot and only allows its auth origin and Hub', async () => {
  const f = fixture();
  await f.auth.beginEnterpriseAccountLogin();
  assert.equal(f.saved(), null);
  const gen = f.auth.getAccountAuthGeneration();
  const loggedIn = await f.auth.completeEnterpriseAccountLogin(gen);
  assert.equal(f.auth.getAccountAuthSnapshot().session, loggedIn);
  assert.equal(await f.auth.getAccountAccessTokenForRequest('https://hub.test'), loggedIn.accessToken);
  assert.equal(await f.auth.getAccountAccessTokenForRequest('https://official.test'), null);
  await assert.rejects(f.auth.loginWithAccountEmail({ email: 'a@example.test', code: '123456' }));
});

test('a cancelled WebView verification cannot publish or persist a late session', async () => {
  const f = fixture();
  const gate = deferred<AccountSession>();
  f.behavior.verify = () => gate.promise;
  await f.auth.beginEnterpriseAccountLogin();
  const gen = f.auth.getAccountAuthGeneration();
  const old = f.auth.completeEnterpriseAccountLogin(gen);
  const rejection = assert.rejects(old, /superseded/);
  await Promise.resolve();
  const cancelled = f.auth.cancelEnterpriseAccountLogin(gen);
  gate.resolve(session());
  await rejection;
  await cancelled;
  assert.equal(f.saved(), null);
  assert.equal(f.writes.length, 0);
  assert.equal(f.auth.getAccountAuthSnapshot().session, null);
  assert.equal(await f.auth.bootstrapAccountAuth(), null);
});

test('logout serializes behind refresh and prevents a late refresh from reviving credentials', async () => {
  const f = fixture();
  await f.auth.bootstrapAccountAuth();
  const gate = deferred<AccountSession>();
  f.behavior.restore = () => gate.promise;
  const refresh = f.auth.refreshAccountSession(true);
  await Promise.resolve();
  const count = f.writes.length;
  const logout = f.auth.logoutAccount();
  gate.resolve(session());
  await refresh;
  await logout;
  assert.equal(f.writes.length, count);
  assert.equal(f.saved(), null);
  assert.equal(f.auth.getAccountAuthSnapshot().session, null);
  assert.equal(await f.auth.bootstrapAccountAuth(), null);
});

test('temporary restore failure keeps recovery material; invalidity or a different subject clears it', async () => {
  const f = fixture();
  await f.auth.bootstrapAccountAuth();
  f.behavior.restore = async () => {
    throw new Error('offline');
  };
  await f.auth.refreshAccountSession(true);
  assert.ok(f.saved());
  assert.ok(f.auth.getAccountAuthSnapshot().session);
  f.behavior.restore = async () => session('other');
  await f.auth.refreshAccountSession(true);
  assert.equal(f.saved(), null);
  assert.equal(f.auth.getAccountAuthSnapshot().session, null);
  assert.equal(await f.auth.bootstrapAccountAuth(), null);
  const fresh = fixture();
  fresh.behavior.restore = async () => {
    throw new ApiError('expired', 401, null);
  };
  await fresh.auth.bootstrapAccountAuth();
  assert.equal(fresh.saved(), null);
});

test('cleanup failure prevents a new WebView from becoming ready and keeps local sign-out intent', async () => {
  const f = fixture();
  f.behavior.clear = async () => {
    throw new Error('cookie-store unavailable');
  };
  await assert.rejects(f.auth.beginEnterpriseAccountLogin(), /cookie-store/);
  assert.equal(f.auth.getAccountAuthSnapshot().session, null);
  assert.equal(await f.auth.bootstrapAccountAuth(), null);
});
