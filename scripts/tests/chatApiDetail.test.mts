import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildSubmitFrontendToolPayload } from '../../src/core/api/services/frontendToolSubmitProtocol.ts';

const chatApiSource = readFileSync(new URL('../../src/core/api/services/chatApi.ts', import.meta.url), 'utf8');
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
  assert.match(chatApiSource, /REMOTE_CHAT_PAGE_SIZE = 10/);
  assert.match(chatApiSource, /eventLimit: REMOTE_CHAT_PAGE_SIZE/);
  assert.match(chatApiSource, /function buildChatSummariesPayload/);
  assert.match(chatSyncServiceSource, /paginateEvents: paginated/);
  assert.match(chatSyncServiceSource, /payload: buildChatSummariesPayload\(\)/);
  const normalDetailRequest = chatSyncServiceSource.slice(
    chatSyncServiceSource.indexOf('private async getChatDetailViaTransport'),
    chatSyncServiceSource.indexOf('private async fetchAgentDetail')
  );
  assert.doesNotMatch(normalDetailRequest, /includeRawMessages: true/);
});

test('account Desktop history is merged with persisted pages and offline writes fail before local queueing', () => {
  assert.match(chatSyncServiceSource, /remoteHistoryCursors/);
  assert.match(chatSyncServiceSource, /getConversationInitialTimelineState\(projection\.conversationId, 500\)/);
  const sendMessage = chatSyncServiceSource.slice(
    chatSyncServiceSource.indexOf('async sendMessage('),
    chatSyncServiceSource.indexOf('private emit(')
  );
  assert.ok(sendMessage.indexOf('TARGET_OFFLINE') < sendMessage.indexOf('createOutgoingMessage('));
  assert.match(sendMessage, /remote operations are not queued/);
});

test('remote Desktop retries keep one operation identity and can recover its task status', () => {
  assert.match(chatApiSource, /CHAT_OPERATION_TRANSPORT_TYPE = '\/api\/operation'/);
  assert.match(chatSyncServiceSource, /operationId: input\.clientMessageId/);
  assert.match(chatSyncServiceSource, /requestId: createRemoteRequestId\(input\.clientMessageId\)/);
  assert.match(chatSyncServiceSource, /operationReplayTaskId/);
  assert.match(chatSyncServiceSource, /getRemoteOperationStatus/);
  assert.match(chatSyncServiceSource, /setConversationActiveRunId\(input\.conversationId, taskId\)/);
});

test('development diagnostics explicitly request raw chat messages without changing normal detail requests', () => {
  const diagnosticRequest = chatSyncServiceSource.slice(
    chatSyncServiceSource.indexOf('async collectConversationDiagnosticData'),
    chatSyncServiceSource.indexOf('private clearTransientWork')
  );
  assert.match(diagnosticRequest, /includeRawMessages: true/);
  assert.match(diagnosticRequest, /requestRawChatApi/);
});

test('frontend tool submit payload uses one normalized run owner and no UI key', () => {
  assert.deepEqual(
    buildSubmitFrontendToolPayload({
      chatId: ' chat-1 ',
      runId: ' run-1 ',
      agentKey: 'ignored-agent',
      teamId: ' team-1 ',
      toolId: ' tool-1 ',
      params: { approved: true }
    }),
    {
      chatId: 'chat-1',
      runId: 'run-1',
      teamId: 'team-1',
      toolId: 'tool-1',
      params: { approved: true }
    }
  );
  assert.match(chatSyncServiceSource, /getActiveChatTimelineFrontendTool/);
  assert.match(chatSyncServiceSource, /frontendToolSubmitRequests/);
  assert.match(chatSyncServiceSource, /CHAT_SUBMIT_TRANSPORT_TYPE/);
});
