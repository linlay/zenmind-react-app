import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(
  readFileSync(new URL('../../src/core/auth/activeDesktop.ts', import.meta.url), 'utf8'),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }
).outputText;
function fixture() {
  const values = new Map<string, string>();
  const exports = {} as {
    commitActiveDesktop(accountId: string, device: unknown): void;
    commitSelectedSource(value: null): void;
    readActiveDesktopId(accountId: string): string;
    updateAccountDesktopAvailability(accountId: string, devices: unknown[]): boolean;
    isActiveDesktopOffline(): boolean;
  };
  const deps: Record<string, unknown> = {
    './accountAuth.ts': { getAccountAuthSnapshot: () => ({ session: { accountId: 'a' } }) },
    'react-native-mmkv': {
      MMKV: class {
        getString(key: string) {
          return values.get(key);
        }
        delete(key: string) {
          values.delete(key);
        }
        contains(key: string) {
          return values.has(key);
        }
        set(key: string, value: string) {
          values.set(key, value);
        }
      }
    }
  };
  vm.runInNewContext(code, {
    exports,
    require: (id: string) => {
      assert.ok(id in deps, id);
      return deps[id];
    },
    Error
  });
  return exports;
}

test('rollback to a previously offline Desktop preserves its known availability', () => {
  const f = fixture();
  f.commitActiveDesktop('a', { deviceId: 'offline', online: false });
  f.commitActiveDesktop('a', { deviceId: 'online', online: true });
  f.commitActiveDesktop('a', { deviceId: 'offline' });
  assert.equal(f.isActiveDesktopOffline(), true);
});

test('authority invalidation reports the required feature switch without changing only selection', () => {
  const f = fixture();
  f.commitActiveDesktop('a', { deviceId: 'removed' });
  assert.equal(f.updateAccountDesktopAvailability('a', []), true);
  assert.equal(f.readActiveDesktopId('a'), 'removed');
  f.commitSelectedSource(null);
  assert.equal(f.readActiveDesktopId('a'), '');
});

test('source preferences remain isolated between accounts', () => {
  const f = fixture();
  f.commitActiveDesktop('a', { deviceId: 'a-desktop' });
  f.commitActiveDesktop('b', { deviceId: 'b-desktop' });
  assert.equal(f.readActiveDesktopId('a'), '');
  assert.equal(f.readActiveDesktopId('b'), 'b-desktop');
});
