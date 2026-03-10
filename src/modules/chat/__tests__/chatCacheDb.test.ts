type ChatRow = {
  ACCOUNT_ID_: string;
  CHAT_ID_: string;
  CHAT_NAME_: string;
  AGENT_KEY_: string;
  TEAM_ID_?: string;
  CREATED_AT_: number;
  UPDATED_AT_: number;
  LAST_RUN_ID_: string;
  LAST_RUN_CONTENT_: string;
  READ_STATUS_: number;
  READ_AT_: number | null;
  CHAT_IMAGE_TOKEN_?: string;
  EVENTS_JSON_?: string;
  DETAIL_UPDATED_AT_?: number | null;
};

type FakeDb = {
  columns: Set<string>;
  rows: Map<string, ChatRow>;
  execAsync: jest.Mock<Promise<void>, [string]>;
  getAllAsync: jest.Mock<Promise<Array<Record<string, unknown>>>, [string, unknown?]>;
  getFirstAsync: jest.Mock<Promise<Record<string, unknown> | null>, [string, unknown?]>;
  runAsync: jest.Mock<Promise<void>, [string, unknown?]>;
  withTransactionAsync: jest.Mock<Promise<void>, [() => Promise<void>]>;
};

const mockOpenDatabaseAsync = jest.fn();

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: (...args: unknown[]) => mockOpenDatabaseAsync(...args)
}));

function buildRowKey(accountId: string, chatId: string) {
  return `${accountId}::${chatId}`;
}

