import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function load<T>(file: string, dependencies: Record<string, unknown>): T {
  const exported = {};
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
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
      AbortSignal,
      TextDecoder,
      Uint8Array,
      setTimeout,
      clearTimeout
    }
  );
  return exported as T;
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('native WebApp bootstrap keeps tokens in a controlled request and logs out only the last resident', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const api = load<typeof import('../../src/features/webApps/mobileWebAppSession.native.ts')>(
    '../../src/features/webApps/mobileWebAppSession.native.ts',
    {
      'expo/fetch': {
        fetch: async (url: string, init: RequestInit) => {
          calls.push({ url, init });
          return Response.json({ expiresAt: new Date(Date.now() + 60_000).toISOString() });
        }
      }
    }
  );
  const url = 'https://desk-43210.mobile.test/deep/path';
  const closeA = api.retainMobileWebAppSession(url);
  const closeB = api.retainMobileWebAppSession(url);
  const headers = {
    Authorization: 'Bearer local-platform-token',
    'X-Account-Authorization': 'Bearer official-user-proof'
  };
  await api.openMobileWebAppSession(url, headers);
  assert.equal(calls[0].url, 'https://desk-43210.mobile.test/api/mobile-session');
  assert.equal(calls[0].init.headers, headers);
  assert.equal(calls[0].init.credentials, 'include');
  assert.equal(calls[0].init.redirect, 'error');
  closeA();
  await flush();
  assert.equal(calls.length, 1);
  closeB();
  await flush();
  assert.equal(calls[1].url, 'https://desk-43210.mobile.test/api/mobile-session/logout');
  assert.equal(calls[1].init.headers, undefined);
  assert.equal(calls[1].init.body, undefined);
  const closeDirect = api.retainMobileWebAppSession('https://public.test/app');
  closeDirect();
  await flush();
  assert.equal(calls.length, 2, 'external WebApps must not receive gateway API calls');
});

test('a late WebApp Cookie receipt after resident close is revoked before completing', async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const calls: string[] = [];
  const api = load<typeof import('../../src/features/webApps/mobileWebAppSession.native.ts')>(
    '../../src/features/webApps/mobileWebAppSession.native.ts',
    {
      'expo/fetch': {
        fetch: async (url: string) => {
          calls.push(url);
          if (!url.endsWith('/logout')) await pending;
          return Response.json({ expiresAt: new Date(Date.now() + 60_000).toISOString() });
        }
      }
    }
  );
  const close = api.retainMobileWebAppSession('https://desk-1.mobile.test/app');
  const open = api.openMobileWebAppSession('https://desk-1.mobile.test/app', {});
  await flush();
  close();
  release();
  await assert.rejects(open, /resident closed/);
  await flush();
  assert.equal(calls.length, 2);
  assert.ok(calls[1].endsWith('/logout'));
});

function fileHarness(
  statuses: number[] = [200],
  options: { existing?: boolean; maxChunk?: number; switchDuringRead?: boolean } = {}
) {
  let selection: { kind: string } = { kind: 'desktop' };
  let cleared = 0;
  let deleted = 0;
  let created = 0;
  const written: number[] = [];
  const calls: RequestInit[] = [];
  const destination = {
    exists: options.existing === true,
    create() {
      if (this.exists) throw new Error('File exists');
      this.exists = true;
      created++;
    },
    open() {
      return {
        writeBytes(bytes: Uint8Array) {
          written.push(...bytes);
        },
        close() {}
      };
    },
    delete() {
      this.exists = false;
      deleted++;
    }
  };
  const api = load<typeof import('../../src/core/api/services/authenticatedResourceFile.native.ts')>(
    '../../src/core/api/services/authenticatedResourceFile.native.ts',
    {
      'expo/fetch': {
        fetch: async (_url: string, init: RequestInit) => {
          calls.push(init);
          const status = statuses[Math.min(calls.length - 1, statuses.length - 1)];
          if (status !== 200) return new Response('', { status });
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array(options.maxChunk ?? 4).fill(7));
                if (options.switchDuringRead) selection = { kind: 'cloud' };
                controller.close();
              }
            })
          );
        }
      },
      'expo-file-system': { FileMode: { WriteOnly: 'write' } },
      '../apiClient': {
        buildAuthenticatedApiUriSource: async () => ({
          uri: 'https://desk.mobile.test/api/resource?file=note',
          headers: { Authorization: `Bearer platform-${cleared}`, 'X-Account-Authorization': 'Bearer official' }
        })
      },
      '../activeWsTransport': {
        clearDesktopPlatformCredentialCache: () => {
          cleared++;
        }
      },
      '../../auth/accountAuth': { getAccountAuthGeneration: () => 1 },
      '../../auth/activeDesktop': { getSelectedSource: () => selection },
      '../../auth/cloudAuth': { getCloudAuthSnapshot: () => ({ generation: 1 }) }
    }
  );
  const download = (maxBytes?: number) =>
    api.downloadAuthenticatedResourceFile(
      '/api/resource?file=note',
      destination as unknown as Parameters<typeof api.downloadAuthenticatedResourceFile>[1],
      { maxBytes }
    );
  return { download, calls, written, counts: () => ({ cleared, deleted, created }) };
}

