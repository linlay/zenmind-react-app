import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { parseStoredRequiredSkills } from '../../src/core/api/services/chatSkillsProtocol.ts';
import { canUseEditingMode, canUsePlanMode } from '../../src/features/chatPersistence/agentMode.ts';

function functionSource(file: string, names: string[]) {
  const source = ts.createSourceFile(
    file,
    readFileSync(new URL(file, import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  return source.statements
    .filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ''))
    .map((node) => node.getText(source).replace(/^export /, ''))
    .join('\n');
}

test('Editing belongs to KBASE and Planning to CODER, including normalized modes', () => {
  for (const mode of ['KBASE', ' kbase ']) {
    assert.equal(canUseEditingMode(mode), true);
    assert.equal(canUsePlanMode(mode), false);
  }
  assert.equal(canUsePlanMode('CODER'), true);
  for (const mode of ['CODER', 'TEAM', 'CHANNEL', undefined]) assert.equal(canUseEditingMode(mode), false);
});

test('real SQLite old outbox upgrade preserves pending rows and idempotently defaults Editing off', async () => {
  const db = new DatabaseSync(':memory:');
  const code = ts.transpileModule(
    `let initialized=false;
    const READ_STATE_SCHEMA_VERSION=1,RICH_TIMELINE_SCHEMA_VERSION=2,CHAT_DIRECTORY_ICON_SCHEMA_VERSION=3,
      MESSAGE_ATTACHMENTS_SCHEMA_VERSION=4,CHAT_QUERY_INDEX_SCHEMA_VERSION=6,
      CHAT_DIRECTORY_MODEL_SETTINGS_SCHEMA_VERSION=7,SOURCE_DELETED_SCHEMA_VERSION=8;
    ${functionSource('../../src/features/chatPersistence/database.ts', ['ignoreDuplicateColumn', 'getDatabaseUserVersion', 'ensureChatDatabase'])}
    ({run:ensureChatDatabase, reset:()=>{initialized=false}})`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  const migration = vm.runInNewContext(code, {
    Error,
    sqlite: {
      execSync: (sql: string) => db.exec(sql),
      getFirstSync: (sql: string) => db.prepare(sql).get()
    }
  });
  try {
    await migration.run();
    db.exec(`INSERT INTO conversations(id,title,last_message_text,last_message_at,updated_at) VALUES('chat','title','original',123,123);
      DROP TABLE outbox_messages;
      CREATE TABLE outbox_messages(client_message_id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,content TEXT NOT NULL,planning_mode INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
      INSERT INTO outbox_messages VALUES('pending','chat','keep this',1,123);`);
    migration.reset();
    await migration.run();
    const original = db.prepare('SELECT * FROM outbox_messages').get();
    assert.deepEqual(
      { ...original },
      {
        client_message_id: 'pending',
        conversation_id: 'chat',
        content: 'keep this',
        planning_mode: 1,
        created_at: 123,
        editing_mode: 0,
        must_use_skills_json: '[]'
      }
    );
    db.prepare(
      'UPDATE outbox_messages SET editing_mode=1, planning_mode=0, must_use_skills_json=\'["office/pdf"]\''
    ).run();
    migration.reset();
    await migration.run();
    assert.equal(db.prepare('SELECT editing_mode FROM outbox_messages').get()?.editing_mode, 1);
    assert.equal(
      db.prepare('SELECT must_use_skills_json FROM outbox_messages').get()?.must_use_skills_json,
      '["office/pdf"]'
    );
    assert.equal(db.prepare('SELECT last_message_text FROM conversations').get()?.last_message_text, 'original');
    assert.equal(
      db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE '%editing%'").all().length,
      0
    );
  } finally {
    db.close();
  }
});

test('failed message mode lookup uses the stable client ID and keeps original options', async () => {
  const code = ts.transpileModule(
    `${functionSource('../../src/features/chatPersistence/chatRepository.ts', ['getOutboxMessageOptions'])}; getOutboxMessageOptions`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  let row: any = { planningMode: 0, editingMode: 1, mustUseSkillsJson: '["office/pdf"]' },
    lookedUp = '';
  const query = { from: () => query, where: () => query, limit: async () => (row ? [row] : []) };
  const lookup = vm.runInNewContext(code, {
    getChatCacheScopeId: () => 'test',
    awaitInChatScope: async (pending: unknown) => pending,
    ensureChatDatabase: async () => {},
    parseStoredRequiredSkills,
    chatDb: { select: () => query },
    outboxMessages: { clientMessageId: 'id' },
    eq: (_column: unknown, id: string) => {
      lookedUp = id;
    }
  });
  assert.deepEqual(
    { ...(await lookup('failed-original')) },
    { planningMode: false, editingMode: true, mustUseSkills: ['office/pdf'] }
  );
  assert.equal(lookedUp, 'failed-original');
  row = null;
  assert.equal(await lookup('sent-without-outbox'), null);
});
