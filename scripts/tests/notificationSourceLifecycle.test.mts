import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(
  readFileSync(new URL('../../src/features/notifications/notificationService.ts', import.meta.url), 'utf8'),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }
).outputText;
function fixture() {
  let source = 'cloud:one';
  let permission = async () => ({ granted: true });
  let register = async () => {};
  let calls = 0;
  const values = new Map<string, string>();
  const dependencies: Record<string, unknown> = {
    '../chatPersistence/chatSourceRuntime': { getActiveChatSource: () => ({ key: source }) },
    'react-native': { Platform: { OS: 'android' } },
    'react-native-mmkv': {
      MMKV: class {
        getString(key: string) {
          return values.get(key);
        }
        set(key: string, value: string) {
          values.set(key, value);
        }
        delete(key: string) {
          values.delete(key);
        }
      }
    },
    'expo-notifications': {
      setNotificationHandler() {},
      setNotificationChannelAsync: async () => {},
      AndroidImportance: { HIGH: 1 },
      IosAuthorizationStatus: { PROVISIONAL: 1 },
      getPermissionsAsync: () => permission(),
      getDevicePushTokenAsync: async () => ({ data: 'native-token' })
    },
    '../../core/api/services/notificationApi': {
      registerPushTokenApi: () => {
        calls++;
        return register();
      },
      unregisterPushTokenApi: async () => {}
    }
  };
  const exports = {} as {
    notificationService: { registerForSession(input: object): Promise<void>; clearRegistration(): Promise<void> };
  };
  vm.runInNewContext(code, {
    exports,
    require: (id: string) => {
      assert.ok(id in dependencies, id);
      return dependencies[id];
    },
    Error,
    Date,
    __DEV__: false
  });
  return {
    service: exports.notificationService,
    values,
    calls: () => calls,
    source: (key: string) => {
      source = key;
    },
    permission: (next: typeof permission) => {
      permission = next;
    },
    register: (next: typeof register) => {
      register = next;
    }
  };
}
const input = { sourceKey: 'cloud:one', username: 'cloud', deviceId: 'cs_one' };
const tick = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

test('source switch during native permission does not register an old identity using the new cloud credential', async () => {
  const f = fixture();
  let finish!: () => void;
  f.permission(
    () =>
      new Promise((resolve) => {
        finish = () => resolve({ granted: true });
      })
  );
  const request = f.service.registerForSession(input);
  await tick();
  f.source('desktop:pc');
  finish();
  await assert.rejects(request, /superseded/);
  assert.equal(f.calls(), 0);
  assert.equal(f.values.size, 0);
});

test('late RPC after clear cannot persist registration or suppress the next valid retry', async () => {
  const f = fixture();
  let finish!: () => void;
  f.register(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const request = f.service.registerForSession(input);
  await tick();
  await f.service.clearRegistration();
  finish();
  await assert.rejects(request, /superseded/);
  assert.equal(f.values.size, 0);
  f.register(async () => {});
  await f.service.registerForSession(input);
  assert.equal(f.calls(), 2);
  assert.equal(f.values.size, 1);
});