function createFakeDb(): FakeDb {
  const columns = new Set([
    'ACCOUNT_ID_',
    'CHAT_ID_',
    'CHAT_NAME_',
    'AGENT_KEY_',
    'TEAM_ID_',
    'CREATED_AT_',
    'UPDATED_AT_',
    'LAST_RUN_ID_',
    'LAST_RUN_CONTENT_',
    'READ_STATUS_',
    'READ_AT_',
    'CHAT_IMAGE_TOKEN_',
    'EVENTS_JSON_',
    'DETAIL_UPDATED_AT_'
  ]);
  const rows = new Map<string, ChatRow>();

  const db: FakeDb = {
    columns,
    rows,
    execAsync: jest.fn(async (_sql: string) => {}),
    getAllAsync: jest.fn(async (sql: string, rawParams?: unknown) => {
      if (/PRAGMA\s+table_info\(CHATS\)/i.test(sql)) {
        return Array.from(columns.values()).map((name) => ({ name }));
      }

      if (/FROM\s+CHATS/i.test(sql)) {
        const params = Array.isArray(rawParams) ? rawParams : [];
        const accountId = String(params[0] || '');
        return Array.from(rows.values())
          .filter((item) => item.ACCOUNT_ID_ === accountId)
          .sort((a, b) => Number(b.UPDATED_AT_ || 0) - Number(a.UPDATED_AT_ || 0))
          .map((item) => ({ ...item }));
      }

      return [];
    }),
    getFirstAsync: jest.fn(async (sql: string, rawParams?: unknown) => {
      const params = Array.isArray(rawParams) ? rawParams : [];
      if (/MAX\(LAST_RUN_ID_\)/i.test(sql)) {
        const accountId = String(params[0] || '');
        const max = Array.from(rows.values())
          .filter((item) => item.ACCOUNT_ID_ === accountId)
          .map((item) => String(item.LAST_RUN_ID_ || ''))
          .sort()
          .pop();
        return { maxLastRunId: max || '' };
      }

      if (/FROM\s+CHATS/i.test(sql) && /WHERE\s+ACCOUNT_ID_\s*=\s*\?/i.test(sql) && /CHAT_ID_\s*=\s*\?/i.test(sql)) {
        const accountId = String(params[0] || '');
        const chatId = String(params[1] || '');
        const found = rows.get(buildRowKey(accountId, chatId));
        return found ? { ...found } : null;
      }

      return null;
    }),
    runAsync: jest.fn(async (sql: string, rawParams?: unknown) => {
      const params = Array.isArray(rawParams) ? rawParams : [];

      if (
        /INSERT\s+INTO\s+CHATS/i.test(sql) &&
        /ON\s+CONFLICT\(ACCOUNT_ID_,\s*CHAT_ID_\)\s+DO\s+UPDATE/i.test(sql) &&
        /LAST_RUN_CONTENT_/i.test(sql)
      ) {
        const [accountId, chatId, chatName, agentKey, teamId, createdAt, updatedAt, lastRunId, lastRunContent, readStatus, readAt] =
          params;
        const key = buildRowKey(String(accountId || ''), String(chatId || ''));
        const previous = rows.get(key);
        rows.set(key, {
          ACCOUNT_ID_: String(accountId || ''),
          CHAT_ID_: String(chatId || ''),
          CHAT_NAME_: String(chatName || ''),
          AGENT_KEY_: String(agentKey || ''),
          TEAM_ID_: String(teamId || ''),
          CREATED_AT_: Number(createdAt || 0),
          UPDATED_AT_: Number(updatedAt || 0),
          LAST_RUN_ID_: String(lastRunId || ''),
          LAST_RUN_CONTENT_: String(lastRunContent || ''),
          READ_STATUS_: Number(readStatus || 0),
          READ_AT_: readAt == null ? null : Number(readAt),
          CHAT_IMAGE_TOKEN_: previous?.CHAT_IMAGE_TOKEN_ || '',
          EVENTS_JSON_: previous?.EVENTS_JSON_ || '[]',
          DETAIL_UPDATED_AT_: previous?.DETAIL_UPDATED_AT_ ?? null
        });
        return;
      }

      if (/INSERT\s+OR\s+IGNORE\s+INTO\s+CHATS/i.test(sql)) {
        const [accountId, chatId, chatName, agentKey, createdAt, updatedAt, lastRunId, lastRunContent, readStatus, readAt] =
          params;
        const key = buildRowKey(String(accountId || ''), String(chatId || ''));
        if (!rows.has(key)) {
          rows.set(key, {
            ACCOUNT_ID_: String(accountId || ''),
            CHAT_ID_: String(chatId || ''),
            CHAT_NAME_: String(chatName || ''),
            AGENT_KEY_: String(agentKey || ''),
            TEAM_ID_: '',
            CREATED_AT_: Number(createdAt || 0),
            UPDATED_AT_: Number(updatedAt || 0),
            LAST_RUN_ID_: String(lastRunId || ''),
            LAST_RUN_CONTENT_: String(lastRunContent || ''),
            READ_STATUS_: Number(readStatus || 0),
            READ_AT_: readAt == null ? null : Number(readAt),
            CHAT_IMAGE_TOKEN_: '',
            EVENTS_JSON_: '[]',
            DETAIL_UPDATED_AT_: null
          });
        }
        return;
      }

      if (/UPDATE\s+CHATS/i.test(sql) && /EVENTS_JSON_/i.test(sql)) {
        const [chatName, chatImageToken, eventsJson, detailUpdatedAt, accountId, chatId] = params;
        const key = buildRowKey(String(accountId || ''), String(chatId || ''));
        const current = rows.get(key);
        if (!current) return;
        rows.set(key, {
          ...current,
          CHAT_NAME_: String(chatName || current.CHAT_NAME_),
          CHAT_IMAGE_TOKEN_: String(chatImageToken || ''),
          EVENTS_JSON_: String(eventsJson || '[]'),
          DETAIL_UPDATED_AT_: detailUpdatedAt == null ? null : Number(detailUpdatedAt)
        });
        return;
      }

      if (/UPDATE\s+CHATS/i.test(sql) && /READ_STATUS_/i.test(sql)) {
        const [readStatus, readAt, accountId, chatId] = params;
        const key = buildRowKey(String(accountId || ''), String(chatId || ''));
        const current = rows.get(key);
        if (!current) return;
        rows.set(key, {
          ...current,
          READ_STATUS_: Number(readStatus || 0),
          READ_AT_: readAt == null ? null : Number(readAt)
        });
      }
    }),
    withTransactionAsync: jest.fn(async (task: () => Promise<void>) => {
      await task();
    })
  };

  return db;
}

