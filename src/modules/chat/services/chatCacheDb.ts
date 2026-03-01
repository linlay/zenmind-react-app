import * as SQLite from 'expo-sqlite';
import { ChatSummary } from '../../../core/types/common';

const DATABASE_NAME = 'zenmind_chat_cache.db';
const UNKNOWN_AGENT_KEY = '__unknown_agent__';

const CREATE_CHATS_SQL = `
CREATE TABLE IF NOT EXISTS CHATS (
  CHAT_ID_ TEXT PRIMARY KEY,
  CHAT_NAME_ TEXT NOT NULL,
  AGENT_KEY_ TEXT NOT NULL,
  CREATED_AT_ INTEGER NOT NULL,
  UPDATED_AT_ INTEGER NOT NULL,
  LAST_RUN_ID_ VARCHAR(12) NOT NULL,
  LAST_RUN_CONTENT_ TEXT NOT NULL DEFAULT '',
  READ_STATUS_ INTEGER NOT NULL DEFAULT 1,
  READ_AT_ INTEGER
)
`;

const CREATE_CHATS_LAST_RUN_ID_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS IDX_CHATS_LAST_RUN_ID_
ON CHATS(LAST_RUN_ID_)
`;

const CHAT_EXTENSION_COLUMNS: Array<{ name: string; sql: string }> = [
  { name: 'CHAT_IMAGE_TOKEN_', sql: "ALTER TABLE CHATS ADD COLUMN CHAT_IMAGE_TOKEN_ TEXT NOT NULL DEFAULT ''" },
  { name: 'EVENTS_JSON_', sql: "ALTER TABLE CHATS ADD COLUMN EVENTS_JSON_ TEXT NOT NULL DEFAULT '[]'" },
  { name: 'DETAIL_UPDATED_AT_', sql: 'ALTER TABLE CHATS ADD COLUMN DETAIL_UPDATED_AT_ INTEGER' }
];

interface ChatRow {
  CHAT_ID_: string;
  CHAT_NAME_: string;
  AGENT_KEY_: string;
  CREATED_AT_: number;
  UPDATED_AT_: number;
  LAST_RUN_ID_: string;
  LAST_RUN_CONTENT_: string;
  READ_STATUS_: number;
  READ_AT_: number | null;
  CHAT_IMAGE_TOKEN_?: string;
  EVENTS_JSON_?: string;
  DETAIL_UPDATED_AT_?: number | null;
}

export interface CachedChatDetail {
  chatId: string;
  chatName: string;
  chatImageToken: string;
  events: Record<string, unknown>[];
  detailUpdatedAt: number | null;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function toTimestampMs(input: unknown, fallback: number): number {
  if (input === null || input === undefined || input === '') {
    return fallback;
  }

  const numeric = typeof input === 'number' ? input : Number(input);
  if (Number.isFinite(numeric)) {
    if (Math.abs(numeric) < 1_000_000_000_000 && Math.abs(numeric) > 0) {
      return Math.trunc(numeric * 1000);
    }
    return Math.trunc(numeric);
  }

  const dateValue = Date.parse(String(input));
  if (Number.isFinite(dateValue)) {
    return Math.trunc(dateValue);
  }

  return fallback;
}

function normalizeReadStatus(input: unknown): number {
  const value = Number(input);
  if (Number.isFinite(value)) {
    return value === 0 ? 0 : 1;
  }
  return 1;
}

function toNullableTimestampMs(input: unknown): number | null {
  if (input === null || input === undefined || input === '') {
    return null;
  }
  return toTimestampMs(input, Date.now());
}

function normalizeSummary(input: ChatSummary): ChatSummary {
  if (!input || typeof input !== 'object') {
    return {};
  }

  const chatId = String(input.chatId || '').trim();
  const chatName = String(input.chatName || input.title || chatId || '').trim();
  const agentKey = String(input.firstAgentKey || input.agentKey || '').trim() || UNKNOWN_AGENT_KEY;

  const createdAt = toTimestampMs(input.createdAt, Date.now());
  const updatedAt = toTimestampMs(input.updatedAt, createdAt);
  const readStatus = normalizeReadStatus(input.readStatus);
  const readAt = toNullableTimestampMs(input.readAt);

  return {
    ...input,
    chatId,
    chatName,
    agentKey,
    firstAgentKey: agentKey,
    createdAt,
    updatedAt,
    lastRunId: String(input.lastRunId || '').trim(),
    lastRunContent: String(input.lastRunContent || '').trim(),
    readStatus,
    readAt
  };
}

function mapRowToChatSummary(row: ChatRow): ChatSummary {
  return {
    chatId: String(row.CHAT_ID_ || ''),
    chatName: String(row.CHAT_NAME_ || ''),
    title: String(row.CHAT_NAME_ || ''),
    agentKey: String(row.AGENT_KEY_ || ''),
    firstAgentKey: String(row.AGENT_KEY_ || ''),
    createdAt: Number(row.CREATED_AT_ || 0),
    updatedAt: Number(row.UPDATED_AT_ || 0),
    lastRunId: String(row.LAST_RUN_ID_ || ''),
    lastRunContent: String(row.LAST_RUN_CONTENT_ || ''),
    readStatus: normalizeReadStatus(row.READ_STATUS_),
    readAt: row.READ_AT_ == null ? null : Number(row.READ_AT_),
    chatImageToken: String(row.CHAT_IMAGE_TOKEN_ || '')
  };
}

async function openDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (db) => {
      await db.execAsync(CREATE_CHATS_SQL);
      await db.execAsync(CREATE_CHATS_LAST_RUN_ID_INDEX_SQL);

      const columns = await db.getAllAsync<{ name?: string }>('PRAGMA table_info(CHATS)');
      const existing = new Set(columns.map((item) => String(item?.name || '').trim().toUpperCase()));

      for (const extension of CHAT_EXTENSION_COLUMNS) {
        if (existing.has(extension.name)) {
          continue;
        }
        await db.execAsync(extension.sql);
      }

      return db;
    });
  }
  return dbPromise;
}

export async function initChatCacheDb(): Promise<void> {
  await openDb();
}

export async function listCachedChats(): Promise<ChatSummary[]> {
  const db = await openDb();
  const rows = await db.getAllAsync<ChatRow>(
    `SELECT
      CHAT_ID_,
      CHAT_NAME_,
      AGENT_KEY_,
      CREATED_AT_,
      UPDATED_AT_,
      LAST_RUN_ID_,
      LAST_RUN_CONTENT_,
      READ_STATUS_,
      READ_AT_,
      CHAT_IMAGE_TOKEN_,
      EVENTS_JSON_,
      DETAIL_UPDATED_AT_
    FROM CHATS
    ORDER BY UPDATED_AT_ DESC`
  );

  return rows.map((row) => mapRowToChatSummary(row));
}

export async function getMaxLastRunId(): Promise<string> {
  const db = await openDb();
  const row = await db.getFirstAsync<{ maxLastRunId?: string }>(
    'SELECT MAX(LAST_RUN_ID_) AS maxLastRunId FROM CHATS'
  );
  return String(row?.maxLastRunId || '').trim();
}

export async function upsertChatSummaries(input: ChatSummary[]): Promise<void> {
  const list = Array.isArray(input) ? input.map((item) => normalizeSummary(item)).filter((item) => item.chatId) : [];
  if (!list.length) {
    return;
  }

  const db = await openDb();
  await db.withTransactionAsync(async () => {
    for (const item of list) {
      await db.runAsync(
        `INSERT INTO CHATS (
          CHAT_ID_,
          CHAT_NAME_,
          AGENT_KEY_,
          CREATED_AT_,
          UPDATED_AT_,
          LAST_RUN_ID_,
          LAST_RUN_CONTENT_,
          READ_STATUS_,
          READ_AT_
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(CHAT_ID_) DO UPDATE SET
          CHAT_NAME_ = excluded.CHAT_NAME_,
          AGENT_KEY_ = excluded.AGENT_KEY_,
          CREATED_AT_ = excluded.CREATED_AT_,
          UPDATED_AT_ = excluded.UPDATED_AT_,
          LAST_RUN_ID_ = excluded.LAST_RUN_ID_,
          LAST_RUN_CONTENT_ = excluded.LAST_RUN_CONTENT_,
          READ_STATUS_ = excluded.READ_STATUS_,
          READ_AT_ = excluded.READ_AT_`,
        [
          String(item.chatId || ''),
          String(item.chatName || item.title || item.chatId || ''),
          String(item.firstAgentKey || item.agentKey || UNKNOWN_AGENT_KEY),
          toTimestampMs(item.createdAt, Date.now()),
          toTimestampMs(item.updatedAt, Date.now()),
          String(item.lastRunId || ''),
          String(item.lastRunContent || ''),
          normalizeReadStatus(item.readStatus),
          toNullableTimestampMs(item.readAt)
        ]
      );
    }
  });
}

export async function upsertChatDetail(payload: {
  chatId: string;
  chatName?: string;
  chatImageToken?: string;
  events?: Record<string, unknown>[];
  detailUpdatedAt?: number;
}): Promise<void> {
  const chatId = String(payload.chatId || '').trim();
  if (!chatId) {
    return;
  }

  const now = Date.now();
  const chatName = String(payload.chatName || '').trim() || chatId;
  const detailUpdatedAt = Number.isFinite(payload.detailUpdatedAt) ? Number(payload.detailUpdatedAt) : now;

  const eventsJson = (() => {
    try {
      return JSON.stringify(Array.isArray(payload.events) ? payload.events : []);
    } catch {
      return '[]';
    }
  })();

  const db = await openDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR IGNORE INTO CHATS (
        CHAT_ID_,
        CHAT_NAME_,
        AGENT_KEY_,
        CREATED_AT_,
        UPDATED_AT_,
        LAST_RUN_ID_,
        LAST_RUN_CONTENT_,
        READ_STATUS_,
        READ_AT_
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [chatId, chatName, UNKNOWN_AGENT_KEY, now, now, '', '', 1, null]
    );

    await db.runAsync(
      `UPDATE CHATS
      SET CHAT_NAME_ = ?,
          CHAT_IMAGE_TOKEN_ = ?,
          EVENTS_JSON_ = ?,
          DETAIL_UPDATED_AT_ = ?
      WHERE CHAT_ID_ = ?`,
      [chatName, String(payload.chatImageToken || ''), eventsJson, detailUpdatedAt, chatId]
    );
  });
}

export async function getCachedChatDetail(chatIdInput: string): Promise<CachedChatDetail | null> {
  const chatId = String(chatIdInput || '').trim();
  if (!chatId) {
    return null;
  }

  const db = await openDb();
  const row = await db.getFirstAsync<ChatRow>(
    `SELECT
      CHAT_ID_,
      CHAT_NAME_,
      CHAT_IMAGE_TOKEN_,
      EVENTS_JSON_,
      DETAIL_UPDATED_AT_
    FROM CHATS
    WHERE CHAT_ID_ = ?
    LIMIT 1`,
    [chatId]
  );

  if (!row) {
    return null;
  }

  const events = (() => {
    const raw = String(row.EVENTS_JSON_ || '').trim();
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
    } catch {
      return [];
    }
  })();

  return {
    chatId: String(row.CHAT_ID_ || chatId),
    chatName: String(row.CHAT_NAME_ || ''),
    chatImageToken: String(row.CHAT_IMAGE_TOKEN_ || ''),
    events,
    detailUpdatedAt: row.DETAIL_UPDATED_AT_ == null ? null : Number(row.DETAIL_UPDATED_AT_)
  };
}

export async function markChatReadLocal(
  chatIdInput: string,
  options?: { readStatus?: number; readAt?: string | number | null }
): Promise<void> {
  const chatId = String(chatIdInput || '').trim();
  if (!chatId) {
    return;
  }

  const now = Date.now();
  const readStatus = normalizeReadStatus(options?.readStatus);
  const readAt = options?.readAt === null
    ? null
    : toNullableTimestampMs(options?.readAt) ?? now;

  const db = await openDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR IGNORE INTO CHATS (
        CHAT_ID_,
        CHAT_NAME_,
        AGENT_KEY_,
        CREATED_AT_,
        UPDATED_AT_,
        LAST_RUN_ID_,
        LAST_RUN_CONTENT_,
        READ_STATUS_,
        READ_AT_
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [chatId, chatId, UNKNOWN_AGENT_KEY, now, now, '', '', readStatus, readAt]
    );

    await db.runAsync(
      `UPDATE CHATS
      SET READ_STATUS_ = ?,
          READ_AT_ = ?
      WHERE CHAT_ID_ = ?`,
      [readStatus, readAt, chatId]
    );
  });
}
