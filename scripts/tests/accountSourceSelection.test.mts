import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(
  readFileSync(new URL('../../src/features/chatPersistence/accountDesktopSource.ts', import.meta.url), 'utf8'),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }
).outputText;
function fixture() {
  let selected = 'old';
  let selection: { kind: string; accountId?: string; desktopId?: string } | null = {
    kind: 'desktop',
    accountId: 'account',
    desktopId: 'old'
  };
  let scope = 'account:old';
  let generation = 1;
  let ensure = async () => {};
  const start = async () => {};
  let issued = 0;
  let started = 0;
  const observations: { selected: string; scope: string }[] = [];
  const observe = () => observations.push({ selected, scope });
  const deps: Record<string, unknown> = {
    'expo-file-system': {},
    'expo-sqlite': {},
    'react-native-mmkv': {},
    './homeSnapshot.ts': {},
    './chatComposerPreferences.ts': { clearChatComposerPreferences() {} },
    './cacheScope': { getChatCacheScopeId: () => scope },
    './cacheScope.ts': { notifyChatCacheScopeChanged: observe, getChatCacheScopeId: () => scope },
    './chatSourceRuntime': {},
    './cloudAccess.ts': {},
    '../../core/auth/cloudAuth.ts': { getCloudAuthSnapshot: () => ({ status: 'available', scopeId: 'cs_cloud' }) },
    '../../core/api/services/deviceLinkApi.ts': {
      getDesktopPlatformCredential: async (targetDesktopId: string) => {
        issued++;
        return {
          credential: 'header.payload.signature',
          platformDeviceId: targetDesktopId,
          expiresAt: new Date(Date.now() + 3600_000).toISOString()
        };
      }
    },
    '../../core/auth/accountAuth.ts': {
      getAccountAuthGeneration: () => generation,
      getAccountAuthSnapshot: () => ({ session: { accountId: 'account', deviceId: 'phone' } })
    },
    '../../core/auth/activeDesktop.ts': {
      getSelectedSource: () => selection,
      commitSelectedSource: (value: typeof selection) => {
        selection = value;
        selected = value?.desktopId || '';
        observe();
      },
      commitActiveDesktop: (_: string, d: { deviceId: string }) => {
        selected = d.deviceId;
        selection = { kind: 'desktop', accountId: 'account', desktopId: d.deviceId };
        observe();
      }
    },
    '../../core/auth/accountDesktopCacheScopes.ts': {
      resolveAndPersistAccountDesktopCacheScope: (_: string, id: string) => ({
        entry: { cacheScopeId: `account:${id || 'cloud'}` }
      })
    },
    '../../core/api/activeWsTransport.ts': { clearDesktopPlatformCredentialCache() {} },
    '../../core/api/requestId.ts': { createRequestId: () => 'request' },
    '../chatRealtime/chatSyncService.ts': {
      chatSyncService: {
        stop() {},
        start: async () => {
          started++;
          await start();
        }
      }
    },
    './database.ts': {
      switchChatDatabaseScope: (id: string, notify = true) => {
        scope = id;
        if (notify) observe();
      },
      ensureChatDatabase: () => ensure()
    }
  };
  const exports = {} as {
    activateAccountDesktopSource(a: string, d: unknown): Promise<void>;
    deactivateAccountDesktopSource(a: string): void;
  };
  vm.runInNewContext(code, {
    exports,
    require: (id: string) => {
      assert.ok(id in deps, id);
      return deps[id];
    },
    Error
  });
  return {
    activate: exports.activateAccountDesktopSource,
    deactivate: exports.deactivateAccountDesktopSource,
    observations,
    state: () => ({ selected, scope, issued, started }),

    setEnsure: (f: typeof ensure) => {
      ensure = f;
    },
    invalidate: () => {
      generation++;
      scope = 'signed_out';
    }
  };
}

test('offline selection opens only its cache and never requests a remote credential', async () => {
  const f = fixture();
  await f.activate('account', { deviceId: 'offline', online: false });
  assert.deepEqual(f.state(), { selected: 'offline', scope: 'account:offline', issued: 0, started: 1 });
});
test('explicit cloud selection switches SQLite and selection together', async () => {
  const f = fixture();
  await f.activate('account', null);
  assert.deepEqual(f.state(), { selected: '', scope: 'cs_cloud', issued: 0, started: 1 });
});
test('failed cache opening rolls selection and scope back; stale account cannot overwrite logout scope', async () => {
  const f = fixture();
  f.setEnsure(async () => {
    throw new Error('disk');
  });
  await assert.rejects(f.activate('account', null), /disk/);
  assert.equal(f.state().selected, 'old');
  assert.equal(f.state().scope, 'account:old');
  let finish!: () => void;
  f.setEnsure(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const request = f.activate('account', { deviceId: 'offline', online: false });
  f.invalidate();
  finish();
  await assert.rejects(request, /superseded/);
  assert.equal(f.state().scope, 'signed_out');
});

test('observers never see a new cache paired with the old source while initialization waits', async () => {
  const f = fixture();
  let finish!: () => void;
  f.setEnsure(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const request = f.activate('account', null);
  assert.equal(f.state().scope, 'cs_cloud');
  assert.equal(f.state().selected, '');
  assert.deepEqual(f.observations, [
    { selected: '', scope: 'cs_cloud' },
    { selected: '', scope: 'cs_cloud' }
  ]);
  finish();
  await request;
});

test('a revoked Desktop deactivates to no source without starting cloud', () => {
  const f = fixture();
  f.deactivate('account');
  assert.equal(f.state().selected, '');
  assert.equal(f.state().scope, 'signed_out');
  assert.equal(f.state().started, 0);
  assert.ok(f.observations.every((item) => item.selected === '' && item.scope === 'signed_out'));
});
