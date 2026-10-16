import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { ApiError } from '../../src/core/api/apiError.ts';
import type { WsTransportConfig } from '../../src/core/ws/wsTransportConfig.ts';
import { projectRemoteHomeDirectory } from '../../src/features/chatPersistence/chatDirectoryProjector.ts';
import { scopeRemoteHomePayload } from '../../src/features/chatRealtime/chatSourcePayload.ts';
import {
  encodeChatSourceId,
  createChatSource,
  type ChatSource
} from '../../src/features/chatPersistence/chatSource.ts';

const source = ts.createSourceFile(
  'chatSyncService.ts',
  readFileSync(new URL('../../src/features/chatRealtime/chatSyncService.ts', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest,
  true
);
const declaration = source.statements.find(
  (node) => ts.isClassDeclaration(node) && node.name?.text === 'ChatSyncCoordinator'
);
assert.ok(declaration);
const compiled = ts.transpileModule(`${declaration.getText(source)}; new ChatSyncCoordinator()`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 }
}).outputText;
const apiSource = ts.createSourceFile(
  'chatApi.ts',
  readFileSync(new URL('../../src/core/api/services/chatApi.ts', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest,
  true
);
const unwrapDeclaration = apiSource.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'unwrapChatApiEnvelope'
);
assert.ok(unwrapDeclaration);
const unwrapChatApiEnvelope = vm.runInNewContext(
  ts.transpileModule(`${unwrapDeclaration.getText(apiSource).replace('export ', '')}; unwrapChatApiEnvelope`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText,
  { ApiError }
);
const directoryCode = ts.transpileModule(
  readFileSync(new URL('../../src/core/api/services/chatDirectoryApi.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }
).outputText;
type DirectoryRequest = { transport: WsTransportConfig; type: string; namespace?: string; signal?: AbortSignal };
function createDirectoryReader(request: (input: DirectoryRequest) => Promise<unknown>) {
  const exports: Record<string, unknown> = {};
  vm.runInNewContext(directoryCode, {
    exports,
    require: (id: string) => {
      if (id.endsWith('/apiError.ts')) return { ApiError };
      if (id.endsWith('/sharedWsTransport.ts')) return { sharedWsTransport: { request } };
      if (id.endsWith('/chatApi.ts'))
        return { unwrapChatApiEnvelope, buildChatSummariesPayload: () => ({ limit: 10 }) };
      throw new Error(`Unexpected import: ${id}`);
    }
  });
  return exports.readChatDirectory as (
    transport: WsTransportConfig,
    signal?: AbortSignal
  ) => Promise<{
    agents: { key: string; mode?: string }[];
    chats: unknown[];
  }>;
}

for (const transport of [
  {
    kind: 'desktop-ws',
    wsUrl: 'wss://desktop.test/ws',
    tokenMode: 'subprotocol',
    accessToken: 'test',
    namespace: 'ap'
  },
  { kind: 'agent-platform', backendUrl: 'https://cloud.test', accessToken: 'test' }
] satisfies WsTransportConfig[]) {
  test(`${transport.kind} reads Agent modes and chats through current routes`, async () => {
    const calls: DirectoryRequest[] = [];
    const controller = new AbortController();
    const read = createDirectoryReader(async (request) => {
      calls.push(request);
      return {
        code: 0,
        data: request.type === '/api/agents' ? [{ key: 'research', name: 'Research', mode: 'TEAM' }] : []
      };
    });
    const result = await read(transport, controller.signal);
    assert.deepEqual(
      calls.map((call) => call.type),
      ['/api/agents', '/api/chats']
    );
    assert.ok(calls.every((call) => call.transport === transport && call.signal === controller.signal));
    assert.ok(calls.every((call) => call.namespace === (transport.kind === 'desktop-ws' ? 'ap' : undefined)));
    const projection = projectRemoteHomeDirectory({ ...result, chats: [] });
    assert.equal(projection.directoryItems[0].agentKey, 'research');
    assert.equal(projection.directoryItems[0].agentMode, 'TEAM');
    assert.equal(projection.directoryItems[0].kind, 'agent');
  });
}

test('directory accepts empty arrays and rejects malformed entries in either response', async () => {
  const transport: WsTransportConfig = {
    kind: 'agent-platform',
    backendUrl: 'https://cloud.test',
    accessToken: 'test'
  };
  const empty = await createDirectoryReader(async () => [])(transport);
  for (const failedType of ['/api/agents', '/api/chats']) {
    for (const payload of [{ unexpected: true }, [null], [[]], ['invalid']]) {
      const read = createDirectoryReader(async ({ type }) => (type === failedType ? payload : []));
      await assert.rejects(read(transport), (error: unknown) => error instanceof ApiError && error.status === 502);
    }
  }
});

const defaultSource = createChatSource('default', 'cloud', '默认数据源');
const pairedSource = createChatSource('paired', 'desktop-a', 'Desktop');

type Service = { source: ChatSource; status: string; refresh: () => Promise<void>; stopped: boolean };
function fixture(paired: ChatSource | null = pairedSource) {
  const services = new Map<string, Service>();
  let activePair = paired;
  class FakeService {
    status = 'idle';
    stopped = false;
    refresh = async () => {};
    constructor(public source: ChatSource) {
      services.set(source.key, this);
    }
    subscribe() {
      return () => {};
    }
    getStatus() {
      return this.status;
    }
    stop() {
      this.stopped = true;
    }
    async refreshHome() {
      await this.refresh();
    }
  }
  const coordinator = vm.runInNewContext(compiled, {
    Error,
    ChatSyncService: FakeService,
    getCloudAuthSnapshot: () => ({ status: 'available' }),
    getDefaultChatSource: () => defaultSource,
    getActiveChatSource: () => activePair ?? defaultSource
  }) as {
    refreshHome: () => Promise<{ source: ChatSource; message: string }[]>;
    getSourceStatus: (source: ChatSource | null) => string;
  };
  return {
    coordinator,
    services,
    setPair: (next: ChatSource | null) => {
      activePair = next;
    }
  };
}

test('only the selected source is instantiated and refreshed', async () => {
  const { coordinator, services, setPair } = fixture();
  await coordinator.refreshHome();
  assert.equal(services.size, 1);
  assert.ok(services.has(pairedSource.key));
  services.get(pairedSource.key)!.refresh = async () => {
    throw new Error('offline');
  };
  const failures = await coordinator.refreshHome();
  assert.equal(failures[0].source.key, pairedSource.key);
  setPair(null);
  await coordinator.refreshHome();
  assert.equal(services.get(pairedSource.key)!.stopped, true);
  assert.equal(services.get(defaultSource.key)!.stopped, false);
});

test('a failed current source does not fall back to another account/source', async () => {
  const { coordinator, services } = fixture();
  await coordinator.refreshHome();
  services.get(pairedSource.key)!.refresh = async () => {
    throw new Error('offline');
  };
  const failures = await coordinator.refreshHome();
  assert.equal(failures.length, 1);
  assert.equal(failures[0].message, 'offline');
  assert.equal(services.has(defaultSource.key), false);
});

test('one source requires authentication and complete agents/chats before replacing its projection', async () => {
  const implementation = source.statements.find(
    (node) => ts.isClassDeclaration(node) && node.name?.text === 'ChatSyncService'
  );
  assert.ok(implementation && ts.isClassDeclaration(implementation));
  const method = implementation.members.find(
    (node) => ts.isMethodDeclaration(node) && node.name.getText(source) === 'refreshHome'
  );
  assert.ok(method);
  let authenticated = false;
  let failAgents = false;
  let lifecycleCurrent = true;
  let responseGate: Promise<void> | null = null;
  let writes = 0;
  let responseMode = 'array';
  let projection: ReturnType<typeof projectRemoteHomeDirectory> | null = null;
  const requests: string[] = [];
  const refresh = vm.runInNewContext(
    ts.transpileModule(`({ ${method.getText(source)} }).refreshHome`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 }
    }).outputText,
    {
      ApiError: class extends Error {},
      AbortController,
      setTimeout,
      clearTimeout,
      WsClientRequestTimeoutError: Error,
      CHAT_DIRECTORY_READ_TIMEOUT_MS: 15_000,
      CHAT_SUMMARIES_TRANSPORT_TYPE: '/api/chats',
      buildChatSummariesPayload: () => ({}),
      readChatDirectory: createDirectoryReader(async ({ type }) => {
        requests.push(type);
        if (responseGate) await responseGate;
        if (type === '/api/agents' && failAgents) throw new Error('agents failed');
        const data =
          type === '/api/agents'
            ? [{ key: 'assistant', name: 'Desktop Assistant' }]
            : [
                {
                  chatId: 'desktop-chat',
                  agentKey: 'assistant',
                  lastRunContent: 'From Desktop',
                  updatedAt: 1700000000000
                }
              ];
        if (type === '/api/agents' && responseMode === 'invalid') return { unexpected: true };
        if (type === '/api/agents' && responseMode === 'error') return { code: 503, msg: 'Desktop AP unavailable' };
        return responseMode === 'envelope' ? { code: 0, data } : data;
      }),
      unwrapChatApiEnvelope,
      scopeRemoteHomePayload,
      projectRemoteHomeDirectory,
      replaceChatHomeProjection: async (value: ReturnType<typeof projectRemoteHomeDirectory>) => {
        projection = value;
        writes++;
      }
    }
  ) as (this: object) => Promise<void>;
  const service = {
    homeRefreshPromise: null,
    lifecycleVersion: 0,
    homeRefreshController: null,
    setDirectorySyncStatus() {},
    source: pairedSource,
    resolveTransportConfig: async () => (authenticated ? {} : null),
    isLifecycleCurrent: () => lifecycleCurrent,
    emit() {}
  };
  await assert.rejects(refresh.call(service), /Not authenticated/);
  assert.equal(writes, 0);
  authenticated = true;
  failAgents = true;
  await assert.rejects(refresh.call(service), /agents failed/);
  assert.equal(writes, 0);
  assert.deepEqual(requests, ['/api/agents', '/api/chats']);
  failAgents = false;
  await refresh.call(service);
  assert.equal(writes, 1);
  const chatId = encodeChatSourceId(pairedSource, 'desktop-chat');
  assert.equal(projection!.directoryItems[0].latestConversationId, chatId);
  assert.equal(projection!.conversationSummaries[0].conversationId, chatId);
  responseMode = 'envelope';
  await refresh.call(service);
  assert.equal(writes, 2);
  assert.equal(projection!.directoryItems[0].latestConversationId, chatId);
  const previous = projection;
  responseMode = 'invalid';
  await assert.rejects(refresh.call(service), /Invalid chat directory response/);
  assert.equal(writes, 2);
  assert.equal(projection, previous);
  responseMode = 'error';
  await assert.rejects(refresh.call(service), /Desktop AP unavailable/);
  assert.equal(writes, 2);
  responseMode = 'array';
  let release!: () => void;
  responseGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pendingRefresh = refresh.call(service);
  await Promise.resolve();
  lifecycleCurrent = false;
  release();
  await pendingRefresh;
  assert.equal(writes, 2);
  assert.equal(projection, previous);
});
