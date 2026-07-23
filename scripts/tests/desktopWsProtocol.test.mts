import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildMasterPasswordLoginRequest, buildPairingClaimRequest } from '../../src/core/auth/authRequestModel.ts';
import { legacyDeviceTokenForProfile, normalizeDeviceProfile } from '../../src/core/auth/deviceProfileModel.ts';
import {
  applyDesktopTokenToUrl,
  buildDesktopBusinessFrame,
  buildDesktopTokenTransport,
  deriveDesktopApiBaseUrlFromWsUrl,
  encodePairingPayloadV2,
  normalizeDesktopWsUrlInput,
  parsePairingPayload,
  type DesktopWsNamespace,
} from '../../src/core/auth/desktopWsProtocol.ts';

test('legacy v1 JSON pairing payload still parses as HTTP profile input', () => {
  const parsed = parsePairingPayload(
    JSON.stringify({
      desktopDeviceId: 'desktop-1',
      desktopUsername: 'Ada',
      apiBaseUrl: 'http://127.0.0.1:7080///',
      pairingId: 'pairing-1',
      secret: 'secret-1',
    })
  );

  assert.equal(parsed.transportKind, 'http');
  assert.equal(parsed.payload.desktopDeviceId, 'desktop-1');
  assert.equal(parsed.payload.apiBaseUrl, 'http://127.0.0.1:7080');
  assert.equal(parsed.payload.pairingId, 'pairing-1');
  assert.equal(parsed.payload.secret, 'secret-1');
});

test('zmpair v2 payload parses into Desktop WS transport input', () => {
  const payload = {
    v: 2,
    kind: 'desktop-ws',
    apiBaseUrl: 'https://stale-http.example.test',
    wsUrl: 'ws://127.0.0.1:7082/debug?token=old&source=qr#debug',
    tokenMode: 'query',
    token: 'desktop-token',
    expiresAtMs: Date.now() + 600_000,
    desktopDeviceId: 'desktop-device-1',
  } as const;

  const parsed = parsePairingPayload(encodePairingPayloadV2(payload));

  assert.equal(parsed.transportKind, 'desktop-ws');
  assert.equal(parsed.payload.kind, 'desktop-ws');
  assert.equal(parsed.payload.wsUrl, 'ws://127.0.0.1:7082/ws');
  assert.equal(parsed.payload.apiBaseUrl, 'http://127.0.0.1:7082');
  assert.equal(parsed.payload.tokenMode, 'query');
  assert.equal(parsed.payload.token, 'desktop-token');
  assert.equal(parsed.payload.desktopDeviceId, 'desktop-device-1');
});

test('invalid pairing payloads fail with user-safe errors', () => {
  const samples = [
    '',
    'zmpair:v2:not-json-secret-token',
    JSON.stringify({ v: 2, kind: 'desktop-ws', wsUrl: 'notaurl', token: 'secret-token' }),
    JSON.stringify({ desktopDeviceId: 'desktop-1', apiBaseUrl: 'http://127.0.0.1:7080', secret: 'secret-token' }),
  ];

  for (const sample of samples) {
    assert.throws(
      () => parsePairingPayload(sample),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /二维码/u);
        assert.equal(error.message.includes('secret-token'), false);
        return true;
      }
    );
  }
});

test('Desktop WS URL and token helpers are deterministic', () => {
  assert.equal(
    normalizeDesktopWsUrlInput('desktop.example.test'),
    'wss://desktop.example.test/ws'
  );
  assert.equal(
    normalizeDesktopWsUrlInput('ws://127.0.0.1:7082/ws?token=old&source=mobile#debug'),
    'ws://127.0.0.1:7082/ws'
  );
  assert.equal(
    deriveDesktopApiBaseUrlFromWsUrl('wss://desktop.example.test/ws?token=old'),
    'https://desktop.example.test'
  );
  assert.equal(
    applyDesktopTokenToUrl('ws://127.0.0.1:7082/ws?source=mobile&token=old', 'query', 'desktop-token'),
    'ws://127.0.0.1:7082/ws?token=desktop-token'
  );
  assert.deepEqual(
    buildDesktopTokenTransport('wss://desktop.example.test/ws?token=old', 'subprotocol', 'desktop-token'),
    {
      url: 'wss://desktop.example.test/ws',
      tokenMode: 'subprotocol',
      protocols: ['bearer.desktop-token'],
    }
  );
});

test('business frame builder supports d ap wa namespaces', () => {
  for (const ns of ['d', 'ap', 'wa'] satisfies DesktopWsNamespace[]) {
    assert.deepEqual(buildDesktopBusinessFrame(ns, ns === 'd' ? 'session.hello' : '/api/agents', undefined, 'req_1'), {
      ns,
      frame: 'request',
      type: ns === 'd' ? 'session.hello' : '/api/agents',
      id: 'req_1',
      payload: {},
    });
  }
});

test('Desktop WS profile rules never expose Desktop token as legacy device token', () => {
  const profile = normalizeDeviceProfile({
    transportKind: 'desktop-ws',
    desktopDeviceId: 'desktop-device-1',
    displayName: 'Office Desktop',
    apiBaseUrl: 'https://stale-http.example.test',
    deviceToken: 'leaked-legacy-token',
    serverDeviceId: 'server-device-1',
    cacheScopeId: 'cache-1',
    desktopWs: {
      wsUrl: 'ws://127.0.0.1:7082/custom?source=mobile&token=secret#debug',
      tokenMode: 'query',
      accessToken: 'desktop-token',
      accessExpireAtMs: Date.now() + 600_000,
    },
  });

  assert.ok(profile);
  assert.equal(profile.transportKind, 'desktop-ws');
  assert.equal(profile.apiBaseUrl, 'http://127.0.0.1:7082');
  assert.equal(profile.deviceToken, '');
  assert.equal(profile.desktopWs?.wsUrl, 'ws://127.0.0.1:7082/ws');
  assert.equal(legacyDeviceTokenForProfile(profile), '');
});

test('HTTP profile migration defaults missing transportKind to http', () => {
  const profile = normalizeDeviceProfile({
    desktopDeviceId: 'desktop-device-1',
    displayName: 'Office Desktop',
    apiBaseUrl: '127.0.0.1:7080///',
    deviceToken: 'http-device-token',
    serverDeviceId: 'server-device-1',
    cacheScopeId: 'legacy',
  });

  assert.ok(profile);
  assert.equal(profile.transportKind, 'http');
  assert.equal(profile.apiBaseUrl, 'http://127.0.0.1:7080');
  assert.equal(profile.deviceToken, 'http-device-token');
  assert.equal(legacyDeviceTokenForProfile(profile), 'http-device-token');
});

test('password and legacy pairing login request builders stay on HTTP auth endpoints', () => {
  const loginRequest = buildMasterPasswordLoginRequest(' master-password ', ' My Phone ', 'Fallback Device');
  assert.equal(loginRequest.path, '/api/auth/login');
  assert.equal(loginRequest.deviceName, 'My Phone');
  assert.deepEqual(loginRequest.body, {
    masterPassword: 'master-password',
    deviceName: 'My Phone',
  });

  assert.throws(() => buildMasterPasswordLoginRequest('   ', '', 'Fallback Device'), /请输入主密码/u);

  const pairingRequest = buildPairingClaimRequest(' pairing-1 ', ' secret-1 ', '', 'Fallback Device');
  assert.equal(pairingRequest.path, '/api/auth/pairing/claim');
  assert.deepEqual(pairingRequest.body, {
    pairingId: 'pairing-1',
    secret: 'secret-1',
    deviceName: 'Fallback Device',
  });
});
