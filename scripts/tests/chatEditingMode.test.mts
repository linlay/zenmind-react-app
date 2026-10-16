import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import vm from 'node:vm';
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
