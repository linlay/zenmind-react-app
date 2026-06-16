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
});

test('chat directory projection refresh stays batched by scope', () => {
  assert.match(repositorySource, /row_number\(\) OVER/);
  assert.match(repositorySource, /collectDirectoryProjectionChanges/);
  assert.doesNotMatch(repositorySource, /refreshAgentDirectoryProjection/);
  assert.doesNotMatch(repositorySource, /refreshTeamDirectoryProjection/);
  assert.doesNotMatch(repositorySource, /for \(const agentKey of agentKeys\)/);
  assert.doesNotMatch(repositorySource, /for \(const teamId of teamIds\)/);
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
