import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';

const sqlite = openDatabaseSync('zenmind-chat-demo.db', { enableChangeListener: true });

export const chatDb = drizzle(sqlite, { schema });

const READ_STATE_SCHEMA_VERSION = 1;
const RICH_TIMELINE_SCHEMA_VERSION = 2;
const CHAT_DIRECTORY_ICON_SCHEMA_VERSION = 3;
const MESSAGE_ATTACHMENTS_SCHEMA_VERSION = 4;
const CHAT_QUERY_INDEX_SCHEMA_VERSION = 5;
let initialized = false;

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
      team_id TEXT
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

  initialized = true;
}
