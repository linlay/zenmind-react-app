import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const databaseSource = readFileSync(new URL('../../src/features/chatPersistence/database.ts', import.meta.url), 'utf8');
const repositorySource = readFileSync(
  new URL('../../src/features/chatPersistence/chatRepository.ts', import.meta.url),
  'utf8'
);

function extractSourceSection(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `Missing source marker: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `Missing source marker: ${endNeedle}`);
  return source.slice(start, end);
}

test('chat persistence database keeps query-shape indexes for hot paths', () => {
  [
    'conversations_agent_recency_idx',
    'conversations_agent_non_empty_recency_idx',
    'conversations_agent_non_empty_count_idx',
    'chat_directory_items_agent_idx',
    'chat_directory_items_stable_order_idx'
  ].forEach((indexName) => {
    assert.match(databaseSource, new RegExp(`CREATE INDEX IF NOT EXISTS ${indexName}\\b`));
  });

  assert.doesNotMatch(databaseSource, /CREATE INDEX IF NOT EXISTS conversations_agent_last_message_idx\b/);
  assert.doesNotMatch(databaseSource, /CREATE INDEX IF NOT EXISTS conversations_agent_draft_recency_idx\b/);
});

test('chat directory projection refresh stays batched by scope', () => {
  assert.match(repositorySource, /row_number\(\) OVER/);
  assert.match(repositorySource, /collectDirectoryProjectionChanges/);
  assert.doesNotMatch(repositorySource, /refreshAgentDirectoryProjection/);
  assert.doesNotMatch(repositorySource, /for \(const agentKey of agentKeys\)/);
});

test('chat persistence writes share the same title merge priority', () => {
  const ensureConversationSource = extractSourceSection(
    repositorySource,
    'async function ensureConversationRecord',
    'function normalizeMessageId'
  );
  const summaryPatchSource = extractSourceSection(
    repositorySource,
    'async function writeConversationSummaryPatch',
    'export async function patchConversationSummary'
  );
  const detailReconcileSource = extractSourceSection(
    repositorySource,
    'export async function replaceConversationProjection',
    'export async function markConversationDirty'
  );

  assert.match(ensureConversationSource, /resolveChatConversationStoredTitle\(title, existing\.title\)/);
  assert.match(ensureConversationSource, /const fallbackTitle = resolveChatConversationStoredTitle\(title\)/);
  assert.doesNotMatch(ensureConversationSource, /Conversation \$\{/);
  assert.match(
    summaryPatchSource,
    /resolveChatConversationStoredTitle\(\s*patch\.title,\s*current\?\.title \|\| ensured\.title\s*\)/
  );
  assert.match(detailReconcileSource, /ensureConversationRecord\(conversationId, summaryTime, input\.title\)/);
  assert.match(detailReconcileSource, /ensureConversationRecord/);
});

test('chat history uses indexed non-empty summaries and skips local empty drafts', () => {
  const historySource = extractSourceSection(
    repositorySource,
    'export async function getConversationHistorySlice',
    'export async function getConversationDetail'
  );

  assert.match(repositorySource, /CONVERSATION_HISTORY_VISIBLE_FILTER/);
  assert.match(
    repositorySource,
    /CONVERSATION_HISTORY_VISIBLE_FILTER = sql<boolean>`length\(trim\(\$\{conversations\.lastMessageText\}\)\) > 0`/
  );
  assert.match(historySource, /const historyWhereClause = and\(whereClause, CONVERSATION_HISTORY_VISIBLE_FILTER\)/);
  assert.match(historySource, /\.where\(historyWhereClause\)/);
  assert.match(historySource, /\.where\(and\(historyWhereClause, eq\(conversations\.isRead, 0\)\)\)/);
  assert.doesNotMatch(historySource, /\.from\(messages\)/);
  assert.doesNotMatch(historySource, /getConversationMessages/);
});

test('chat home replacement merges titles in its existing batched read and transaction', () => {
  const replaceHomeSource = extractSourceSection(
    repositorySource,
    'export async function replaceChatHomeProjection',
    'export async function refreshChatDirectorySnapshot'
  );

  assert.match(replaceHomeSource, /title: conversations\.title/);
  assert.match(replaceHomeSource, /const existingConversationById = new Map/);
  assert.match(replaceHomeSource, /title: resolveChatConversationStoredTitle\(item\.title, existing\?\.title\)/);
  assert.doesNotMatch(replaceHomeSource, /\.from\(messages\)/);
  assert.doesNotMatch(replaceHomeSource, /getConversationMessages/);
});

test('home refresh retains a first local message until the server supplies a last-run answer', async () => {
  const source = extractSourceSection(
    repositorySource,
    'export async function replaceChatHomeProjection',
    'export async function refreshChatDirectorySnapshot'
  ).replace('export ', '');
  const code = ts.transpileModule(`${source}; replaceChatHomeProjection`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText;
  for (const [localText, remoteText, expected] of [
    ['first question', '', 'first question'],
    ['first question', 'server answer', 'server answer'],
    ['', '', '']
  ]) {
    const row = { id: 'chat', title: 'Question', lastMessageText: localText };
    const conversations = { id: 'id', title: 'title', lastMessageText: 'lastMessageText' };
    const directory = { id: 'id' };
    let snapshots = 0;
    const tx = {
      select: (fields: Record<string, unknown>) => ({
        from: () => ({
          where: () => ({
            all: () => [Object.fromEntries(Object.keys(fields).map((key) => [key, row[key as keyof typeof row]]))]
          }),
          all: () => [{ id: 'agent' }]
        })
      }),
      update: (table: unknown) => ({
        set: (values: unknown) => ({
          where: () => ({ run: () => table === conversations && Object.assign(row, values) })
        })
      }),
      delete: () => ({ where: () => ({ run() {} }) })
    };
    const replace = vm.runInNewContext(code, {
      conversations,
      chatDirectoryItems: directory,
      chatDb: { transaction: (write: (value: unknown) => void) => write(tx) },
      getChatCacheScopeId: () => 'scope',
      ensureChatDatabase: async () => {},
      awaitInChatScope: async (value: unknown) => value,
      normalizeConversationSummaryProjection: (value: unknown) => value,
      normalizeChatDirectoryItem: (value: unknown) => value,
      normalizeChatReadPatch: () => null,
      mapConversationReadState: () => ({ isRead: true }),
      normalizeChatReadState: () => ({ isRead: true }),
      readStateToUnreadBit: () => 0,
      resolveChatConversationStoredTitle: (title: string, existing: string) => title || existing,
      inArray() {},
      notInArray() {},
      eq() {},
      refreshChatDirectorySnapshot: async () => {
        snapshots++;
      }
    });
    await replace({
      conversationSummaries: [{ conversationId: 'chat', lastMessageText: remoteText, lastMessageAt: 100 }],
      directoryItems: [{ id: 'agent', agentKey: 'root' }]
    });
    assert.equal(row.lastMessageText, expected);
    assert.equal(snapshots, 1);
  }
});

test('chat directory search stays scoped to directory summaries', () => {
  const searchSource = extractSourceSection(
    repositorySource,
    'export async function searchChatDirectoryItems',
    'export async function markConversationSourceDeleted'
  );

  assert.match(searchSource, /getChatDirectorySearchTokens/);
  assert.match(
    searchSource,
    /\.leftJoin\(conversations, eq\(chatDirectoryItems\.latestConversationId, conversations\.id\)\)/
  );
  assert.match(searchSource, /\.limit\(safePageSize \+ 1\)/);
  assert.match(searchSource, /rows\.slice\(0, safePageSize\)/);
  assert.doesNotMatch(searchSource, /\.from\(messages\)/);
  assert.doesNotMatch(searchSource, /count\(\)/);
});

test('chat directory open target keeps timeline probes bounded', () => {
  const resolverSource = extractSourceSection(
    repositorySource,
    'export async function resolveDirectoryItemConversationOpenTarget',
    'export async function createConversationForDirectoryItem'
  );
  const tailProbeSource = extractSourceSection(
    repositorySource,
    'async function isPersistedTimelineTailActive',
    'async function getOpenableLatestConversation'
  );

  assert.match(resolverSource, /getOpenableLatestConversation/);
  assert.match(resolverSource, /createLocalConversationForHistoryScope/);
  assert.doesNotMatch(resolverSource, /getReusableDraftConversation/);
  assert.doesNotMatch(resolverSource, /lastMessageText/);
  assert.doesNotMatch(resolverSource, /getConversationInitialTimelineState/);
  assert.doesNotMatch(resolverSource, /getConversationMessages/);
  assert.match(tailProbeSource, /orderBy\(desc\(conversationTimelineNodes\.orderIndex\)\)/);
  assert.match(tailProbeSource, /\.limit\(1\)/);
  assert.doesNotMatch(tailProbeSource, /orderBy\(asc\(conversationTimelineNodes\.orderIndex\)\)/);
});
