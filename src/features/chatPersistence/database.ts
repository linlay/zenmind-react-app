import { drizzle } from 'drizzle-orm/expo-sqlite';
import { File } from 'expo-file-system';
import { defaultDatabaseDirectory, deleteDatabaseSync, openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import {
  buildChatDatabaseName,
  getChatCacheScopeId,
  normalizeChatCacheScopeId,
  setChatCacheScopeId
} from './cacheScope';
import * as schema from './schema';

let sqlite = openDatabaseSync(buildChatDatabaseName(), { enableChangeListener: true });

export let chatDb = drizzle(sqlite, { schema });

const READ_STATE_SCHEMA_VERSION = 1;
const RICH_TIMELINE_SCHEMA_VERSION = 2;
const CHAT_DIRECTORY_ICON_SCHEMA_VERSION = 3;
const MESSAGE_ATTACHMENTS_SCHEMA_VERSION = 4;
const CHAT_QUERY_INDEX_SCHEMA_VERSION = 6;
const CHAT_DIRECTORY_MODEL_SETTINGS_SCHEMA_VERSION = 7;
const SOURCE_DELETED_SCHEMA_VERSION = 8;
let initialized = false;

export type ChatCacheConversationStorage = {
  conversationId: string;
  title: string;
  sizeBytes: number;
  lastLoadedAt: number;
};

export type ChatDatabaseScopeInventory = {
  scopeId: string;
  database: 'present' | 'missing';
  sizeBytes: number;
  lastLoadedAt: number;
  conversationCount: number;
  conversations: ChatCacheConversationStorage[];
};

type ChatCacheConversationStorageRow = {
  conversationId: string;
  title: string;
  sizeBytes: number;
  lastLoadedAt: number;
};

function readTableColumns(database: SQLiteDatabase, tableName: string): Set<string> {
  return new Set(database.getAllSync<{ name: string }>(`PRAGMA table_info(${tableName})`).map((row) => row.name));
}

function blobLengthExpression(alias: string, columns: ReadonlySet<string>, candidates: readonly string[]): string {
  const terms = candidates.filter((column) => columns.has(column)).map((column) => `coalesce(${alias}.${column}, '')`);
  return terms.length > 0 ? `length(cast(${terms.join(' || ')} AS blob))` : '0';
}

function chatDatabaseFileSize(databaseName: string): number {
  let total = 0;
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      const file = new File(defaultDatabaseDirectory, `${databaseName}${suffix}`);
      if (file.exists) {
        total += Math.max(0, Number(file.size || 0));
      }
    } catch {
      // Some web/test runtimes do not expose SQLite as regular files.
    }
  }
  return total;
}

function chatDatabaseFileExists(databaseName: string): boolean {
  try {
    return new File(defaultDatabaseDirectory, databaseName).exists;
  } catch {
    return databaseName === buildChatDatabaseName();
  }
}

