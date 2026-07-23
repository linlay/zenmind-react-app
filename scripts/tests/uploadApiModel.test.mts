import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ApiError } from '../../src/core/api/apiError.ts';
import {
  CHAT_UPLOAD_API_PATH,
  ChatUploadError,
  createChatUploadFormData,
  parseDesktopPublicUploadResponse,
  requestDesktopPublicUpload,
  resolveChatUploadRoute,
  unwrapChatUploadResponse
} from '../../src/core/api/services/uploadApiModel.ts';
import type { DeviceProfile } from '../../src/core/auth/deviceProfiles.ts';

function createHttpProfile(): DeviceProfile {
  return {
    transportKind: 'http',
    desktopDeviceId: 'desktop-http',
    displayName: 'HTTP Desktop',
    apiBaseUrl: 'https://api.example.test',
    deviceToken: 'device-token',
    serverDeviceId: 'server-http',
    cacheScopeId: 'cache-http',
    lastUsedAt: 1,
    needsRelink: false,
    identityCreatedAt: '',
    hostname: '',
    appServerPublicKeySha256: ''
  };
}

function createDesktopWsProfile(wsUrl = 'wss://zmupload.m.zenmind.cc/ws'): DeviceProfile {
  return {
    transportKind: 'desktop-ws',
    desktopDeviceId: 'desktop-tunnel',
    displayName: 'Desktop WS',
    apiBaseUrl: wsUrl.replace(/^wss:/u, 'https:').replace(/\/ws$/u, ''),
    deviceToken: '',
    serverDeviceId: 'server-tunnel',
    cacheScopeId: 'cache-tunnel',
    lastUsedAt: 1,
    needsRelink: false,
    identityCreatedAt: '',
    hostname: '',
    appServerPublicKeySha256: '',
    desktopWs: {
      wsUrl,
      tokenMode: 'query',
      accessToken: 'desktop-access-token',
      accessExpireAtMs: Date.now() + 600_000
    }
  };
}

test('upload route keeps HTTP profiles direct and uses the Desktop public host for Desktop WS', () => {
  assert.deepEqual(resolveChatUploadRoute(createHttpProfile()), {
    kind: 'direct-http',
    path: CHAT_UPLOAD_API_PATH
  });
  assert.deepEqual(resolveChatUploadRoute(createDesktopWsProfile('wss://zmupload.m.zenmind.cc/ws?token=omitted')), {
    kind: 'desktop-public',
    endpointUrl: 'https://zmupload.m.zenmind.cc/api/upload'
  });
});

test('Desktop public upload route rejects insecure or malformed WS profiles', () => {
  for (const wsUrl of ['ws://127.0.0.1:7082/ws', 'not-a-url']) {
    assert.throws(
      () => resolveChatUploadRoute(createDesktopWsProfile(wsUrl)),
      (error) => error instanceof ChatUploadError && error.code === 'invalid_tunnel_profile'
    );
  }
});

test('upload FormData matches the /api/upload multipart contract', () => {
  const file = new Blob(['hello'], { type: 'text/plain' });
  const formData = createChatUploadFormData({ chatId: 'chat-1', requestId: 'request-1' }, file);

  assert.deepEqual(Array.from(formData.keys()), ['requestId', 'chatId', 'file']);
  assert.equal(formData.get('requestId'), 'request-1');
  assert.equal(formData.get('chatId'), 'chat-1');
  assert.equal(formData.has('file'), true);
  assert.equal(formData.has('publicHost'), false);
  assert.equal(formData.has('sha256'), false);
});

test('Desktop public upload refreshes once after 401 and rebuilds FormData', async () => {
  const forceRefreshValues: boolean[] = [];
  const authorizationValues: string[] = [];
  const bodies: FormData[] = [];
  let fetchCount = 0;
  const result = await requestDesktopPublicUpload({
    endpointUrl: 'https://zmupload.m.zenmind.cc/api/upload',
    getAccessToken: async (forceRefresh) => {
      forceRefreshValues.push(forceRefresh);
      return forceRefresh ? 'token-refreshed' : 'token-initial';
    },
    createBody: () =>
      createChatUploadFormData(
        {
          chatId: 'chat-1',
          requestId: 'request-1'
        },
        new Blob(['hello'])
      ),
    fetchImpl: (async (_url, init) => {
      fetchCount += 1;
      authorizationValues.push(new Headers(init?.headers).get('authorization') || '');
      bodies.push(init?.body as FormData);
      if (fetchCount === 1) {
        return new Response(JSON.stringify({ error: 'expired' }), {
          status: 401,
          headers: { 'content-type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ data: { upload: { name: 'note.md' } } }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }) as typeof fetch
  });

  assert.deepEqual(forceRefreshValues, [false, true]);
  assert.deepEqual(authorizationValues, ['Bearer token-initial', 'Bearer token-refreshed']);
  assert.equal(bodies.length, 2);
  assert.notEqual(bodies[0], bodies[1]);
  assert.deepEqual(
    bodies.map((body) => Array.from(body.keys())),
    [
      ['requestId', 'chatId', 'file'],
      ['requestId', 'chatId', 'file']
    ]
  );
  assert.equal(result.upload?.name, 'note.md');
});

test('Desktop public upload does not retry non-401 HTTP failures', async () => {
  for (const status of [400, 403, 413, 500]) {
    let fetchCount = 0;
    await assert.rejects(
      requestDesktopPublicUpload({
        endpointUrl: 'https://zmupload.m.zenmind.cc/api/upload',
        getAccessToken: async () => 'desktop-token',
        createBody: () => new FormData(),
        fetchImpl: (async () => {
          fetchCount += 1;
          return new Response(JSON.stringify({ error: `status-${status}` }), {
            status,
            headers: { 'content-type': 'application/json' }
          });
        }) as typeof fetch
      }),
      (error) => error instanceof ApiError && error.status === status
    );
    assert.equal(fetchCount, 1);
  }
});

test('Desktop public upload does not start or retry after abort', async () => {
  const controller = new AbortController();
  controller.abort(new Error('cancelled'));
  let fetchCount = 0;
  await assert.rejects(
    requestDesktopPublicUpload({
      endpointUrl: 'https://zmupload.m.zenmind.cc/api/upload',
      getAccessToken: async () => 'desktop-token',
      createBody: () => new FormData(),
      fetchImpl: (async () => {
        fetchCount += 1;
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      }) as typeof fetch,
      signal: controller.signal
    }),
    /cancelled/u
  );
  assert.equal(fetchCount, 0);
});

test('upload response validation rejects HTML, invalid JSON and non-zero envelopes', () => {
  assert.throws(
    () =>
      parseDesktopPublicUploadResponse({
        contentType: 'text/html',
        ok: true,
        status: 200,
        text: '<!doctype html>'
      }),
    (error) => error instanceof ChatUploadError && error.code === 'unexpected_response'
  );
  assert.throws(
    () =>
      parseDesktopPublicUploadResponse({
        contentType: 'application/json',
        ok: true,
        status: 200,
        text: 'not-json'
      }),
    (error) => error instanceof ChatUploadError && error.code === 'unexpected_response'
  );
  assert.throws(
    () => unwrapChatUploadResponse({ code: 4001, msg: 'upload rejected' }),
    (error) => error instanceof ApiError && error.message === 'upload rejected'
  );
  assert.deepEqual(unwrapChatUploadResponse({ upload: { name: 'direct.md' } }), {
    upload: { name: 'direct.md' }
  });
  assert.deepEqual(unwrapChatUploadResponse({ code: 0, data: { upload: { name: 'wrapped.md' } } }), {
    upload: { name: 'wrapped.md' }
  });
});
