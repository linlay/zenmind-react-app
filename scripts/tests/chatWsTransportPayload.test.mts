import assert from 'node:assert/strict';
import test from 'node:test';

import { buildChatAttachPayload, buildChatQueryPayload } from '../../src/features/chatRealtime/chatWsTransport.ts';

test('chat query payload includes agent scope only', () => {
  const payload = buildChatQueryPayload({
    requestId: ' req-1 ',
    chatId: ' chat-1 ',
    message: 'hello',
    agentKey: ' agent-a ',
    teamId: null
  });

  assert.deepEqual(payload, {
    requestId: 'req-1',
    chatId: 'chat-1',
    message: 'hello',
    agentKey: 'agent-a',
    role: 'user',
    stream: true
  });
  assert.equal('teamId' in payload, false);
});

test('chat query payload keeps operation and transport identities separate', () => {
  const payload = buildChatQueryPayload({
    requestId: 'request-attempt-2',
    operationId: 'operation-1',
    chatId: 'chat-1',
    message: 'retry safely',
    agentKey: 'agent-a'
  });
  assert.equal(payload.requestId, 'request-attempt-2');
  assert.equal(payload.operationId, 'operation-1');
});

test('chat query payload prefers team scope over agent scope', () => {
  const payload = buildChatQueryPayload({
    requestId: 'req-2',
    chatId: 'chat-2',
    message: 'hello team',
    agentKey: 'agent-a',
    teamId: ' team-a '
  });

  assert.deepEqual(payload, {
    requestId: 'req-2',
    chatId: 'chat-2',
    message: 'hello team',
    teamId: 'team-a',
    role: 'user',
    stream: true
  });
  assert.equal('agentKey' in payload, false);
});

test('chat query payload omits empty scope fields', () => {
  const payload = buildChatQueryPayload({
    requestId: 'req-3',
    chatId: 'chat-3',
    message: 'legacy chat',
    agentKey: ' ',
    teamId: ''
  });

  assert.deepEqual(payload, {
    requestId: 'req-3',
    chatId: 'chat-3',
    message: 'legacy chat',
    role: 'user',
    stream: true
  });
  assert.equal('agentKey' in payload, false);
  assert.equal('teamId' in payload, false);
});

test('chat query payload includes planning mode only when enabled', () => {
  const payload = buildChatQueryPayload({
    requestId: 'req-plan',
    chatId: 'chat-plan',
    message: 'draft a plan',
    agentKey: 'coder-pomodoro-app',
    planningMode: true
  });

  assert.deepEqual(payload, {
    requestId: 'req-plan',
    chatId: 'chat-plan',
    message: 'draft a plan',
    agentKey: 'coder-pomodoro-app',
    planningMode: true,
    role: 'user',
    stream: true
  });
  assert.equal('model' in payload, false);
});

test('chat query payload includes access level and compact model override', () => {
  const payload = buildChatQueryPayload({
    requestId: 'req-model',
    chatId: 'chat-model',
    message: 'use a stronger model',
    agentKey: 'coder-pomodoro-app',
    accessLevel: 'auto_approve',
    model: {
      key: 'qwen-max',
      reasoningEffort: 'HIGH',
      serviceTier: 'FLEX'
    }
  });

  assert.deepEqual(payload, {
    requestId: 'req-model',
    chatId: 'chat-model',
    message: 'use a stronger model',
    agentKey: 'coder-pomodoro-app',
    accessLevel: 'auto_approve',
    model: {
      key: 'qwen-max',
      reasoningEffort: 'HIGH',
      serviceTier: 'FLEX'
    },
    role: 'user',
    stream: true
  });
});

test('chat query payload omits default access level and empty model override', () => {
  const payload = buildChatQueryPayload({
    requestId: 'req-default-model',
    chatId: 'chat-default-model',
    message: 'plain question',
    agentKey: 'coder-pomodoro-app',
    accessLevel: 'default',
    model: {
      key: ' ',
      reasoningEffort: undefined,
      serviceTier: undefined
    }
  });

  assert.equal('accessLevel' in payload, false);
  assert.equal('model' in payload, false);
});

test('chat query payload omits disabled planning mode', () => {
  const payload = buildChatQueryPayload({
    requestId: 'req-no-plan',
    chatId: 'chat-no-plan',
    message: 'plain question',
    agentKey: 'coder-pomodoro-app',
    planningMode: false
  });

  assert.equal('planningMode' in payload, false);
});

test('chat attach payload includes required agent scope', () => {
  const payload = buildChatAttachPayload({
    runId: ' run-1 ',
    agentKey: ' askUser.demo ',
    lastSeq: Number.NaN
  });

  assert.deepEqual(payload, {
    runId: 'run-1',
    agentKey: 'askUser.demo',
    lastSeq: 0
  });
});

test('editing query is opt-in, Team-safe and exclusive with Planning', () => {
  const query = { requestId: 'edit', message: 'revise', agentKey: 'kbase' };
  assert.equal(buildChatQueryPayload({ ...query, editingMode: true }).editingMode, true);
  assert.equal('editingMode' in buildChatQueryPayload({ ...query, editingMode: false }), false);
  assert.equal('editingMode' in buildChatQueryPayload({ ...query, editingMode: true, teamId: 'team' }), false);
  assert.equal(buildChatQueryPayload({ ...query, editingMode: true, teamId: ' ' }).editingMode, true);
  assert.throws(() => buildChatQueryPayload({ ...query, editingMode: true, planningMode: true }), /cannot be combined/);
});

test('query skill IDs are deduplicated and omitted for empty or Team selections', () => {
  const query = { requestId: 'skill', message: 'use pdf', agentKey: 'agent' };
  assert.deepEqual(buildChatQueryPayload({ ...query, mustUseSkills: [' office/pdf ', 'OFFICE/PDF'] }).mustUseSkills, [
    'office/pdf'
  ]);
  assert.equal('mustUseSkills' in buildChatQueryPayload({ ...query, mustUseSkills: [] }), false);
  assert.equal(
    'mustUseSkills' in buildChatQueryPayload({ ...query, teamId: 'team', mustUseSkills: ['office/pdf'] }),
    false
  );
});
