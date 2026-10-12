import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as model from '../../src/core/auth/accountAuthModel.ts';
import { ApiError } from '../../src/core/api/apiError.ts';
import type { AccountAuthSnapshot } from '../../src/core/auth/accountAuth.ts';

const compiled = ts.transpileModule(
  readFileSync(new URL('../../src/core/auth/accountAuth.ts', import.meta.url), 'utf8'),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }
).outputText;
function fixture() {
  const stored = new Map<string, string>();
  const payload = (accountId = 'account-a') => ({
    schemaVersion: 1,
    accountId,
    username: accountId,
    deviceId: '11111111-1111-4111-8111-111111111111',
    deviceName: 'Phone',
    accessToken: accountId,
    accessTokenExpireAt: new Date(Date.now() + 3600000).toISOString(),
    deviceToken: 'device-credential'
  });
  let respond = async () => new Response(JSON.stringify(payload()));
  const dependencies: Record<string, unknown> = {
    'react-native-mmkv': {
      MMKV: class {
        getString(key: string) {
          return stored.get(key);
        }
        set(key: string, value: string) {
          stored.set(key, value);
        }
        delete(key: string) {
          stored.delete(key);
        }
      }
    },
    './authConfig.ts': {
      readIdentityApiBaseUrl: () => 'https://identity.test',
      readTunnelHubApiBaseUrl: () => 'https://hub.test'
    },
    './accountAuthModel.ts': model,
    '../api/apiError.ts': { ApiError }
  };
  const exported = {};
  vm.runInNewContext(compiled, {
    exports: exported,
    require: (id: string) => {
      assert.ok(id in dependencies, id);
      return dependencies[id];
    },
    fetch: () => respond(),
    Date,
    Error,
    URL
  });
  const auth = exported as {
    loginWithAccountCredentials(input: object): Promise<unknown>;
    logoutAccount(): Promise<void>;
    bootstrapAccountAuth(): Promise<unknown>;
    getAccountAuthSnapshot(): AccountAuthSnapshot;
    getAccountAccessTokenForRequest(base: string, force?: boolean): Promise<string | null>;
  };
  return {
    auth,
    stored,
    payload,
    setResponse: (fn: typeof respond) => {
      respond = fn;
    }
  };
}
const input = { username: 'a', password: 'test', deviceName: 'Phone' };

test('logout invalidates a delayed login and does not resurrect credentials', async () => {
  const f = fixture();
  let finish!: (response: Response) => void;
  f.setResponse(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const login = f.auth.loginWithAccountCredentials(input);
  await f.auth.logoutAccount();
  finish(new Response(JSON.stringify(f.payload())));
  await assert.rejects(login, /superseded/);
  assert.equal(f.auth.getAccountAuthSnapshot().session, null);
  assert.equal(f.stored.size, 0);
});

test('a newer login invalidates the previous refresh', async () => {
  const f = fixture();
  await f.auth.loginWithAccountCredentials(input);
  let finish!: (response: Response) => void;
  f.setResponse(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const refresh = f.auth.getAccountAccessTokenForRequest('https://identity.test', true);
  f.setResponse(async () => new Response(JSON.stringify(f.payload('account-b'))));
  await f.auth.loginWithAccountCredentials(input);
  finish(new Response(JSON.stringify(f.payload())));
  assert.equal(await refresh, null);
  assert.equal(f.auth.getAccountAuthSnapshot().session?.accountId, 'account-b');
});

test('temporary recovery failure keeps the device credential and blocks business access', async () => {
  const f = fixture();
  await f.auth.loginWithAccountCredentials(input);
  f.setResponse(async () => {
    throw new Error('offline');
  });
  await f.auth.bootstrapAccountAuth();
  assert.equal(f.stored.size, 1);
  assert.equal(f.auth.getAccountAuthSnapshot().session, null);
  assert.equal(f.auth.getAccountAuthSnapshot().error, 'offline');
  f.setResponse(async () => new Response(JSON.stringify(f.payload())));
  await f.auth.bootstrapAccountAuth();
  assert.equal(f.auth.getAccountAuthSnapshot().session?.accountId, 'account-a');
});

test('confirmed account invalidity deletes credentials', async () => {
  const f = fixture();
  await f.auth.loginWithAccountCredentials(input);
  f.setResponse(async () => new Response(JSON.stringify({ error: 'revoked' }), { status: 401 }));
  await f.auth.bootstrapAccountAuth();
  assert.equal(f.stored.size, 0);
});

test('only Identity and Hub origins receive phone account tokens', async () => {
  const f = fixture();
  await f.auth.loginWithAccountCredentials(input);
  assert.equal(await f.auth.getAccountAccessTokenForRequest('https://identity.test/api'), 'account-a');
  assert.equal(await f.auth.getAccountAccessTokenForRequest('https://hub.test/api'), 'account-a');
  assert.equal(await f.auth.getAccountAccessTokenForRequest('https://cloud.test/api'), null);
  assert.equal(await f.auth.getAccountAccessTokenForRequest('https://other.test'), null);
});
