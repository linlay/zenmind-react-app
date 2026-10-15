import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as contract from '../../src/core/api/contracts/deviceLink.ts';
const compiled = ts.transpileModule(
  readFileSync(new URL('../../src/core/api/services/deviceLinkApi.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
).outputText;
function fixture() {
  const calls: Array<{ base: string; path: string; method?: string; body?: unknown }> = [];
  let payload: unknown = { schemaVersion: 1, items: [{ deviceId: 'desktop', deviceName: '电脑', online: false }] };
  let error: Error | null = null;
  const request = async (base: string, options: { path: string; method?: string; body?: unknown }) => {
    calls.push({ base, ...options });
    if (error) throw error;
    return payload;
  };
  const dependencies: Record<string, unknown> = {
    '../../auth/authConfig.ts': {
      readTunnelHubApiBaseUrl: () => 'https://hub.test'
    },
    '../accountApiClient.ts': { authenticatedAccountApiRequest: request },
    '../contracts/deviceLink.ts': contract
  };
  const exported = {};
  vm.runInNewContext(compiled, {
    exports: exported,
    require: (key: string) => {
      assert.ok(key in dependencies, key);
      return dependencies[key];
    },
    URL,
    Error
  });
  const api = exported as {
    listAccountDevices(): Promise<contract.AccountDeviceListV1>;
    renameAccountDevice(id: string, name: string): Promise<void>;
    revokeAccountDevice(id: string): Promise<void>;
    getDesktopPlatformCredential(id: string): Promise<unknown>;
  };
  return {
    api,
    calls,
    setPayload: (value: unknown) => {
      payload = value;
    },
    fail: (value: Error) => {
      error = value;
    }
  };
}
test('Desktop directory and management use Hub only', async () => {
  const f = fixture();
  assert.equal((await f.api.listAccountDevices()).items[0].online, false);
  await f.api.renameAccountDevice('desktop', 'name');
  await f.api.revokeAccountDevice('desktop');
  assert.deepEqual(
    f.calls.map((call) => [call.base, call.path, call.method || 'GET']),
    [
      ['https://hub.test', '/api/desktop/account-devices', 'GET'],
      ['https://hub.test', '/api/desktop/account-devices/desktop', 'PATCH'],
      ['https://hub.test', '/api/desktop/account-devices/desktop', 'DELETE']
    ]
  );
});
test('Hub failure rejects directory refresh instead of synthesizing offline or empty devices', async () => {
  const f = fixture();
  f.fail(new Error('Hub unavailable'));
  await assert.rejects(f.api.listAccountDevices(), /Hub unavailable/);
  assert.equal(f.calls.length, 1);
});
test('Platform credential response requires a device and a live expiry', async () => {
  const f = fixture();
  f.setPayload({
    schemaVersion: 1,
    credential: 'header.payload.signature',
    webSocketUrl: 'wss://desktop.test/ws',
    tokenMode: 'subprotocol'
  });
  await assert.rejects(f.api.getDesktopPlatformCredential('desktop'), /expiresAt is required/);
});

test('Platform credential request needs only the target Desktop, without request IDs or a phone session', async () => {
  const f = fixture();
  f.setPayload({
    schemaVersion: 1,
    credential: 'header.payload.signature',
    platformDeviceId: 'local-device',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    webSocketUrl: 'wss://desktop.test/ws',
    tokenMode: 'subprotocol'
  });
  const result = await f.api.getDesktopPlatformCredential('desktop');
  assert.ok(result);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].body)), { targetDesktopId: 'desktop' });
});
