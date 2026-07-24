import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const databaseSource = readFileSync(
  new URL('../../src/features/chatPersistence/database.ts', import.meta.url),
  'utf8'
);
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
    'conversations_team_recency_idx',
    'conversations_agent_non_empty_recency_idx',
    'conversations_team_non_empty_recency_idx',
    'conversations_agent_non_empty_count_idx',
    'conversations_team_non_empty_count_idx',
    'chat_directory_items_agent_idx',
    'chat_directory_items_team_idx',
    'chat_directory_items_stable_order_idx',
    'outbox_messages_created_at_idx',
    'outbox_messages_conversation_idx',
  ].forEach((indexName) => {
    assert.match(databaseSource, new RegExp(`CREATE INDEX IF NOT EXISTS ${indexName}\\b`));
  });

  assert.doesNotMatch(
    databaseSource,
    /CREATE INDEX IF NOT EXISTS conversations_agent_last_message_idx\b/
  );
  assert.doesNotMatch(
    databaseSource,
    /CREATE INDEX IF NOT EXISTS conversations_team_last_message_idx\b/
  );
  assert.doesNotMatch(
    databaseSource,
    /CREATE INDEX IF NOT EXISTS conversations_agent_draft_recency_idx\b/
  );
  assert.doesNotMatch(
    databaseSource,
    /CREATE INDEX IF NOT EXISTS conversations_team_draft_recency_idx\b/
  );
  assert.doesNotMatch(databaseSource, /outbox_messages_planning_mode_idx\b/);
});

test('chat outbox keeps planning mode replayable without new query shape', () => {
  const replaceProjectionSource = extractSourceSection(
    repositorySource,
    'export async function replaceConversationProjection',
    'export async function markConversationDirty'
  );
  const planningModeLookupSource = extractSourceSection(
    replaceProjectionSource,
    'const currentOutboxRows =',
    'const currentOutboxPlanningModeByClientId'
  );
  const createOutgoingSource = extractSourceSection(
    repositorySource,
    'export async function createOutgoingMessage',
    'export async function getPendingOutboxMessages'
  );
  const pendingOutboxSource = extractSourceSection(
    repositorySource,
    'export async function getPendingOutboxMessages',
    'export async function getPendingOutboxCount'
  );

  assert.match(databaseSource, /planning_mode INTEGER NOT NULL DEFAULT 0/);
  assert.match(createOutgoingSource, /planningMode: options\.planningMode === true \? 1 : 0/);
  assert.match(pendingOutboxSource, /planningMode: outboxMessages\.planningMode/);
  assert.match(pendingOutboxSource, /planningMode: Number\(row\.planningMode\) === 1/);
  assert.match(planningModeLookupSource, /inArray\(outboxMessages\.clientMessageId/);
  assert.doesNotMatch(
    planningModeLookupSource,
    /where\(eq\(outboxMessages\.conversationId, conversationId\)\)/
  );
});

test('chat directory projection refresh stays batched by scope', () => {
  assert.match(repositorySource, /row_number\(\) OVER/);
  assert.match(repositorySource, /collectDirectoryProjectionChanges/);
  assert.doesNotMatch(repositorySource, /refreshAgentDirectoryProjection/);
  assert.doesNotMatch(repositorySource, /refreshTeamDirectoryProjection/);
  assert.doesNotMatch(repositorySource, /for \(const agentKey of agentKeys\)/);
  assert.doesNotMatch(repositorySource, /for \(const teamId of teamIds\)/);
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

  assert.match(
    ensureConversationSource,
    /resolveChatConversationStoredTitle\(title, existing\.title\)/
  );
  assert.match(
    ensureConversationSource,
    /const fallbackTitle = resolveChatConversationStoredTitle\(title\)/
  );
  assert.doesNotMatch(ensureConversationSource, /Conversation \$\{/);
  assert.match(
    summaryPatchSource,
    /resolveChatConversationStoredTitle\(\s*patch\.title,\s*current\?\.title \|\| ensured\.title\s*\)/
  );
  assert.match(
    detailReconcileSource,
    /ensureConversationRecord\(conversationId, summaryTime, input\.title\)/
  );
  assert.equal(detailReconcileSource.match(/title: conversation\.title/g)?.length, 2);
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
  assert.match(
    replaceHomeSource,
    /title: resolveChatConversationStoredTitle\(item\.title, existing\?\.title\)/
  );
  assert.doesNotMatch(replaceHomeSource, /\.from\(messages\)/);
  assert.doesNotMatch(replaceHomeSource, /getConversationMessages/);
});

test('chat directory search stays scoped to directory summaries', () => {
  const searchSource = extractSourceSection(
    repositorySource,
    'export async function searchChatDirectoryItems',
    'export async function removeConversation'
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