function readChatDatabaseScopeInventory(
  database: SQLiteDatabase,
  scopeId: string,
  databaseName: string
): ChatDatabaseScopeInventory {
  const tableNames = new Set(
    database.getAllSync<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table'`).map((row) => row.name)
  );
  if (!tableNames.has('conversations')) {
    return {
      scopeId,
      database: 'present',
      sizeBytes: chatDatabaseFileSize(databaseName),
      lastLoadedAt: 0,
      conversationCount: 0,
      conversations: []
    };
  }
  const conversationColumns = readTableColumns(database, 'conversations');
  if (!conversationColumns.has('id')) {
    return {
      scopeId,
      database: 'present',
      sizeBytes: chatDatabaseFileSize(databaseName),
      lastLoadedAt: 0,
      conversationCount: 0,
      conversations: []
    };
  }
  const syncColumns = tableNames.has('conversation_sync_state')
    ? readTableColumns(database, 'conversation_sync_state')
    : new Set<string>();
  const timelineMetaColumns = tableNames.has('conversation_timeline_meta')
    ? readTableColumns(database, 'conversation_timeline_meta')
    : new Set<string>();
  const canJoinSync = syncColumns.has('conversation_id');
  const canJoinTimelineMeta = timelineMetaColumns.has('conversation_id');
  const lastLoadedTerms = [
    ...(conversationColumns.has('updated_at') ? ['coalesce(c.updated_at, 0)'] : []),
    ...(conversationColumns.has('last_message_at') ? ['coalesce(c.last_message_at, 0)'] : []),
    ...(canJoinSync && syncColumns.has('last_synced_at') ? ['coalesce(s.last_synced_at, 0)'] : []),
    ...(canJoinTimelineMeta && timelineMetaColumns.has('persisted_at') ? ['coalesce(tm.persisted_at, 0)'] : [])
  ];
  const sizeTerms = [
    blobLengthExpression('c', conversationColumns, ['id', 'title', 'last_message_text', 'agent_key', 'team_id'])
  ];
  for (const [tableName, alias, columns] of [
    ['messages', 'm', ['id', 'content', 'role', 'delivery_status', 'error_reason']],
    ['message_attachments', 'a', ['id', 'name', 'kind', 'mime_type', 'resource_url', 'sha256', 'references_json']],
    ['conversation_timeline_nodes', 'n', ['node_id', 'kind', 'run_id', 'payload_json']]
  ] as const) {
    if (!tableNames.has(tableName)) continue;
    const tableColumns = readTableColumns(database, tableName);
    if (!tableColumns.has('conversation_id')) continue;
    sizeTerms.push(
      `coalesce((SELECT sum(${blobLengthExpression(alias, tableColumns, columns)}) FROM ${tableName} ${alias} WHERE ${alias}.conversation_id = c.id), 0)`
    );
  }
  const joins = [
    ...(canJoinSync ? ['LEFT JOIN conversation_sync_state s ON s.conversation_id = c.id'] : []),
    ...(canJoinTimelineMeta ? ['LEFT JOIN conversation_timeline_meta tm ON tm.conversation_id = c.id'] : [])
  ];
  const rows = database.getAllSync<ChatCacheConversationStorageRow>(`
    SELECT
      c.id AS conversationId,
      ${conversationColumns.has('title') ? `coalesce(c.title, '')` : `''`} AS title,
      ${lastLoadedTerms.length > 0 ? `max(${lastLoadedTerms.join(', ')})` : '0'} AS lastLoadedAt,
      ${sizeTerms.join(' + ')} AS sizeBytes
    FROM conversations c
    ${joins.join('\n')}
    ORDER BY lastLoadedAt DESC, c.id ASC
  `);
  const conversations = rows.map((row) => ({
    conversationId: String(row.conversationId || '').trim(),
    title: String(row.title || '').trim(),
    sizeBytes: Math.max(0, Number(row.sizeBytes || 0)),
    lastLoadedAt: Math.max(0, Number(row.lastLoadedAt || 0))
  }));
  return {
    scopeId,
    database: 'present',
    sizeBytes: chatDatabaseFileSize(databaseName),
    lastLoadedAt: conversations.reduce((latest, item) => Math.max(latest, item.lastLoadedAt), 0),
    conversationCount: conversations.length,
    conversations
  };
}

export function inspectChatDatabaseScope(scopeId: string): ChatDatabaseScopeInventory {
  const rawScopeId = String(scopeId || '').trim();
  const normalizedScopeId = normalizeChatCacheScopeId(rawScopeId);
  if (!rawScopeId || normalizedScopeId !== rawScopeId) {
    throw new Error('Invalid chat cache scope id');
  }
  const databaseName = buildChatDatabaseName(normalizedScopeId);
  if (!chatDatabaseFileExists(databaseName)) {
    return {
      scopeId: normalizedScopeId,
      database: 'missing',
      sizeBytes: 0,
      lastLoadedAt: 0,
      conversationCount: 0,
      conversations: []
    };
  }
  if (normalizedScopeId === getChatCacheScopeId()) {
    return readChatDatabaseScopeInventory(sqlite, normalizedScopeId, databaseName);
  }
  const inspected = openDatabaseSync(databaseName, { useNewConnection: true });
  try {
    return readChatDatabaseScopeInventory(inspected, normalizedScopeId, databaseName);
  } finally {
    inspected.closeSync();
  }
}

