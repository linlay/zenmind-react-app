import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as model from '../../src/core/auth/accountAuthModel.ts';
import * as email from '../../src/core/api/contracts/accountEmail.ts';
import { ApiError } from '../../src/core/api/apiError.ts';
import type * as Auth from '../../src/core/auth/accountAuth.ts';
const compiled = ts.transpileModule(
  readFileSync(new URL('../../src/core/auth/accountAuth.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
).outputText;
function fixture(signedOut = false) {
  const stored = new Map<string, unknown>(signedOut ? [['signed_out', true]] : []);
  let user: model.OfficialUser | null = {
    id: 1,
    email: 'a@example.test',
    displayName: 'A',
    avatarUrl: '',
    enabled: true
  };
  const calls: Array<{ path: string; credentials?: string; headers?: Record<string, string>; body?: unknown }> = [];
  let interceptor: ((path: string, body?: unknown) => Promise<void>) | null = null;
  const request = async (base: string, options: (typeof calls)[number]) => {
    assert.equal(base, 'https://official.test');
    calls.push(options);
    await interceptor?.(options.path, options.body);
    if (options.path.endsWith('verify')) {
      const body = options.body as { email: string };
      user = {
        id: body.email.startsWith('b') ? 2 : 1,
        email: body.email,
        displayName: body.email,
        avatarUrl: '',
        enabled: true
      };
      return { user };
    }
    if (!user) throw new ApiError('unauthorized', 401, null);
    if (options.path.endsWith('me')) return { user };
    if (options.path.endsWith('csrf')) return { csrfToken: 'csrf' };
    if (options.path.endsWith('token')) {
      assert.equal(options.headers?.['X-CSRF-Token'], 'csrf');
      return {
        ok: true,
        user,
        accessToken: `official-${user.id}`,
        tokenType: 'Bearer',
        expiresAt: new Date(Date.now() + 3600_000).toISOString()
      };
    }
    if (options.path.endsWith('logout')) {
      assert.equal(options.headers?.['X-CSRF-Token'], 'csrf');
      user = null;
      return { ok: true };
    }
    throw new Error(options.path);
  };
  const dependencies: Record<string, unknown> = {
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
      ACCOUNT_LOGIN_METHOD: 'email-code',
      readAccountApiBaseUrl: () => 'https://official.test',
      readTunnelHubApiBaseUrl: () => 'https://hub.test'
    },
    './accountAuthModel.ts': model,
    './enterpriseAccount': {},
    '../api/apiError.ts': { ApiError },
    '../api/accountRequest.ts': { sendAccountApiRequest: request },
    '../api/contracts/accountEmail.ts': email
  };
  const exported: Partial<typeof Auth> = {};
  vm.runInNewContext(compiled, {
    exports: exported,
    require: (key: string) => {
      assert.ok(key in dependencies, key);
      return dependencies[key];
    },
    URL,
    Error,
    Date,
    Promise
  });
  return {
    auth: exported as typeof Auth,
    calls,
    stored,
    setInterceptor: (fn: typeof interceptor) => {
      interceptor = fn;
    },
    hasCookie: () => Boolean(user)
  };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
test('Cookie recovery validates me then obtains a CSRF-protected official JWT without persisting credentials', async () => {
  const f = fixture();
  const session = await f.auth.bootstrapAccountAuth();
  assert.equal(session?.user.displayName, 'A');
  assert.equal(session?.accessToken, 'official-1');
  assert.deepEqual(
    f.calls.map((c) => c.path),
    ['/api/auth/me', '/api/auth/csrf', '/api/auth/desktop-sso/token']
  );
  assert.ok(f.calls.every((c) => c.credentials === 'include'));
  assert.equal(f.stored.size, 0);
});
const login = { email: 'a@example.test', code: '012345' };
test(`email login preserves credentials and publishes only the confirmed official user`, async () => {
  const f = fixture();
  const session = await f.auth.loginWithAccountEmail(login);
  assert.equal(session.accountId, 'official:https://official.test:1');
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].body)), login);
  assert.deepEqual(
    f.calls.map((c) => c.path),
    ['/api/auth/email-code/verify', '/api/auth/me', '/api/auth/csrf', '/api/auth/desktop-sso/token']
  );
  assert.ok(f.calls.every((call) => call.credentials === 'include'));
  assert.deepEqual([...f.stored.entries()], [['signed_out', false]]);
  assert.equal(await f.auth.getAccountAccessTokenForRequest('https://hub.test'), 'official-1');
  assert.equal(await f.auth.getAccountAccessTokenForRequest('https://cloud.test'), null);
  assert.equal(await f.auth.getAccountAccessTokenForRequest('https://untrusted.test'), null);
});
test(`email logout discards a late login and serializes Cookie cleanup before a new login`, async () => {
  const f = fixture();
  const gate = deferred();
  let reached = false;
  f.setInterceptor(async (path) => {
    if (path.endsWith('verify') && !reached) {
      reached = true;
      await gate.promise;
    }
  });
  const old = f.auth.loginWithAccountEmail(login);
  const rejected = assert.rejects(old, /superseded/);
  await Promise.resolve();
  await Promise.resolve();
  const logout = f.auth.logoutAccount();
  const next = f.auth.loginWithAccountEmail({ email: 'b@example.test', code: '123456' });
  gate.resolve();
  await rejected;
  await logout;
  const session = await next;
  assert.equal(session.accountId, 'official:https://official.test:2');
  assert.equal(f.auth.getAccountAuthSnapshot().session?.accountId, session.accountId);
  const paths = f.calls.map((c) => c.path);
  assert.ok(paths.indexOf('/api/auth/logout') < paths.lastIndexOf('/api/auth/email-code/verify'));
});
test(`cancelled email login revokes its Cookie and never publishes a session`, async () => {
  const f = fixture();
  const gate = deferred();
  f.setInterceptor(async (path) => {
    if (path.endsWith('verify')) await gate.promise;
  });
  const controller = new AbortController();
  const pending = f.auth.loginWithAccountEmail({ ...login, signal: controller.signal });
  const rejected = assert.rejects(pending, /superseded/);
  await Promise.resolve();
  await Promise.resolve();
  controller.abort();
  gate.resolve();
  await rejected;
  assert.equal(f.auth.getAccountAuthSnapshot().session, null);
  assert.equal(f.hasCookie(), false);
});
test(`email temporary refresh failure retains a still-valid session; confirmed invalidity clears it`, async () => {
  const f = fixture();
  await f.auth.loginWithAccountEmail(login);
  f.setInterceptor(async () => {
    throw new Error('offline');
  });
  await f.auth.getAccountAccessTokenForRequest('https://hub.test', true);
  assert.ok(f.auth.getAccountAuthSnapshot().session);
  f.setInterceptor(async () => {
    throw new ApiError('unauthorized', 401, null);
  });
  assert.equal(await f.auth.getAccountAccessTokenForRequest('https://hub.test', true), null);
  assert.equal(f.auth.getAccountAuthSnapshot().session, null);
});
test(`email local logout intent survives a failed remote logout and prevents Cookie resurrection`, async () => {
  const f = fixture();
  await f.auth.loginWithAccountEmail(login);
  f.setInterceptor(async () => {
    throw new Error('offline');
  });
  await assert.rejects(f.auth.logoutAccount(), /offline/);
  const count = f.calls.length;
  assert.equal(await f.auth.bootstrapAccountAuth(), null);
  assert.equal(f.calls.length, count);
  assert.equal(f.stored.get('signed_out'), true);
  assert.equal(await fixture(true).auth.bootstrapAccountAuth(), null);
});

test('disabled email accounts do not exchange or publish a session', async () => {
  const f = fixture();
  f.setInterceptor(async () => {
    throw new ApiError('account_disabled', 403, null);
  });
  await assert.rejects(f.auth.loginWithAccountEmail(login), /account_disabled/);
  assert.deepEqual(
    f.calls.map((call) => call.path),
    ['/api/auth/email-code/verify']
  );
  assert.equal(f.auth.getAccountAuthSnapshot().session, null);
  assert.equal(f.stored.get('signed_out'), true);
});
