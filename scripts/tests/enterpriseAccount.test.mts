import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { ApiError } from '../../src/core/api/apiError.ts';
import type * as Enterprise from '../../src/core/auth/enterpriseAccount.native.ts';

const compiled = ts.transpileModule(readFileSync('src/core/auth/enterpriseAccount.native.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const jwt = (exp = Math.floor(Date.now() / 1000) + 3600) =>
  `e30.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.signature`;
function fixture(os = 'ios') {
  const saved = new Map<string, string>();
  const calls: Array<{ base: string; path: string; options: Record<string, unknown>; token?: string }> = [];
  const deleted: Array<{ url: string; name: string; iosCookieStore: string }> = [];
  const cookieReads: Array<{ url: string; iosCookieStore: string }> = [];
  const response = { token: jwt(), id: '00042', expectedId: '00042', status: 202, name: 'Employee' };
  const dependencies: Record<string, unknown> = {
    '@preeternal/react-native-cookie-manager': {
      __esModule: true,
      default: {
        getCookieHeader: async (url: string, options: { iosCookieStore: string }) => {
          cookieReads.push({ url, ...options });
          return 'sso=private';
        },
        getAsArray: async () => [{ name: 'sso' }, { name: 'access_token' }],
        clearByName: async (url: string, name: string, options: { iosCookieStore: string }) => {
          deleted.push({ url, name, ...options });
        }
      }
    },
    'expo-secure-store': {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
      getItemAsync: async (key: string) => saved.get(key) ?? null,
      setItemAsync: async (key: string, token: string) => {
        saved.set(key, token);
      },
      deleteItemAsync: async (key: string) => {
        saved.delete(key);
      }
    },
    'react-native': { Platform: { OS: os } },
    '../api/apiError.ts': { ApiError },
    '../../shared/generated/brand': { BRAND_ID: 'cutej' },
    './authConfig.ts': { readEnterpriseApiBaseUrl: () => 'https://enterprise.test' },
    '../api/accountRequest.ts': {
      sendAccountApiRequest: async (base: string, options: Record<string, unknown>, token?: string) => {
        const path = options.path as string;
        calls.push({ base, path, options, token });
        if (path === '/oauth2/auth') {
          (options.onResponse as (r: unknown) => void)({
            status: response.status,
            headers: new Headers({ 'x-auth-request-user': response.expectedId })
          });
          return '';
        }
        if (path === '/authorization') return response.token;
        assert.equal(path, '/api/oauth2/userinfo');
        return { data: { staffno: response.id, name: response.name, staffemail: 'employee@example.test' } };
      }
    }
  };
  const exported: Partial<typeof Enterprise> = {};
  vm.runInNewContext(compiled, {
    exports: exported,
    require: (key: string) => {
      assert.ok(key in dependencies, key);
      return dependencies[key];
    },
    URL,
    Date,
    Error,
    atob,
    Set
  });
  return { api: exported as typeof Enterprise, saved, calls, deleted, cookieReads, response };
}

test('interactive enterprise login probes native cookies, exchanges a token and confirms the same stable user', async () => {
  const f = fixture();
  const session = await f.api.verifyEnterpriseLogin();
  assert.equal(session.accountId, 'enterprise:https://enterprise.test:00042');
  assert.equal(session.user.displayName, 'Employee');
  assert.equal(session.accessToken, f.response.token);
  assert.deepEqual(
    f.calls.map((c) => c.path),
    ['/oauth2/auth', '/authorization', '/api/oauth2/userinfo']
  );
  assert.ok(f.calls.every((c) => c.base === 'https://enterprise.test' && c.options.credentials === 'omit'));
  assert.equal(JSON.stringify(f.calls[0].options.headers), JSON.stringify({ Cookie: 'sso=private' }));
  assert.equal(f.calls[2].token, f.response.token);
  assert.ok(f.cookieReads.every((c) => c.iosCookieStore === 'webKit'));
  assert.equal(f.saved.size, 0, 'only accountAuth commits persistence after its generation checks');
  await f.api.saveEnterpriseSession(session);
  assert.equal(f.saved.size, 1);
  assert.match([...f.saved.keys()][0], /^enterprise\.cutej\.[0-9a-f]+$/);
});

test('restart restoration and renewal use bearer and do not read browser cookies', async () => {
  const f = fixture();
  assert.equal(await f.api.restoreEnterpriseSession(), null);
  const session = await f.api.verifyEnterpriseLogin();
  await f.api.saveEnterpriseSession(session);
  f.calls.length = f.cookieReads.length = 0;
  const restored = await f.api.restoreEnterpriseSession();
  assert.equal(restored?.accountId, session.accountId);
  assert.deepEqual(
    f.calls.map((c) => c.path),
    ['/authorization', '/api/oauth2/userinfo']
  );
  assert.equal(f.calls[0].token, session.accessToken);
  assert.equal(f.calls[0].options.headers, undefined);
  assert.equal(f.cookieReads.length, 0);
});

test('mismatched users, missing subjects, non-session statuses and expired tokens never become sessions', async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.response.id = 'other';
    },
    (f: ReturnType<typeof fixture>) => {
      f.response.id = '';
    },
    (f: ReturnType<typeof fixture>) => {
      f.response.name = '';
    },
    (f: ReturnType<typeof fixture>) => {
      f.response.status = 204;
    },
    (f: ReturnType<typeof fixture>) => {
      f.response.token = jwt(1);
    },
    (f: ReturnType<typeof fixture>) => {
      f.response.token = 'invalid';
    }
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(f.api.verifyEnterpriseLogin());
    assert.equal(f.saved.size, 0);
  }
});

for (const os of ['ios', 'android']) {
  test(`${os} logout deletes only cookies applicable to configured authentication paths`, async () => {
    const f = fixture(os);
    await f.api.saveEnterpriseSession(await f.api.verifyEnterpriseLogin());
    await f.api.clearEnterpriseSession();
    assert.equal(f.saved.size, 0);
    assert.ok(f.deleted.length > 0);
    assert.ok(f.deleted.every((c) => new URL(c.url).origin === 'https://enterprise.test'));
    assert.deepEqual(
      [...new Set(f.deleted.map((c) => c.iosCookieStore))],
      os === 'ios' ? ['webKit', 'foundation'] : ['webKit']
    );
  });
}
