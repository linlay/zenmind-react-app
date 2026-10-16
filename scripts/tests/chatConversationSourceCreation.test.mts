import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {
  createChatSource,
  encodeChatSourceId,
  getChatSourceFromId
} from '../../src/features/chatPersistence/chatSource.ts';
import { normalizeChatConversationHistoryScope } from '../../src/features/chatPersistence/chatHistoryScope.ts';

const repository = ts.createSourceFile(
  'chatRepository.ts',
  readFileSync(new URL('../../src/features/chatPersistence/chatRepository.ts', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest,
  true
);
const names = ['awaitInChatScope', 'createLocalConversationForHistoryScope'];
const functions = names.map((name) => {
  const declaration = repository.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, name);
  return declaration.getText(repository);
});
const code = ts.transpileModule(functions.join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 }
}).outputText;
const cloud = createChatSource('default', JSON.stringify(['account-a', 'cloud']), 'Cloud');
const desktop = createChatSource('paired', JSON.stringify(['account-a', 'desktop-a']), 'Desktop');

function fixture(source: typeof cloud | null, offline = false) {
  const writes: Record<string, unknown>[] = [];
  const create = vm.runInNewContext(`${code}\ncreateLocalConversationForHistoryScope;`, {
    getChatCacheScopeId: () => 'current-cache',
    normalizeChatConversationHistoryScope,
    getChatSourceFromId,
    getActiveChatSource: () => source,
    getCloudAuthSnapshot: () => ({ status: 'available' }),
    isActiveDesktopOffline: () => offline,
    encodeChatSourceId,
    createLocalId: () => 'new-chat',
    normalizeLocalConversationTitle: (title: string) => title,
    conversations: {},
    chatDb: {
      insert: () => ({
        values: async (row: Record<string, unknown>) => {
          writes.push(row);
        }
      })
    },
    getConversationDetail: async (id: string) => ({ conversationId: id }),
    Error,
    Date
  }) as (scope: { agentKey?: string }) => Promise<unknown>;
  return { create, writes };
}

test('signed-out creation cannot write a conversation into the signed-out cache', async () => {
  const f = fixture(null);
  await assert.rejects(f.create({ agentKey: encodeChatSourceId(cloud, 'agent') }), /source changed/);
  assert.equal(f.writes.length, 0);
});

test('stale Agent targets cannot create in another account or Desktop cache', async () => {
  const foreign = createChatSource('paired', JSON.stringify(['account-b', 'desktop-b']), 'Other');
  for (const target of [cloud, foreign]) {
    for (const key of ['agentKey']) {
      const f = fixture(desktop);
      await assert.rejects(f.create({ [key]: encodeChatSourceId(target, 'target') }), /source changed/);
      assert.equal(f.writes.length, 0);
    }
  }
});

test('known offline Desktop rejects Agent creation before any database write', async () => {
  for (const key of ['agentKey']) {
    const f = fixture(desktop, true);
    await assert.rejects(f.create({ [key]: encodeChatSourceId(desktop, 'target') }), /offline/);
    assert.equal(f.writes.length, 0);
  }
});

test('current cloud and online Desktop still create a scoped conversation for each owner kind', async () => {
  for (const source of [cloud, desktop]) {
    for (const key of ['agentKey']) {
      const f = fixture(source);
      const target = encodeChatSourceId(source, 'target');
      const result = (await f.create({ [key]: target })) as { conversation: { conversationId: string } };
      assert.equal(f.writes.length, 1);
      assert.equal(f.writes[0][key], target);
      assert.equal(result.conversation.conversationId, encodeChatSourceId(source, 'new-chat'));
    }
  }
});
