import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChatAttachPayload, buildChatQueryPayload } from '../../src/features/chatRealtime/chatWsTransport.ts';

test('Platform query golden payload preserves root owner, references and explicit editing false', () => {
  const payload = buildChatQueryPayload({
    requestId: ' message-1 ',
    chatId: ' chat ',
    message: 'hello',
    agentKey: ' root-team ',
    editingMode: false,
    planningMode: true,
    references: [
      { type: 'skill', id: 'pdf' },
      { type: 'kbase', id: 'manual' }
    ],
    accessLevel: 'auto_approve',
    model: { key: 'model', reasoningEffort: 'HIGH', serviceTier: 'FLEX' }
  });
  assert.deepEqual(payload, {
    requestId: 'message-1',
    chatId: 'chat',
    message: 'hello',
    agentKey: 'root-team',
    editingMode: false,
    planningMode: true,
    references: [
      { type: 'skill', id: 'pdf' },
      { type: 'kbase', id: 'manual' }
    ],
    accessLevel: 'auto_approve',
    model: { key: 'model', reasoningEffort: 'HIGH', serviceTier: 'FLEX' },
    role: 'user',
    stream: true
  });
});
test('omitted editing stays omitted and planning and editing can be expressed together', () => {
  const base = { requestId: 'message', message: 'question', agentKey: 'agent' };
  const plain = buildChatQueryPayload({ ...base, planningMode: false, accessLevel: 'default', model: { key: ' ' } });
  assert.equal('editingMode' in plain, false);
  assert.equal('planningMode' in plain, false);
  assert.equal('accessLevel' in plain, false);
  assert.equal('model' in plain, false);
  assert.equal(buildChatQueryPayload({ ...base, planningMode: true, editingMode: true }).editingMode, true);
});
test('attach carries the root Agent identity and an independent resume cursor', () => {
  assert.equal(buildChatAttachPayload({ runId: 'run', chatId: ' chat ', agentKey: 'root', lastSeq: 7 }).chatId, 'chat');
  assert.deepEqual(buildChatAttachPayload({ runId: ' run ', agentKey: ' root ', lastSeq: 7 }), {
    runId: 'run',
    agentKey: 'root',
    lastSeq: 7
  });
  assert.equal(buildChatAttachPayload({ runId: 'run', agentKey: 'root', lastSeq: NaN }).lastSeq, 0);
});