test('native file streaming retries 401 once with fresh proof and refuses redirects', async () => {
  const f = fileHarness([401, 200]);
  await f.download();
  assert.equal(f.calls.length, 2);
  assert.equal(f.counts().cleared, 1);
  assert.deepEqual(f.written, [7, 7, 7, 7]);
  assert.equal((f.calls[1].headers as Record<string, string>).Authorization, 'Bearer platform-1');
  assert.equal((f.calls[1].headers as Record<string, string>)['X-Account-Authorization'], 'Bearer official');
  for (const init of f.calls) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.credentials, 'omit');
  }
  const denied = fileHarness([403]);
  await assert.rejects(denied.download(), /403/);
  assert.equal(denied.calls.length, 1);
  assert.equal(denied.counts().created, 0);
});

test('native stream limits and selection changes discard only files created by that download', async () => {
  const tooLarge = fileHarness([200], { maxChunk: 8 });
  await assert.rejects(tooLarge.download(4), /too large/);
  assert.equal(tooLarge.counts().deleted, 1);
  const existing = fileHarness([200], { existing: true });
  await assert.rejects(existing.download(), /File exists/);
  assert.equal(existing.counts().deleted, 0);
  const superseded = fileHarness([200], { switchDuringRead: true });
  await assert.rejects(superseded.download(), /superseded/);
  assert.equal(superseded.written.length, 0);
});

test('text previews bound streamed bytes and retry only Desktop 401', async () => {
  let cleared = 0;
  let requests = 0;
  const sentHeaders: Array<HeadersInit | undefined> = [];
  const api = load<typeof import('../../src/core/api/services/authenticatedResource.ts')>(
    '../../src/core/api/services/authenticatedResource.ts',
    {
      'expo/fetch': {
        fetch: async (_url: string, init: RequestInit) => {
          sentHeaders.push(init.headers);
          return ++requests === 1 ? new Response('', { status: 401 }) : new Response('你好');
        }
      },
      '../activeWsTransport': {
        clearDesktopPlatformCredentialCache: () => {
          cleared++;
        }
      },
      '../../auth/accountAuth': { getAccountAuthGeneration: () => 1 },
      '../../auth/activeDesktop': { getSelectedSource: () => selection },
      '../../auth/cloudAuth': { getCloudAuthSnapshot: () => ({ generation: 1 }) },
      '../apiClient.ts': {
        buildAuthenticatedApiUriSource: async () => ({
          uri: 'https://desk.test/api/resource',
          headers: { Authorization: 'Bearer current-proof' }
        })
      },
      './authenticatedResourceModel.ts': { isAuthenticatedResourceContentTypeCompatible: () => true }
    }
  );
  const selection = { kind: 'desktop' };
  assert.equal(await api.fetchAuthenticatedResourceText('/api/resource', { maxBytes: 6 }), '你好');
  assert.equal(cleared, 1);
  assert.equal(requests, 2);
  assert.equal(
    await api.fetchAuthenticatedResourceText({
      uri: 'https://desk.test/api/resource',
      headers: { Authorization: 'Bearer stale-proof' }
    }),
    '你好'
  );
  assert.equal((sentHeaders.at(-1) as Record<string, string>).Authorization, 'Bearer current-proof');
  await assert.rejects(api.fetchAuthenticatedResourceText('/api/resource', { maxBytes: 5 }), /too large/);
});
