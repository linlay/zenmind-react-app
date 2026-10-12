import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { ApiError } from '../../src/core/api/apiError.ts';
import type * as ApiClient from '../../src/core/api/apiClient.ts';

const compiled = ts.transpileModule(readFileSync(new URL('../../src/core/api/apiClient.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

function fixture(token = 'existing-cloud-token') {
  let generation = 0;
  let signedIn = true;
  let desktopId = '';
  let selection = { kind: 'cloud' };
  const requests: { url: string; init: RequestInit }[] = [];
  let respond = async () => new Response(JSON.stringify({ ok: true }));
  const dependencies: Record<string, unknown> = {
    '../auth/activeDesktop': { getSelectedSource: () => selection },
    '../auth/cloudAuth': {
      getCloudAuthSnapshot: () => ({ generation, status: signedIn ? 'available' : 'login_required' }),
      reportCloudFailure() {}
    },
    './services/chatDirectoryApi': { classifyCloudFailure: () => 'login_required' },
    '../config/appEnvironment': { getDefaultSourceConfig: () => ({ apiBaseUrl: 'https://cloud.test' }) },
    '../debug/httpDebugLogger': { logHttpError() {}, logHttpRequest() {}, logHttpResponse() {} },
    './apiError.ts': { ApiError },
    './activeWsTransport': {
      resolveDefaultWsTransportConfig: () => (signedIn && !desktopId ? { accessToken: token } : null)
    }
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (id: string) => {
      assert.ok(id in dependencies, `Unexpected credential dependency: ${id}`);
      return dependencies[id];
    },
    fetch: (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return respond();
    },
    Date,
    Error,
    URL,
    URLSearchParams,
    Headers
  });
  return {
    api: exports as typeof ApiClient,
    requests,
    logout() {
      generation++;
      signedIn = false;
    },
    selectDesktop() {
      desktopId = 'desktop-a';
      selection = { kind: 'desktop' };
    },
    setResponse(next: typeof respond) {
      respond = next;
    }
  };
}

test('cloud HTTP and same-origin resources use the existing cloud credential', async () => {
  const f = fixture();
  await f.api.authenticatedApiRequest({ path: '/api/chats' });
  assert.equal(new Headers(f.requests[0].init.headers).get('Authorization'), 'Bearer existing-cloud-token');
  const resource = await f.api.buildAuthenticatedApiUriSource('/api/resource', { file: 'chat/image.png' });
  assert.equal(resource.headers?.Authorization, 'Bearer existing-cloud-token');
  const external = await f.api.buildAuthenticatedApiUriSource('https://other.test/image.png');
  assert.equal(external.headers, undefined);
});

test('cloud authMode none leaves HTTP authorization unchanged', async () => {
  const f = fixture('');
  await f.api.authenticatedApiRequest({ path: '/api/chats' });
  assert.equal(new Headers(f.requests[0].init.headers).get('Authorization'), null);
  assert.equal((await f.api.buildAuthenticatedApiUriSource('/api/resource')).headers, undefined);
});

test('cloud rejection does not retry with a phone Identity token', async () => {
  const f = fixture();
  f.setResponse(async () => new Response(JSON.stringify({ message: 'expired' }), { status: 401 }));
  await assert.rejects(
    f.api.authenticatedApiRequest({ path: '/api/chats' }),
    (error: unknown) => error instanceof ApiError && error.status === 401
  );
  assert.equal(f.requests.length, 1);
});

test('cloud-signed-out or computer-selected state cannot send cloud HTTP requests', async () => {
  for (const change of ['logout', 'selectDesktop'] as const) {
    const f = fixture();
    f[change]();
    await assert.rejects(f.api.authenticatedApiRequest({ path: '/api/chats' }), /Not authenticated/);
    assert.equal(f.requests.length, 0);
  }
});

test('a cloud HTTP response arriving after cloud logout or source switch is discarded', async () => {
  for (const change of ['logout', 'selectDesktop'] as const) {
    const f = fixture();
    f.setResponse(async () => {
      f[change]();
      return new Response('{}');
    });
    await assert.rejects(f.api.authenticatedApiRequest({ path: '/api/chats' }), /superseded/);
  }
});
