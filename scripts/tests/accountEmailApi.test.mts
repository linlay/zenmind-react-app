import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as contract from '../../src/core/api/contracts/accountEmail.ts';
import { ApiError } from '../../src/core/api/apiError.ts';
function load<T>(path: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const exported = {};
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  vm.runInNewContext(
    ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
      .outputText,
    {
      exports: exported,
      require: (key: string) => {
        assert.ok(key in dependencies, key);
        return dependencies[key];
      },
      URL,
      Error,
      Date,
      AbortController,
      setTimeout,
      clearTimeout,
      ...globals
    }
  );
  return exported as T;
}
test('email normalization rejects injection and the official receipt has only actual server fields', () => {
  assert.deepEqual(contract.normalizeAccountEmail(' Alice.X+tag@Example.COM '), {
    email: 'Alice.X+tag@Example.COM',
    key: 'alice.x+tag@example.com'
  });
  for (const bad of [
    'a@example.com\r\nBcc: b@example.com',
    'A <a@example.com>',
    'a@example.com,b@example.com',
    '中文@example.com',
    'a..b@example.com'
  ])
    assert.equal(contract.normalizeAccountEmail(bad), null);
  const receipt = { ok: true, expiresAt: new Date(Date.now() + 600_000).toISOString() };
  assert.deepEqual(contract.parseAccountEmailReceipt(receipt), receipt);
  assert.throws(() => contract.parseAccountEmailReceipt({ schemaVersion: 1, challengeId: 'old' }));
  assert.equal(contract.isAccountEmailVerification('a@example.test', '012345'), true);
  assert.equal(contract.isAccountEmailVerification('a@example.test', '12345'), false);
});
test('sending an email code uses the explicit official origin and email only', async () => {
  const calls: Array<{ base: string; options: Record<string, unknown> }> = [];
  const receipt = { ok: true, expiresAt: new Date(Date.now() + 600_000).toISOString() };
  const api = load<typeof import('../../src/core/api/services/accountEmailApi.ts')>(
    '../../src/core/api/services/accountEmailApi.ts',
    {
      '../../auth/authConfig.ts': { readOfficialApiBaseUrl: () => 'https://official.test' },
      '../accountRequest.ts': {
        sendAccountApiRequest: async (base: string, options: Record<string, unknown>) => {
          calls.push({ base, options });
          return receipt;
        }
      },
      '../apiError.ts': { ApiError },
      '../contracts/accountEmail.ts': contract
    }
  );
  await api.requestEmailLoginCode('a@example.test');
  assert.equal(calls[0].base, 'https://official.test');
  assert.equal(calls[0].options.path, '/api/auth/email-code/start');
  assert.equal(calls[0].options.credentials, 'include');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].options.body)), { email: 'a@example.test' });
  for (const [code, status, key] of [
    ['account_disabled', 403, 'auth.error.disabled'],
    ['invalid_code', 401, 'accountEmail.error.authentication'],
    ['rate_limited', 429, 'auth.error.rate'],
    ['server_error', 500, 'auth.error.service']
  ] as const) {
    assert.equal(api.accountEmailErrorKey(new ApiError(code, status, null)), key);
  }
});
test('account HTTP omits Cookie for Hub, includes it explicitly for official requests and refuses redirected/foreign origins', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const api = load<typeof import('../../src/core/api/accountRequest.ts')>('../../src/core/api/accountRequest.ts', {
    './apiError.ts': { ApiError },
    'expo/fetch': {
      fetch: async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response('{}');
      }
    }
  });
  await api.sendAccountApiRequest('https://hub.test', { path: '/api/desktop/account-devices' }, 'official-jwt');
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer official-jwt');
  await api.sendAccountApiRequest('https://official.test', { path: '/api/auth/me', credentials: 'include' });
  assert.equal(calls[1].init.credentials, 'include');
  assert.equal('Authorization' in (calls[1].init.headers as Record<string, string>), false);
  await assert.rejects(
    api.sendAccountApiRequest('https://hub.test', { path: 'https://other.test/steal' }, 'secret'),
    /origin/
  );
  assert.equal(calls.length, 2);
});
test('official structured error codes and timeouts remain distinguishable', async () => {
  const api = load<typeof import('../../src/core/api/accountRequest.ts')>('../../src/core/api/accountRequest.ts', {
    './apiError.ts': { ApiError },
    'expo/fetch': {
      fetch: async () =>
        new Response(JSON.stringify({ error: { code: 'invalid_code', message: 'Incorrect code' } }), { status: 401 })
    }
  });
  await assert.rejects(
    api.sendAccountApiRequest('https://official.test', { path: '/api/auth/email-code/verify' }),
    (e) => e instanceof ApiError && e.message === 'invalid_code' && e.status === 401
  );
  const timeout = load<typeof import('../../src/core/api/accountRequest.ts')>('../../src/core/api/accountRequest.ts', {
    './apiError.ts': { ApiError },
    'expo/fetch': {
      fetch: (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))
    }
  });
  await assert.rejects(
    timeout.sendAccountApiRequest('https://official.test', { path: '/api/auth/me', timeoutMs: 1 }),
    (e) => e instanceof ApiError && e.message === 'account_request_timeout'
  );
});

test('account response metadata is available without changing the parsed body or following redirects', async () => {
  const api = load<typeof import('../../src/core/api/accountRequest.ts')>('../../src/core/api/accountRequest.ts', {
    './apiError.ts': { ApiError },
    'expo/fetch': {
      fetch: async (_url: string, init: RequestInit) => {
        assert.equal(init.redirect, 'error');
        return new Response('{"ok":true}', { status: 202, headers: { 'x-auth-request-user': 'employee' } });
      }
    }
  });
  let subject = '';
  const value = await api.sendAccountApiRequest('https://sso.test', {
    path: '/oauth2/auth',
    onResponse: ({ status, headers }) => {
      assert.equal(status, 202);
      subject = headers.get('x-auth-request-user') || '';
    }
  });
  assert.equal(subject, 'employee');
  assert.equal(JSON.stringify(value), '{"ok":true}');
});
