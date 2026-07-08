import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const chatApiSource = readFileSync(
  new URL('../../src/core/api/services/chatApi.ts', import.meta.url),
  'utf8'
);
const chatSyncServiceSource = readFileSync(
  new URL('../../src/features/chatRealtime/chatSyncService.ts', import.meta.url),
  'utf8'
);
const chatDetailControllerSource = readFileSync(
  new URL('../../src/features/chatPersistence/useChatDetailConversationController.ts', import.meta.url),
  'utf8'
);

test('agent detail request uses /api/agent with agentKey payload', () => {
  assert.match(chatApiSource, /CHAT_AGENT_DETAIL_TRANSPORT_TYPE = '\/api\/agent'/);
  assert.match(chatApiSource, /function buildAgentDetailPayload/);
  assert.match(chatApiSource, /agentKey: toCleanText\(agentKey\)/);
});

test('agent detail projection preserves raw response and normalizes wonders', () => {
  assert.match(chatApiSource, /type AgentDetailSnapshot = \{/);
  assert.match(chatApiSource, /raw: RemoteAgentDetail/);
  assert.match(chatApiSource, /toCleanText\(detail\.agentKey\)/);
  assert.match(chatApiSource, /function normalizeWonderSuggestion/);
  assert.match(chatApiSource, /\.slice\(0, 6\)/);
  assert.match(chatApiSource, /raw: detail/);
});

test('agent detail projection does not expose agent key as missing display name', () => {
  assert.match(chatApiSource, /name: toCleanText\(detail\.name\),/);
  assert.doesNotMatch(chatApiSource, /name: toCleanText\(detail\.name\) \|\| agentKey/);
});

test('new conversation intro filters agent-key-only display fields', () => {
  assert.match(chatDetailControllerSource, /function getDisplayTextUnlessAgentKey/);
  assert.match(chatDetailControllerSource, /getIntroAgentDisplayName/);
  assert.match(chatDetailControllerSource, /description: getDisplayTextUnlessAgentKey\(\s*scopedAgentDetail\?\.description,\s*introAgentKey\s*\)/s);
});

test('chat sync service caches agent details for the app lifetime', () => {
  assert.match(chatSyncServiceSource, /agentDetails = new Map<string, AgentDetailSnapshot \| null>/);
  assert.match(chatSyncServiceSource, /agentDetailRequests = new Map<string, Promise<AgentDetailSnapshot \| null>>/);
  assert.match(chatSyncServiceSource, /if \(this\.agentDetails\.has\(normalizedAgentKey\)\)/);
  assert.match(chatSyncServiceSource, /this\.agentDetails\.set\(agentKey, null\)/);
  assert.match(chatSyncServiceSource, /this\.agentDetailCacheVersion \+= 1/);
  assert.match(chatSyncServiceSource, /this\.agentDetailCacheVersion !== cacheVersion/);
});
