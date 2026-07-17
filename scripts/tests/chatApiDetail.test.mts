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

test('chat detail API definition covers request payload and response snapshots', () => {
  assert.match(chatApiSource, /CHAT_DETAIL_TRANSPORT_TYPE = '\/api\/chat'/);
  assert.match(chatApiSource, /type ChatDetailRequest = \{/);
  assert.match(chatApiSource, /includeRawMessages: boolean/);
  assert.match(chatApiSource, /type RemoteChatActiveRun = \{/);
  assert.match(chatApiSource, /lastSeq\?: number/);
  assert.match(chatApiSource, /type RemoteChatArtifactSnapshot = \{/);
  assert.match(chatApiSource, /type RemoteChatReference = \{/);
  assert.match(chatApiSource, /usage\?: RemoteChatUsageData \| RemoteChatUsageStats \| null/);
  assert.match(chatApiSource, /contextWindow\?: RemoteChatContextWindow \| null/);
});

test('chat detail request defaults to event history without raw messages', () => {
  assert.match(chatApiSource, /function buildChatDetailPayload/);
  assert.match(chatApiSource, /includeRawMessages: source\.includeRawMessages === true/);
  assert.match(chatSyncServiceSource, /buildChatDetailPayload\(chatId\)/);
  const normalDetailRequest = chatSyncServiceSource.slice(
    chatSyncServiceSource.indexOf('private async getChatDetailViaTransport'),
    chatSyncServiceSource.indexOf('private async fetchAgentDetail')
  );
  assert.doesNotMatch(normalDetailRequest, /includeRawMessages: true/);
});

test('development diagnostics explicitly request raw chat messages without changing normal detail requests', () => {
  const diagnosticRequest = chatSyncServiceSource.slice(
    chatSyncServiceSource.indexOf('async collectConversationDiagnosticData'),
    chatSyncServiceSource.indexOf('private clearTransientWork')
  );
  assert.match(diagnosticRequest, /includeRawMessages: true/);
  assert.match(diagnosticRequest, /requestRawChatApi/);
});
