import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import vm from 'node:vm';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { and, eq, sql } from 'drizzle-orm';
import { composerPreferences } from '../../src/features/chatPersistence/schema.ts';
import ts from 'typescript';
import { resolveAgentInteraction } from '../../src/features/chatPersistence/agentInteraction.ts';
import { CHAT_CACHE_SCHEMA_VERSION } from '../../src/features/chatPersistence/cacheScope.ts';
test('input entries come from explicit Platform capabilities, independent of mode defaults', () => {
  assert.equal(resolveAgentInteraction(null).showPlanningMode, false);
  const capability = resolveAgentInteraction({
    showPlanningMode: true,
    showEditingMode: true,
    attachment: { skills: true, kbases: true }
  });
  assert.equal(capability.showPlanningMode, true);
  assert.equal(capability.showEditingMode, true);
  assert.equal(capability.attachment.skills, true);
});
function cache(db: DatabaseSync) {
  const file = ts.createSourceFile(
    'database.ts',
    readFileSync(new URL('../../src/features/chatPersistence/database.ts', import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  const fn = file.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'ensureChatDatabase'
  )!;
  let clears = 0;
  const code = ts.transpileModule(
    'let initialized=false;' +
      fn.getText(file).replace(/^export /, '') +
      ';({open:ensureChatDatabase,reopen:()=>{initialized=false}})',
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  const api = vm.runInNewContext(code, {
    CHAT_CACHE_SCHEMA_VERSION,
    getChatCacheScopeId: () => "test-scope",
    clearChatComposerPreferences: () => {},
    clearAuthenticatedResourceImageCache: () => {},
    clearChatDirectorySnapshot: () => {
      clears++;
    },
    sqlite: {
      execSync: (sql: string) => db.exec(sql),
      getFirstSync: (sql: string) => db.prepare(sql).get(),
      getAllSync: (sql: string) => db.prepare(sql).all(),
      runSync: (sql: string) => db.prepare(sql).run(),
      withTransactionSync: (fn: () => void) => {
        db.exec('BEGIN');
        try {
          fn();
          db.exec('COMMIT');
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
      }
    }
  });
  return { ...api, clears: () => clears };
}
test('old scoped cache is rebuilt once; new data and schema survive reopening', async () => {
  const db = new DatabaseSync(':memory:');
  const f = cache(db);
  try {
    db.exec('CREATE TABLE retired_cache(value TEXT); PRAGMA user_version=8');
    await f.open();
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='retired_cache'").get(), undefined);
    assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, CHAT_CACHE_SCHEMA_VERSION);
    db.exec(
      "INSERT INTO conversations(id,title,last_message_text,last_message_at,updated_at) VALUES('chat','title','body',1,1)"
    );
    f.reopen();
    await f.open();
    assert.equal(f.clears(), 1);
    assert.equal(db.prepare('SELECT title FROM conversations').get()?.title, 'title');
    assert.deepEqual(
      db
        .prepare('PRAGMA table_info(conversations)')
        .all()
        .filter((row) => row.name === 'agent_key').length,
      1
    );
  } finally {
    db.close();
  }
});
test('future schema is refused and another scope remains untouched', async () => {
  const future = new DatabaseSync(':memory:'),
    other = new DatabaseSync(':memory:');
  try {
    future.exec(`CREATE TABLE keep(value TEXT);PRAGMA user_version=${CHAT_CACHE_SCHEMA_VERSION + 1}`);
    const f = cache(future);
    await assert.rejects(f.open(), /newer app/);
    assert.equal(f.clears(), 0);
    other.exec('CREATE TABLE isolated(value TEXT)');
    await cache(new DatabaseSync(':memory:')).open();
    assert.ok(other.prepare("SELECT name FROM sqlite_master WHERE name='isolated'").get());
  } finally {
    future.close();
    other.close();
  }
});


test('composer repository stores only applied model and skills, isolates owner/Chat and preserves newer values on first confirmation', async () => {
  const db = new DatabaseSync(':memory:');
  const f = cache(db);
  await f.open();
  let scope = 'scope';
  const chatDb = drizzle(async (query, params, method) => {
    const statement = db.prepare(query);
    if (method === 'run') { statement.run(...params); return { rows: [] }; }
    return { rows: statement.all(...params).map(row => Object.values(row)) };
  });
  const file = ts.createSourceFile('repo.ts', readFileSync(new URL('../../src/features/chatPersistence/chatRepository.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const names = ['awaitInChatScope','readComposerConfiguration','saveComposerConfiguration'];
  const code = file.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text || '')).map(node => node.getText(file).replace(/^export /, '')).join('\n');
  const repo = vm.runInNewContext(ts.transpileModule(code + ';({readComposerConfiguration,saveComposerConfiguration})', { compilerOptions:{target:ts.ScriptTarget.ES2022} }).outputText,
    { chatDb, composerPreferences, and, eq, sql, ensureChatDatabase: async () => {}, getChatCacheScopeId: () => scope });
  const target = { owner:'account-a', scope, kind:'chat', id:'chat-a' };
  try {
    await repo.saveComposerConfiguration(target, { skillIds:['pdf'] });
    await repo.saveComposerConfiguration(target, { model:{ key:'new',serviceTier:'STANDARD' } });
    await repo.saveComposerConfiguration(target, { model:{ key:'old' } }, true);
    assert.deepEqual(JSON.parse(JSON.stringify(await repo.readComposerConfiguration(target))), { model:{key:'new',serviceTier:'STANDARD'}, skillIds:['pdf'] });
    assert.equal(await repo.readComposerConfiguration({ ...target, owner:'account-b' }), undefined);
    assert.equal(await repo.readComposerConfiguration({ ...target, id:'chat-b' }), undefined);
    f.reopen(); await f.open();
    assert.equal((await repo.readComposerConfiguration(target)).model.key, 'new');
    scope = 'other';
    await assert.rejects(repo.saveComposerConfiguration(target, { skillIds:[] }), /scope changed/);
    assert.equal(db.prepare('SELECT count(*) AS count FROM composer_preferences').get()?.count, 1);
  } finally { db.close(); }
});