describe('chatCacheDb', () => {
  let db: FakeDb;

  beforeEach(() => {
    jest.resetModules();
    db = createFakeDb();
    mockOpenDatabaseAsync.mockReset();
    mockOpenDatabaseAsync.mockResolvedValue(db);
  });

  it('initializes account-scoped chat cache schema', async () => {
    const mod = require('../services/chatCacheDb');
    await mod.initChatCacheDb();

    expect(db.columns.has('ACCOUNT_ID_')).toBe(true);
    expect(db.columns.has('CHAT_IMAGE_TOKEN_')).toBe(true);
    expect(db.columns.has('EVENTS_JSON_')).toBe(true);
    expect(db.columns.has('DETAIL_UPDATED_AT_')).toBe(true);
  });

  it('isolates summaries and max lastRunId by account', async () => {
    const mod = require('../services/chatCacheDb');

    await mod.upsertChatSummaries('acct-a', [
      {
        chatId: 'chat-1',
        chatName: '会话一',
        firstAgentKey: 'agent-a',
        createdAt: 1700000000000,
        updatedAt: 1700000001000,
        lastRunId: '0012',
        lastRunContent: 'hello',
        readStatus: 0,
        readAt: null
      }
    ] as any);

    await mod.upsertChatSummaries('acct-b', [
      {
        chatId: 'chat-1',
        chatName: '其他账号会话',
        firstAgentKey: 'agent-b',
        createdAt: 1700000000000,
        updatedAt: 1700000003000,
        lastRunId: '0015',
        lastRunContent: 'world',
        readStatus: 1,
        readAt: 1700000003000
      }
    ] as any);

    const listA = await mod.listCachedChats('acct-a');
    const listB = await mod.listCachedChats('acct-b');

    expect(listA).toHaveLength(1);
    expect(listA[0].chatName).toBe('会话一');
    expect(listB).toHaveLength(1);
    expect(listB[0].chatName).toBe('其他账号会话');
    expect(await mod.getMaxLastRunId('acct-a')).toBe('0012');
    expect(await mod.getMaxLastRunId('acct-b')).toBe('0015');
  });

  it('stores and loads detail payload per account', async () => {
    const mod = require('../services/chatCacheDb');
    await mod.upsertChatSummaries('acct-a', [
      {
        chatId: 'chat-1',
        chatName: '会话一',
        firstAgentKey: 'agent-a',
        createdAt: 1700000000000,
        updatedAt: 1700000001000,
        lastRunId: '0012',
        lastRunContent: 'hello'
      }
    ] as any);

    await mod.upsertChatDetail('acct-a', {
      chatId: 'chat-1',
      chatName: '会话一',
      chatImageToken: 'token-abc',
      events: [{ type: 'content.snapshot', text: 'cached detail' }],
      detailUpdatedAt: 1700000003333
    });

    const detail = await mod.getCachedChatDetail('acct-a', 'chat-1');
    expect(detail?.chatImageToken).toBe('token-abc');
    expect(detail?.events).toEqual([{ type: 'content.snapshot', text: 'cached detail' }]);
    expect(detail?.detailUpdatedAt).toBe(1700000003333);
    expect(await mod.getCachedChatDetail('acct-b', 'chat-1')).toBeNull();
  });

  it('marks chat as read locally per account', async () => {
    const mod = require('../services/chatCacheDb');
    await mod.upsertChatSummaries('acct-a', [
      {
        chatId: 'chat-1',
        chatName: '会话一',
        firstAgentKey: 'agent-a',
        createdAt: 1700000000000,
        updatedAt: 1700000001000,
        lastRunId: '0012',
        lastRunContent: 'hello',
        readStatus: 0,
        readAt: null
      }
    ] as any);

    await mod.markChatReadLocal('acct-a', 'chat-1', { readStatus: 1, readAt: 1700000009999 });

    const list = await mod.listCachedChats('acct-a');
    const chat = list.find((item) => item.chatId === 'chat-1');
    expect(chat?.readStatus).toBe(1);
    expect(chat?.readAt).toBe(1700000009999);
  });
});
