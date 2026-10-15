import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveWebAppAccessTarget } from '../../src/features/webApps/webAppsMobileAccess.ts';

const DESKTOP_WS_URL = 'wss://device-id.m.zenmind.cc/ws';

test('paired mobile WebApp retains its clean route for a controlled Cookie session', () => {
  const target = resolveWebAppAccessTarget('https://device-id-51416.m.zenmind.cc/deep/path?tab=recent', DESKTOP_WS_URL);

  assert.deepEqual(target, {
    kind: 'paired-mobile',
    uri: 'https://device-id-51416.m.zenmind.cc/deep/path?tab=recent'
  });
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
  assert.deepEqual(resolveWebAppAccessTarget('https://device-id-51416.m.example.com/', DESKTOP_WS_URL), {
    kind: 'direct',
    uri: 'https://device-id-51416.m.example.com/'
  });
  assert.equal(resolveWebAppAccessTarget('https://device-id-not-a-port.m.zenmind.cc/', DESKTOP_WS_URL), null);
  assert.equal(resolveWebAppAccessTarget('https://device-id-65536.m.zenmind.cc/', DESKTOP_WS_URL), null);
});

test('URL credentials are refused instead of being forwarded to page JavaScript', () => {
  assert.equal(
    resolveWebAppAccessTarget('https://device-id-51416.m.zenmind.cc/path?token=secret', DESKTOP_WS_URL),
    null
  );
});

test('controlled mobile hosts derive their suffix from the selected Desktop, including custom Hub domains', () => {
  assert.deepEqual(
    resolveWebAppAccessTarget('https://desk-43210.mobile.example.test/app', 'wss://desk.mobile.example.test/ws'),
    { kind: 'paired-mobile', uri: 'https://desk-43210.mobile.example.test/app' }
  );
  assert.equal(
    resolveWebAppAccessTarget('https://other-43210.mobile.example.test/app', 'wss://desk.mobile.example.test/ws'),
    null
  );
});
