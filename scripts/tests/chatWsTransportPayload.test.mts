import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChatAttachPayload,
  buildChatQueryPayload,
} from '../../src/features/chatRealtime/chatWsTransport.ts';

test('chat query payload includes agent scope only', () => {
  const payload = buildChatQueryPayload({
    requestId: ' req-1 ',
    chatId: ' chat-1 ',
    message: 'hello',
    agentKey: ' agent-a ',
    teamId: null,
  });

  assert.deepEqual(payload, {
    requestId: 'req-1',
    chatId: 'chat-1',
    message: 'hello',
    agentKey: 'agent-a',
    role: 'user',
    stream: true,
  });
  assert.equal('teamId' in payload, false);
});

test('chat query payload prefers team scope over agent scope', () => {
  const payload = buildChatQueryPayload({
    requestId: 'req-2',
    chatId: 'chat-2',
    message: 'hello team',
    agentKey: 'agent-a',
    teamId: ' team-a ',
  });

  assert.deepEqual(payload, {
    requestId: 'req-2',
    chatId: 'chat-2',
    message: 'hello team',
    teamId: 'team-a',
    role: 'user',
    stream: true,
  });
  assert.equal('agentKey' in payload, false);
});

test('chat query payload omits empty scope fields', () => {
  const payload = buildChatQueryPayload({
    requestId: 'req-3',
    chatId: 'chat-3',
    message: 'legacy chat',
    agentKey: ' ',
    teamId: '',
  });

  assert.deepEqual(payload, {
    requestId: 'req-3',
    chatId: 'chat-3',
    message: 'legacy chat',
    role: 'user',
    stream: true,
  });
  assert.equal('agentKey' in payload, false);
  assert.equal('teamId' in payload, false);
});

test('chat attach payload includes required agent scope', () => {
  const payload = buildChatAttachPayload({
    runId: ' run-1 ',
    agentKey: ' askUser.demo ',
    lastSeq: Number.NaN,
  });

  assert.deepEqual(payload, {
    runId: 'run-1',
    agentKey: 'askUser.demo',
    lastSeq: 0,
  });
});
