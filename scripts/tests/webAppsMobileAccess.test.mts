import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addWebAppAccessToken,
  containsWebAppAccessToken,
  resolveWebAppAccessTarget
} from '../../src/features/webApps/webAppsMobileAccess.ts';

const DESKTOP_WS_URL = 'wss://device-id.m.zenmind.cc/ws';

test('paired mobile WebApp receives an encoded token without losing its route', () => {
  const target = resolveWebAppAccessTarget('https://device-id-51416.m.zenmind.cc/deep/path?tab=recent', DESKTOP_WS_URL);

  assert.deepEqual(target, {
    kind: 'paired-mobile',
    uri: 'https://device-id-51416.m.zenmind.cc/deep/path?tab=recent'
  });

  assert.equal(
    target?.kind === 'paired-mobile' ? addWebAppAccessToken(target, 'access token&scope=all') : null,
    'https://device-id-51416.m.zenmind.cc/deep/path?tab=recent&token=access+token%26scope%3Dall'
  );
});

test('public -wa and other HTTPS URLs keep anonymous direct loading', () => {
  assert.deepEqual(resolveWebAppAccessTarget('https://abcdefghijk23-wa.zenmind.cc/?view=public', DESKTOP_WS_URL), {
    kind: 'direct',
    uri: 'https://abcdefghijk23-wa.zenmind.cc/?view=public'
  });
  assert.deepEqual(resolveWebAppAccessTarget('https://example.com/app', DESKTOP_WS_URL), {
    kind: 'direct',
    uri: 'https://example.com/app'
  });
});

test('mobile hosts must match the active device, domain and port format', () => {
  assert.equal(resolveWebAppAccessTarget('https://other-device-51416.m.zenmind.cc/', DESKTOP_WS_URL), null);
  assert.equal(resolveWebAppAccessTarget('https://device-id-51416.m.example.com/', DESKTOP_WS_URL), null);
  assert.equal(resolveWebAppAccessTarget('https://device-id-not-a-port.m.zenmind.cc/', DESKTOP_WS_URL), null);
  assert.equal(resolveWebAppAccessTarget('https://device-id-65536.m.zenmind.cc/', DESKTOP_WS_URL), null);
});

test('temporary launch token URLs can be excluded from resident navigation', () => {
  assert.equal(containsWebAppAccessToken('https://device-id-51416.m.zenmind.cc/path?token=secret'), true);
  assert.equal(containsWebAppAccessToken('https://device-id-51416.m.zenmind.cc/path?view=clean'), false);
  assert.equal(containsWebAppAccessToken('https://abcdefghijk23-wa.zenmind.cc/path?token=public-value'), false);
});