export function deleteChatConversationFromScopeIfExists(scopeId: string, conversationId: string): boolean {
  const rawScopeId = String(scopeId || '').trim();
  const normalizedScopeId = normalizeChatCacheScopeId(rawScopeId);
  const normalizedConversationId = String(conversationId || '').trim();
  if (!rawScopeId || normalizedScopeId !== rawScopeId || !normalizedConversationId) {
    throw new Error('Valid chat cache scope and conversation ids are required');
  }
  const databaseName = buildChatDatabaseName(normalizedScopeId);
  if (!chatDatabaseFileExists(databaseName)) {
    return false;
  }
  const active = normalizedScopeId === getChatCacheScopeId();
  const target = active ? sqlite : openDatabaseSync(databaseName, { useNewConnection: true });
  try {
    const tableNames = new Set(
      target.getAllSync<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table'`).map((row) => row.name)
    );
    if (!tableNames.has('conversations')) {
      return false;
    }
    const conversation = target.getFirstSync<{ id: string }>(
      `SELECT id FROM conversations WHERE id = ? LIMIT 1`,
      normalizedConversationId
    );
    if (!conversation) {
      return false;
    }
    target.withTransactionSync(() => {
      for (const tableName of [
        'conversation_timeline_nodes',
        'conversation_timeline_meta',
        'outbox_messages',
        'message_attachments',
        'messages',
        'conversation_sync_state'
      ]) {
        if (tableNames.has(tableName) && readTableColumns(target, tableName).has('conversation_id')) {
          target.runSync(`DELETE FROM ${tableName} WHERE conversation_id = ?`, normalizedConversationId);
        }
      }
      target.runSync(`DELETE FROM conversations WHERE id = ?`, normalizedConversationId);
      if (tableNames.has('chat_directory_items')) {
        target.runSync(`DELETE FROM chat_directory_items`);
      }
    });
    return true;
  } finally {
    if (!active) {
      target.closeSync();
    }
  }
}

export function switchChatDatabaseScope(scopeId: string) {
  const nextScopeId = normalizeChatCacheScopeId(scopeId);
  if (getChatCacheScopeId() === nextScopeId) {
    return;
  }

  const previousSqlite = sqlite;
  const nextSqlite = openDatabaseSync(buildChatDatabaseName(nextScopeId), { enableChangeListener: true });
  setChatCacheScopeId(nextScopeId);
  sqlite = nextSqlite;
  chatDb = drizzle(sqlite, { schema });
  initialized = false;

  try {
    previousSqlite.closeSync();
  } catch {
    // Keep the newly selected database active even if the old native handle is already closed.
  }
}

export function deleteChatDatabaseScope(scopeId: string): boolean {
  try {
    return deleteChatDatabaseScopeIfExists(scopeId) === 'deleted';
  } catch {
    return false;
  }
}

export type ChatDatabaseScopeDeleteStatus = 'deleted' | 'missing';

function isDatabaseNotFoundError(error: unknown): boolean {
  return String(error instanceof Error ? error.message : error)
    .toLowerCase()
    .includes('not found');
}

export function deleteChatDatabaseScopeIfExists(scopeId: string): ChatDatabaseScopeDeleteStatus {
  const rawScopeId = String(scopeId || '').trim();
  const normalizedScopeId = normalizeChatCacheScopeId(rawScopeId);
  if (!rawScopeId || normalizedScopeId !== rawScopeId) {
    throw new Error('Invalid chat cache scope id');
  }
  if (normalizedScopeId === getChatCacheScopeId()) {
    throw new Error('Cannot delete the active chat cache scope');
  }

  try {
    deleteDatabaseSync(buildChatDatabaseName(normalizedScopeId));
    return 'deleted';
  } catch (error) {
    if (isDatabaseNotFoundError(error)) {
      return 'missing';
    }
    throw error;
  }
}

function ignoreDuplicateColumn(error: unknown) {
  if (!String(error instanceof Error ? error.message : error).includes('duplicate column name')) {
    throw error;
  }
}

function getDatabaseUserVersion(): number {
  const row = sqlite.getFirstSync<{ user_version: number }>('PRAGMA user_version;');
  const version = Number(row?.user_version || 0);
  return Number.isFinite(version) ? version : 0;
}

