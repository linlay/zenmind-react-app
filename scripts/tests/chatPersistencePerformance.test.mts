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
});

test('chat directory projection refresh stays batched by scope', () => {
  assert.match(repositorySource, /row_number\(\) OVER/);
  assert.match(repositorySource, /collectDirectoryProjectionChanges/);
  assert.doesNotMatch(repositorySource, /refreshAgentDirectoryProjection/);
  assert.doesNotMatch(repositorySource, /refreshTeamDirectoryProjection/);
  assert.doesNotMatch(repositorySource, /for \(const agentKey of agentKeys\)/);
  assert.doesNotMatch(repositorySource, /for \(const teamId of teamIds\)/);
});
