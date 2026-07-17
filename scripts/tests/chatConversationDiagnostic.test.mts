import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  buildChatConversationDiagnosticReport,
  CHAT_CONVERSATION_DIAGNOSTIC_COMMAND,
  isChatConversationDiagnosticCommand
} from '../../src/features/chatPersistence/chatConversationDiagnostic.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('diagnostic command only matches the exact attachment-free development input', () => {
  assert.equal(isChatConversationDiagnosticCommand(CHAT_CONVERSATION_DIAGNOSTIC_COMMAND, 0, true), true);
  assert.equal(isChatConversationDiagnosticCommand(`  ${CHAT_CONVERSATION_DIAGNOSTIC_COMMAND}  `, 0, true), true);
  assert.equal(isChatConversationDiagnosticCommand(`${CHAT_CONVERSATION_DIAGNOSTIC_COMMAND}。`, 0, true), false);
  assert.equal(isChatConversationDiagnosticCommand(CHAT_CONVERSATION_DIAGNOSTIC_COMMAND, 1, true), false);
  assert.equal(isChatConversationDiagnosticCommand(CHAT_CONVERSATION_DIAGNOSTIC_COMMAND, 0, false), false);
});

test('diagnostic report recursively redacts secrets and marks bounded data as truncated', () => {
  const report = buildChatConversationDiagnosticReport(
    {
      generatedAt: 123,
      environment: {
        authorization: 'Bearer authorization-secret',
        endpoint: 'https://example.test/api?token=url-secret&safe=visible',
        nested: { password: 'password-secret' },
        largeArray: Array.from({ length: 501 }, (_value, index) => index),
        largeText: 'x'.repeat(20_001)
      },
      remote: {
        response: {
          resourceTicket: 'ticket-secret',
          cookie: 'cookie-secret'
        }
      },
      local: { messages: [] }
    },
    { accessToken: 'ui-token-secret', socketStatus: 'connected' }
  );

  assert.deepEqual(
    report.sections.map((section) => section.id),
    ['environment', 'remote', 'local', 'ui']
  );
  const output = report.sections.map((section) => section.json).join('\n');
  for (const secret of [
    'authorization-secret',
    'url-secret',
    'password-secret',
    'ticket-secret',
    'cookie-secret',
    'ui-token-secret'
  ]) {
    assert.equal(output.includes(secret), false);
  }
  assert.match(output, /\[redacted\]/u);
  assert.match(output, /\[truncated 1 items\]/u);
  assert.equal(report.sections.find((section) => section.id === 'environment')?.truncated, true);
});

test('diagnostic command is intercepted before the normal send path and rendered outside timeline persistence', () => {
  const controller = readFileSync(
    path.join(appRoot, 'src/features/chatPersistence/useChatDetailConversationController.ts'),
    'utf8'
  );
  const timelineList = readFileSync(
    path.join(appRoot, 'src/features/chatPersistence/components/ChatTimelineList.tsx'),
    'utf8'
  );
  const interceptIndex = controller.indexOf('if (isChatConversationDiagnosticCommand');
  const normalSendIndex = controller.indexOf('chatSyncService.sendMessage', interceptIndex);

  assert.ok(interceptIndex >= 0);
  assert.ok(normalSendIndex > interceptIndex);
  assert.match(controller.slice(interceptIndex, normalSendIndex), /collectConversationDiagnosticData/u);
  assert.doesNotMatch(controller.slice(interceptIndex, normalSendIndex), /createOutgoingMessage|outbox/u);
  assert.match(timelineList, /ListFooterComponent=\{diagnosticFooter\}/u);
});
