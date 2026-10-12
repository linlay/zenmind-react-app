import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
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
  { ApiError: class extends Error {} }
);
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

test('one source requires authentication and a complete agents/teams/chats result before replacing its projection', async () => {
  const implementation = source.statements.find(
    (node) => ts.isClassDeclaration(node) && node.name?.text === 'ChatSyncService'
  );
  assert.ok(implementation && ts.isClassDeclaration(implementation));
  const method = implementation.members.find(
    (node) => ts.isMethodDeclaration(node) && node.name.getText(source) === 'refreshHome'
  );
  assert.ok(method);
  let authenticated = false;
  let failTeams = false;
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
      CHAT_SUMMARIES_TRANSPORT_TYPE: '/api/chats',
      buildChatSummariesPayload: () => ({}),
      readChatDirectory: async () => {
        const read = async (type: string) => {
          requests.push(type);
          if (type === '/api/teams' && failTeams) throw new Error('teams failed');
          const data =
            type === '/api/agents'
              ? [{ key: 'assistant', name: 'Desktop Assistant' }]
              : type === '/api/chats'
                ? [
                    {
                      chatId: 'desktop-chat',
                      agentKey: 'assistant',
                      lastRunContent: 'From Desktop',
                      updatedAt: 1700000000000
                    }
                  ]
                : [];
          if (type === '/api/teams' && responseMode === 'invalid') return { unexpected: true };
          if (type === '/api/teams' && responseMode === 'error') return { code: 503, msg: 'Desktop AP unavailable' };
          return responseMode === 'envelope' ? { code: 0, data } : data;
        };
        const [agents, teams, chats] = await Promise.all(
          ['/api/agents', '/api/teams', '/api/chats'].map(async (type) => {
            const result = unwrapChatApiEnvelope(await read(type));
            if (!Array.isArray(result)) throw new Error('Invalid chat directory response');
            return result;
          })
        );
        return { agents, teams, chats };
      },
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
    source: pairedSource,
    resolveTransportConfig: async () => (authenticated ? {} : null),
    isLifecycleCurrent: () => true,
    emit() {}
  };
  await assert.rejects(refresh.call(service), /Not authenticated/);
  assert.equal(writes, 0);
  authenticated = true;
  failTeams = true;
  await assert.rejects(refresh.call(service), /teams failed/);
  assert.equal(writes, 0);
  assert.deepEqual(requests, ['/api/agents', '/api/teams', '/api/chats']);
  failTeams = false;
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
});
