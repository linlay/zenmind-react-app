import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyConversationRuntimeEvent,
  deriveConversationRuntimeState,
  getConversationRuntimeState,
} from '../../src/features/chatRealtime/runtimeState.ts';

test('awaiting events keep prompt and append answer state', () => {
  const pending = applyConversationRuntimeEvent(null, 'chat-1', {
    type: 'awaiting.ask',
    chatId: 'chat-1',
    prompt: 'Need approval',
    requiresApproval: true,
    updatedAt: 100,
  });
  const answered = applyConversationRuntimeEvent(pending, 'chat-1', {
    type: 'awaiting.answer',
    chatId: 'chat-1',
    answer: 'approved',
    updatedAt: 120,
  });

  assert.equal(answered.awaiting?.prompt, 'Need approval');
  assert.equal(answered.awaiting?.answer, 'approved');
  assert.equal(answered.awaiting?.mode, 'approval');
  assert.equal(answered.awaiting?.status, 'answer');
});

test('awaiting mode prefers form payload hints when present', () => {
  const pending = applyConversationRuntimeEvent(null, 'chat-1', {
    type: 'awaiting.ask',
    chatId: 'chat-1',
    prompt: 'Fill the form',
    form: {
      fields: [{ key: 'name', label: 'Name' }],
    },
    updatedAt: 100,
  });

  assert.equal(pending.awaiting?.mode, 'form');
});

test('reasoning and tool delta events update stable runtime entries', () => {
  let state = getConversationRuntimeState('chat-1');
  state = applyConversationRuntimeEvent(state, 'chat-1', {
    type: 'reasoning.start',
    chatId: 'chat-1',
    runId: 'run-1',
    contentId: 'reasoning-1',
    text: 'first',
    updatedAt: 100,
  });
  state = applyConversationRuntimeEvent(state, 'chat-1', {
    type: 'reasoning.delta',
    chatId: 'chat-1',
    runId: 'run-1',
    contentId: 'reasoning-1',
    delta: ' second',
    updatedAt: 110,
  });
  state = applyConversationRuntimeEvent(state, 'chat-1', {
    type: 'tool.result',
    chatId: 'chat-1',
    runId: 'run-1',
    toolCallId: 'tool-1',
    toolName: 'search',
    result: { ok: true },
    updatedAt: 130,
  });

  const reasoning = state.entries.find((entry) => entry.kind === 'reasoning');
  const tool = state.entries.find((entry) => entry.kind === 'tool');
  assert.equal(reasoning?.body, 'first second');
  assert.equal(reasoning?.lifecycle, 'active');
  assert.equal(tool?.title, 'search');
  assert.equal(tool?.lifecycle, 'complete');
  assert.match(tool?.body || '', /"ok": true/);
});

test('runtime lifecycle maps terminal event suffixes explicitly', () => {
  let state = getConversationRuntimeState('chat-1');
  state = applyConversationRuntimeEvent(state, 'chat-1', {
    type: 'task.fail',
    chatId: 'chat-1',
    taskId: 'task-1',
    title: 'Review',
    updatedAt: 100,
  });
  state = applyConversationRuntimeEvent(state, 'chat-1', {
    type: 'run.cancel',
    chatId: 'chat-1',
    runId: 'run-1',
    updatedAt: 110,
  });

  const task = state.entries.find((entry) => entry.kind === 'task');
  const run = state.entries.find((entry) => entry.kind === 'run');
  assert.equal(task?.lifecycle, 'error');
  assert.equal(run?.lifecycle, 'cancelled');
});

test('runtime state can be rebuilt from remote detail event history', () => {
  const state = deriveConversationRuntimeState('chat-1', [
    {
      type: 'plan.create',
      chatId: 'chat-1',
      planId: 'plan-1',
      title: 'Ship alignment',
      updatedAt: 100,
    },
    {
      type: 'task.start',
      chatId: 'chat-1',
      taskId: 'task-1',
      title: 'Build reducer',
      updatedAt: 110,
    },
    {
      type: 'usage.snapshot',
      chatId: 'chat-1',
      inputTokens: 100,
      outputTokens: 40,
      totalTokens: 140,
      updatedAt: 120,
    },
  ]);

  assert.equal(state.entries[0]?.kind, 'usage');
  assert.equal(
    state.entries.some((entry) => entry.kind === 'plan'),
    true
  );
  assert.equal(
    state.entries.some((entry) => entry.kind === 'task'),
    true
  );
  assert.equal(state.usageLabel, '输入 100 · 输出 40 · 总计 140');
});
