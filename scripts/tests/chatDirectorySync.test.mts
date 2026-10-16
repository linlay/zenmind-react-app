import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

import { createChatSource } from '../../src/features/chatPersistence/chatSource.ts';
import { projectRemoteHomeDirectory } from '../../src/features/chatPersistence/chatDirectoryProjector.ts';
import { scopeRemoteHomePayload } from '../../src/features/chatRealtime/chatSourcePayload.ts';
import type { ChatDirectorySyncSnapshot, ChatSyncEvent } from '../../src/features/chatRealtime/types.ts';

const source = ts.createSourceFile(
  'chatSyncService.ts',
  readFileSync('src/features/chatRealtime/chatSyncService.ts', 'utf8'),
  ts.ScriptTarget.Latest,
  true
);
const declaration = source.statements.find(
  (node) => ts.isClassDeclaration(node) && node.name?.text === 'ChatSyncService'
)!;
const compiled = ts.transpileModule(`${declaration.getText(source)}; ChatSyncService`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 }
}).outputText;
const directory = { agents: [{ key: 'assistant', name: 'Assistant' }], chats: [] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

function fixture(controllerClass = AbortController) {
  const paired = createChatSource('paired', 'desktop', 'Desktop');
  let active = paired;
  let resolveConfig = async (): Promise<object | null> => ({});
  let read = async (_signal: AbortSignal) => directory;
  let persist = async () => {};
  let connect = async () => {};
  let reads = 0;
  let writes = 0;
  let released = 0;
  const timers = new Map<object, () => void>();
  const signals: AbortSignal[] = [];
  const events: ChatSyncEvent[] = [];
  const Service = vm.runInNewContext(compiled, {
    AbortController: controllerClass,
    Error,
    ApiError: Error,
    WsClientRequestTimeoutError: Error,
    CHAT_DIRECTORY_READ_TIMEOUT_MS: 15_000,
    getChatCacheScopeId: () => 'desktop_scope',
    getActiveChatSource: () => active,
    setTimeout: (callback: () => void, delay: number) => {
      assert.equal(delay, 15_000);
      const handle = {};
      timers.set(handle, callback);
      return handle;
    },
    clearTimeout: (handle: object) => timers.delete(handle),
    readChatDirectory: (_config: object, signal: AbortSignal) => {
      reads++;
      signals.push(signal);
      return read(signal);
    },
    scopeRemoteHomePayload,
    projectRemoteHomeDirectory,
    replaceChatHomeProjection: async () => {
      await persist();
      writes++;
    },
    startChatPushTransport: () => connect(),
    stopChatPushTransport: () => {
      released++;
    }
  });
  const service = new Service(paired, () => resolveConfig()) as {
    start(): Promise<void>;
    stop(): void;
    refreshHome(): Promise<void>;
    getDirectorySyncSnapshot(): ChatDirectorySyncSnapshot;
    subscribe(listener: (event: ChatSyncEvent) => void): () => void;
  };
  service.subscribe((event) => events.push(event));
  return {
    service,
    timers,
    signals,
    events,
    setResolve: (fn: typeof resolveConfig) => {
      resolveConfig = fn;
    },
    setRead: (fn: typeof read) => {
      read = fn;
    },
    setPersist: (fn: typeof persist) => {
      persist = fn;
    },
    setConnect: (fn: typeof connect) => {
      connect = fn;
    },
    switchSource: () => {
      active = createChatSource('paired', 'other', 'Other');
      service.stop();
    },
    counts: () => ({ reads, writes, released }),
    expire: () => {
      for (const callback of [...timers.values()]) callback();
    }
  };
}

test('directory remains loading through persistence, shares one read and notifies replacement before ready', async () => {
  const f = fixture();
  const remote = deferred<typeof directory>();
  const store = deferred<void>();
  f.setRead(() => remote.promise);
  f.setPersist(() => store.promise);
  const first = f.service.refreshHome();
  const second = f.service.refreshHome();
  assert.equal(f.service.getDirectorySyncSnapshot().status, 'loading');
  await flush();
  assert.equal(f.counts().reads, 1);
  remote.resolve(directory);
  await flush();
  assert.equal(f.service.getDirectorySyncSnapshot().status, 'loading');
  assert.equal(f.timers.size, 0);
  store.resolve();
  await Promise.all([first, second]);
  assert.equal(f.service.getDirectorySyncSnapshot().status, 'ready');
  assert.equal(f.counts().writes, 1);
  assert.deepEqual(
    f.events.slice(-2).map((event) => event.type),
    ['home.directory.replace', 'home.directory.sync']
  );
  assert.equal(f.signals[0].aborted, true);
});

test('credential preparation is bounded and a late result cannot overwrite a retry', async () => {
  const f = fixture();
  const credentials = deferred<object>();
  f.setResolve(() => credentials.promise);
  const old = f.service.refreshHome();
  const failed = assert.rejects(old, /timed out/);
  await flush();
  f.expire();
  await failed;
  assert.equal(f.service.getDirectorySyncSnapshot().status, 'error');
  assert.equal(f.counts().reads, 0);
  f.setResolve(async () => ({}));
  const remote = deferred<typeof directory>();
  f.setRead(() => remote.promise);
  const retry = f.service.refreshHome();
  await flush();
  credentials.resolve({});
  await flush();
  assert.equal(f.service.getDirectorySyncSnapshot().status, 'loading');
  assert.equal(f.counts().reads, 1);
  const duplicate = f.service.refreshHome();
  remote.resolve(directory);
  await Promise.all([retry, duplicate]);
  assert.equal(f.counts().reads, 1);
  assert.equal(f.counts().writes, 1);
  assert.equal(f.timers.size, 0);
});

test('read timeout cancels its signal without releasing the shared socket and allows retry', async () => {
  const f = fixture();
  const late = deferred<typeof directory>();
  f.setRead(() => late.promise);
  const failed = assert.rejects(f.service.refreshHome(), /timed out/);
  await flush();
  f.expire();
  await failed;
  assert.equal(f.signals[0].aborted, true);
  assert.equal(f.counts().released, 0);
  f.setRead(async () => directory);
  await f.service.refreshHome();
  late.resolve(directory);
  await flush();
  assert.equal(f.service.getDirectorySyncSnapshot().status, 'ready');
  assert.equal(f.counts().writes, 1);
});

test('read failure is observable, cancels sibling work, and preserves the previous projection', async () => {
  const f = fixture();
  await f.service.refreshHome();
  f.setRead(async () => {
    throw new Error('agents unavailable');
  });
  await assert.rejects(f.service.refreshHome(), /agents unavailable/);
  assert.equal(f.service.getDirectorySyncSnapshot().status, 'error');
  assert.equal(f.service.getDirectorySyncSnapshot().error, 'agents unavailable');
  assert.equal(f.counts().writes, 1);
  assert.equal(f.signals[1].aborted, true);
  assert.equal(f.timers.size, 0);
});

test('switching sources cancels directory work and ignores its late success', async () => {
  const f = fixture();
  const late = deferred<typeof directory>();
  f.setRead(() => late.promise);
  const old = f.service.refreshHome();
  await flush();
  f.switchSource();
  await old;
  late.resolve(directory);
  await flush();
  assert.equal(f.counts().writes, 0);
  assert.equal(f.signals[0].aborted, true);
  assert.equal(f.service.getDirectorySyncSnapshot().status, 'idle');
  assert.equal(f.timers.size, 0);
});

test('startup directory loading does not wait for the push connection to finish', async () => {
  const f = fixture();
  const push = deferred<void>();
  f.setConnect(() => push.promise);
  const started = f.service.start();
  await f.service.refreshHome();
  assert.equal(f.service.getDirectorySyncSnapshot().status, 'ready');
  assert.equal(f.counts().writes, 1);
  push.resolve();
  await started;
  f.service.stop();
});

test('React Native AbortController without signal.reason still reports a useful timeout and permits retry', async () => {
  const require = createRequire(import.meta.url);
  const nativeRequire = createRequire(require.resolve('react-native/package.json'));
  const NativeAbortController = nativeRequire('abort-controller').AbortController as typeof AbortController;
  const f = fixture(NativeAbortController);
  f.setRead(() => new Promise(() => {}));
  const failure = assert.rejects(f.service.refreshHome(), /timed out/);
  await flush();
  f.expire();
  await failure;
  assert.equal(f.service.getDirectorySyncSnapshot().status, 'error');
  assert.match(f.service.getDirectorySyncSnapshot().error, /timed out/);
  f.setRead(async () => directory);
  await f.service.refreshHome();
  assert.equal(f.service.getDirectorySyncSnapshot().status, 'ready');
});