export async function ensureChatDatabase() {
  if (initialized) {
    return;
  }

  sqlite.execSync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

	    CREATE TABLE IF NOT EXISTS conversations (
	      id TEXT PRIMARY KEY NOT NULL,
	      title TEXT NOT NULL,
	      last_message_text TEXT NOT NULL,
	      last_message_at INTEGER NOT NULL,
	      unread_count INTEGER NOT NULL DEFAULT 0,
	      is_read INTEGER NOT NULL DEFAULT 1,
	      read_at INTEGER,
	      read_run_id TEXT,
	      last_message_status TEXT NOT NULL DEFAULT 'sent',
	      pinned_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      agent_key TEXT,
      team_id TEXT,
      source_deleted INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS chat_directory_items (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      icon_name TEXT,
      icon_color TEXT,
      icon_uri TEXT,
      unread_count INTEGER NOT NULL DEFAULT 0,
      pinned_at INTEGER NOT NULL DEFAULT 0,
      sort_rank INTEGER NOT NULL,
      agent_key TEXT,
      team_id TEXT,
      default_agent_key TEXT,
      agent_mode TEXT,
      model_key TEXT,
      reasoning_effort TEXT,
      latest_conversation_id TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY NOT NULL,
      client_message_id TEXT,
      server_message_id TEXT,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      delivery_status TEXT NOT NULL DEFAULT 'sent',
      error_reason TEXT
    );

    CREATE INDEX IF NOT EXISTS messages_conversation_created_at_idx
      ON messages(conversation_id, created_at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS messages_client_message_id_idx
      ON messages(client_message_id);

    CREATE UNIQUE INDEX IF NOT EXISTS messages_server_message_id_idx
      ON messages(server_message_id);

    CREATE TABLE IF NOT EXISTS message_attachments (
      id TEXT PRIMARY KEY NOT NULL,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      client_message_id TEXT,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      width INTEGER,
      height INTEGER,
      local_uri TEXT NOT NULL DEFAULT '',
      preview_uri TEXT,
      resource_url TEXT,
      sha256 TEXT,
      status TEXT NOT NULL DEFAULT 'ready',
      error_reason TEXT,
      references_json TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS message_attachments_message_idx
      ON message_attachments(message_id, sort_order);

    CREATE INDEX IF NOT EXISTS message_attachments_conversation_idx
      ON message_attachments(conversation_id, created_at);

    CREATE INDEX IF NOT EXISTS message_attachments_client_message_idx
      ON message_attachments(client_message_id);

    CREATE TABLE IF NOT EXISTS outbox_messages (
      client_message_id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      planning_mode INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversation_sync_state (
      conversation_id TEXT PRIMARY KEY NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      active_run_id TEXT NOT NULL DEFAULT '',
      last_synced_at INTEGER NOT NULL DEFAULT 0,
      dirty_reason TEXT NOT NULL DEFAULT '',
      tail_signature TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS conversation_timeline_meta (
      conversation_id TEXT PRIMARY KEY NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      active_run_id TEXT NOT NULL DEFAULT '',
      awaiting_id TEXT,
      usage_label TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 0,
      next_order INTEGER NOT NULL DEFAULT 0,
      message_tail_signature TEXT NOT NULL DEFAULT '',
      persisted_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversation_timeline_nodes (
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      node_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      run_id TEXT NOT NULL DEFAULT '',
      order_index INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      payload_hash TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      PRIMARY KEY (conversation_id, node_id)
    );

    CREATE INDEX IF NOT EXISTS conversation_timeline_nodes_order_idx
      ON conversation_timeline_nodes(conversation_id, order_index);
  `);

  try {
    sqlite.execSync('ALTER TABLE conversations ADD COLUMN pinned_at INTEGER NOT NULL DEFAULT 0;');
  } catch (error) {
    ignoreDuplicateColumn(error);
  }

  try {
    sqlite.execSync('ALTER TABLE conversations ADD COLUMN agent_key TEXT;');
  } catch (error) {
    ignoreDuplicateColumn(error);
  }

  try {
    sqlite.execSync('ALTER TABLE conversations ADD COLUMN team_id TEXT;');
  } catch (error) {
    ignoreDuplicateColumn(error);
  }

  try {
    sqlite.execSync('ALTER TABLE conversations ADD COLUMN is_read INTEGER NOT NULL DEFAULT 1;');
  } catch (error) {
    ignoreDuplicateColumn(error);
  }

  try {
    sqlite.execSync('ALTER TABLE conversations ADD COLUMN read_at INTEGER;');
  } catch (error) {
    ignoreDuplicateColumn(error);
  }

  try {
    sqlite.execSync('ALTER TABLE conversations ADD COLUMN read_run_id TEXT;');
  } catch (error) {
    ignoreDuplicateColumn(error);
  }

  try {
    sqlite.execSync('ALTER TABLE conversations ADD COLUMN source_deleted INTEGER NOT NULL DEFAULT 0;');
  } catch (error) {
    ignoreDuplicateColumn(error);
  }

  try {
    sqlite.execSync('ALTER TABLE chat_directory_items ADD COLUMN latest_conversation_id TEXT;');
  } catch (error) {
    ignoreDuplicateColumn(error);
  }

  try {
    sqlite.execSync('ALTER TABLE chat_directory_items ADD COLUMN icon_name TEXT;');
  } catch (error) {
    ignoreDuplicateColumn(error);
  }

  try {
    sqlite.execSync('ALTER TABLE chat_directory_items ADD COLUMN icon_color TEXT;');
  } catch (error) {
    ignoreDuplicateColumn(error);
  }

  try {
    sqlite.execSync('ALTER TABLE chat_directory_items ADD COLUMN icon_uri TEXT;');
  } catch (error) {
    ignoreDuplicateColumn(error);
  }

  try {
    sqlite.execSync('ALTER TABLE chat_directory_items ADD COLUMN agent_mode TEXT;');
  } catch (error) {
    ignoreDuplicateColumn(error);
  }

  try {
    sqlite.execSync('ALTER TABLE chat_directory_items ADD COLUMN model_key TEXT;');
  } catch (error) {
    ignoreDuplicateColumn(error);
  }

  try {
    sqlite.execSync('ALTER TABLE chat_directory_items ADD COLUMN reasoning_effort TEXT;');
  } catch (error) {
    ignoreDuplicateColumn(error);
  }

  try {
    sqlite.execSync('ALTER TABLE outbox_messages ADD COLUMN planning_mode INTEGER NOT NULL DEFAULT 0;');
  } catch (error) {
    ignoreDuplicateColumn(error);
  }

  if (getDatabaseUserVersion() < READ_STATE_SCHEMA_VERSION) {
    sqlite.execSync(`
      BEGIN IMMEDIATE;

      DROP INDEX IF EXISTS conversations_updated_at_idx;
      DROP INDEX IF EXISTS conversations_home_order_idx;
      DROP INDEX IF EXISTS conversations_agent_updated_at_idx;
      DROP INDEX IF EXISTS conversations_team_updated_at_idx;
      DROP INDEX IF EXISTS conversations_agent_read_idx;
      DROP INDEX IF EXISTS conversations_team_read_idx;

      UPDATE conversations
      SET is_read = CASE WHEN unread_count > 0 THEN 0 ELSE 1 END,
          unread_count = CASE WHEN unread_count > 0 THEN 1 ELSE 0 END;

      PRAGMA user_version = ${READ_STATE_SCHEMA_VERSION};

      COMMIT;
    `);
  }

  if (getDatabaseUserVersion() < RICH_TIMELINE_SCHEMA_VERSION) {
    sqlite.execSync(`PRAGMA user_version = ${RICH_TIMELINE_SCHEMA_VERSION};`);
  }

  if (getDatabaseUserVersion() < CHAT_DIRECTORY_ICON_SCHEMA_VERSION) {
    sqlite.execSync(`PRAGMA user_version = ${CHAT_DIRECTORY_ICON_SCHEMA_VERSION};`);
  }

  if (getDatabaseUserVersion() < MESSAGE_ATTACHMENTS_SCHEMA_VERSION) {
    sqlite.execSync(`PRAGMA user_version = ${MESSAGE_ATTACHMENTS_SCHEMA_VERSION};`);
  }

  if (getDatabaseUserVersion() < CHAT_QUERY_INDEX_SCHEMA_VERSION) {
    sqlite.execSync(`
      DROP INDEX IF EXISTS conversations_agent_last_message_idx;
      DROP INDEX IF EXISTS conversations_team_last_message_idx;
      DROP INDEX IF EXISTS conversations_agent_draft_recency_idx;
      DROP INDEX IF EXISTS conversations_team_draft_recency_idx;
    `);
  }

  sqlite.execSync(`
    CREATE INDEX IF NOT EXISTS conversations_agent_recency_idx
      ON conversations(agent_key, last_message_at DESC, updated_at DESC, id ASC);

    CREATE INDEX IF NOT EXISTS conversations_team_recency_idx
      ON conversations(team_id, last_message_at DESC, updated_at DESC, id ASC);

    CREATE INDEX IF NOT EXISTS conversations_agent_non_empty_recency_idx
      ON conversations(agent_key, last_message_at DESC, updated_at DESC, id ASC)
      WHERE length(trim(last_message_text)) > 0;

    CREATE INDEX IF NOT EXISTS conversations_team_non_empty_recency_idx
      ON conversations(team_id, last_message_at DESC, updated_at DESC, id ASC)
      WHERE length(trim(last_message_text)) > 0;

    CREATE INDEX IF NOT EXISTS conversations_agent_non_empty_count_idx
      ON conversations(agent_key)
      WHERE length(trim(last_message_text)) > 0;

    CREATE INDEX IF NOT EXISTS conversations_team_non_empty_count_idx
      ON conversations(team_id)
      WHERE length(trim(last_message_text)) > 0;

    CREATE INDEX IF NOT EXISTS conversations_agent_read_idx
      ON conversations(agent_key, is_read);

    CREATE INDEX IF NOT EXISTS conversations_team_read_idx
      ON conversations(team_id, is_read);

    CREATE INDEX IF NOT EXISTS chat_directory_items_home_order_idx
      ON chat_directory_items(pinned_at DESC, sort_rank ASC, latest_conversation_id);

    CREATE INDEX IF NOT EXISTS chat_directory_items_agent_idx
      ON chat_directory_items(agent_key);

    CREATE INDEX IF NOT EXISTS chat_directory_items_team_idx
      ON chat_directory_items(team_id);

    CREATE INDEX IF NOT EXISTS chat_directory_items_stable_order_idx
      ON chat_directory_items(sort_rank ASC, id ASC);

    CREATE INDEX IF NOT EXISTS message_attachments_message_idx
      ON message_attachments(message_id, sort_order);

    CREATE INDEX IF NOT EXISTS message_attachments_conversation_idx
      ON message_attachments(conversation_id, created_at);

    CREATE INDEX IF NOT EXISTS message_attachments_client_message_idx
      ON message_attachments(client_message_id);

    CREATE INDEX IF NOT EXISTS outbox_messages_created_at_idx
      ON outbox_messages(created_at DESC, client_message_id);

    CREATE INDEX IF NOT EXISTS outbox_messages_conversation_idx
      ON outbox_messages(conversation_id);
  `);

  if (getDatabaseUserVersion() < CHAT_QUERY_INDEX_SCHEMA_VERSION) {
    sqlite.execSync(`PRAGMA user_version = ${CHAT_QUERY_INDEX_SCHEMA_VERSION};`);
  }

  if (getDatabaseUserVersion() < CHAT_DIRECTORY_MODEL_SETTINGS_SCHEMA_VERSION) {
    sqlite.execSync(`PRAGMA user_version = ${CHAT_DIRECTORY_MODEL_SETTINGS_SCHEMA_VERSION};`);
  }

  if (getDatabaseUserVersion() < SOURCE_DELETED_SCHEMA_VERSION) {
    sqlite.execSync(`PRAGMA user_version = ${SOURCE_DELETED_SCHEMA_VERSION};`);
  }

  initialized = true;
}
