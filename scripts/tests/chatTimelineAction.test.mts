import assert from 'node:assert/strict';
import test from 'node:test';

import { ConversationActionService } from '../../src/features/chatPersistence/conversationActionService.ts';
import {
  applyChatTimelineEvent,
  buildChatTimelineDisplayModel,
  deserializeChatTimelineState,
  getConversationActionWhitelist,
  resolveConversationActionDefinition,
  serializeChatTimelineState,
  timelinePersistenceInternals,
  type ChatTimelineActionNode,
  type ChatTimelineState,
  type SerializedTimelineMeta,
  type SerializedTimelineNode
} from '../../src/features/chatTimeline/index.ts';

const EPOCH_MS = 1_700_000_000_000;

function getActionNodes(state: ChatTimelineState): ChatTimelineActionNode[] {
  return state.orderedNodeIds
    .map((nodeId) => state.nodesById[nodeId])
    .filter((node): node is ChatTimelineActionNode => node?.kind === 'action');
}

function getActionNode(state: ChatTimelineState, actionId: string): ChatTimelineActionNode {
  const node = getActionNodes(state).find((candidate) => candidate.actionId === actionId);
  assert.ok(node);
  return node;
}

test('mobile action whitelist enables only theme switching', () => {
  assert.deepEqual(
    getConversationActionWhitelist().map((definition) => definition.actionName),
    ['switch_theme']
  );
  assert.deepEqual(resolveConversationActionDefinition('launch_fireworks'), {
    actionName: 'launch_fireworks',
    executorKind: null,
    policy: 'unsupported',
    policyReason: 'unsupported_on_mobile'
  });
  assert.equal(resolveConversationActionDefinition('open_external_url').policy, 'unknown');
});

test('action argument chunks merge into one typed node and local result completes it', () => {
  let state = applyChatTimelineEvent(null, 'chat-action', {
    type: 'action.start',
    actionId: 'action-theme',
    actionName: 'switch_theme',
    runId: 'run-1',
    seq: 1,
    timestamp: EPOCH_MS
  });
  state = applyChatTimelineEvent(state, 'chat-action', {
    type: 'action.args',
    actionId: 'action-theme',
    delta: '{"theme":',
    seq: 2,
    timestamp: EPOCH_MS + 10
  });
  state = applyChatTimelineEvent(state, 'chat-action', {
    type: 'action.args',
    actionId: 'action-theme',
    delta: '"dark"}',
    seq: 3,
    timestamp: EPOCH_MS + 20
  });
  state = applyChatTimelineEvent(state, 'chat-action', {
    type: 'action.end',
    actionId: 'action-theme',
    seq: 4,
    timestamp: EPOCH_MS + 30
  });

  const ready = getActionNode(state, 'action-theme');
  assert.equal(getActionNodes(state).length, 1);
  assert.equal(ready.actionName, 'switch_theme');
  assert.deepEqual(ready.args, { theme: 'dark' });
  assert.equal(ready.target, 'dark');
  assert.equal(ready.status, 'ready');
  assert.equal(ready.policy, 'allowed');

  state = applyChatTimelineEvent(state, 'chat-action', {
    type: 'action.result',
    actionId: 'action-theme',
    actionName: 'switch_theme',
    result: { theme: 'dark' },
    timestamp: EPOCH_MS + 40
  });
  const completed = getActionNode(state, 'action-theme');
  assert.equal(completed.status, 'completed');
  assert.deepEqual(completed.result, { theme: 'dark' });
  assert.match(completed.resultText, /"theme": "dark"/);

  const displayItem = buildChatTimelineDisplayModel(state).items.find((item) => item.kind === 'action');
  assert.ok(displayItem);
  assert.equal(displayItem.node, completed);
});

test('action reducer ignores duplicate, stale, and post-terminal protocol events', () => {
  const endEvent = {
    type: 'action.snapshot',
    actionId: 'action-idempotent',
    actionName: 'switch_theme',
    arguments: { theme: 'light' },
    seq: 8,
    timestamp: EPOCH_MS + 80
  };
  const ready = applyChatTimelineEvent(null, 'chat-action-idempotent', endEvent);
  const duplicate = applyChatTimelineEvent(ready, 'chat-action-idempotent', endEvent);
  const stale = applyChatTimelineEvent(ready, 'chat-action-idempotent', {
    type: 'action.args',
    actionId: 'action-idempotent',
    delta: '{"theme":"dark"}',
    seq: 7,
    timestamp: EPOCH_MS + 70
  });
  let completed = applyChatTimelineEvent(ready, 'chat-action-idempotent', {
    type: 'action.result',
    actionId: 'action-idempotent',
    actionName: 'switch_theme',
    result: { theme: 'light' },
    seq: 9,
    timestamp: EPOCH_MS + 90
  });
  completed = applyChatTimelineEvent(completed, 'chat-action-idempotent', {
    type: 'action.end',
    actionId: 'action-idempotent',
    seq: 10,
    timestamp: EPOCH_MS + 100
  });

  assert.equal(duplicate, ready);
  assert.equal(stale, ready);
  assert.equal(getActionNode(completed, 'action-idempotent').status, 'completed');
  assert.deepEqual(getActionNode(completed, 'action-idempotent').args, { theme: 'light' });
});

test('unsupported and unknown actions remain visible but blocked', () => {
  let state = applyChatTimelineEvent(null, 'chat-action-blocked', {
    type: 'action.snapshot',
    actionId: 'fireworks',
    actionName: 'launch_fireworks',
    arguments: { durationMs: 60_000 },
    timestamp: EPOCH_MS
  });
  state = applyChatTimelineEvent(state, 'chat-action-blocked', {
    type: 'action.snapshot',
    actionId: 'external',
    actionName: 'open_external_url',
    arguments: { url: 'https://example.com' },
    timestamp: EPOCH_MS + 10
  });

  const fireworks = getActionNode(state, 'fireworks');
  assert.equal(fireworks.status, 'blocked');
  assert.equal(fireworks.policy, 'unsupported');
  assert.deepEqual(fireworks.args, { durationMs: 30_000 });
  const external = getActionNode(state, 'external');
  assert.equal(external.status, 'blocked');
  assert.equal(external.policy, 'unknown');
  assert.equal(external.target, 'https://example.com');
});

test('action service executes a live allowlisted action once', async () => {
  const service = new ConversationActionService();
  const themes: string[] = [];
  const capabilities = { setTheme: (theme: 'light' | 'dark') => themes.push(theme) };
  await service.handleProtocolEvent(
    'chat-live',
    {
      type: 'action.start',
      actionId: 'theme-live',
      actionName: 'switch_theme'
    },
    capabilities
  );
  await service.handleProtocolEvent(
    'chat-live',
    { type: 'action.args', actionId: 'theme-live', delta: '{"theme":"dark"}' },
    capabilities
  );
  const first = await service.handleProtocolEvent(
    'chat-live',
    { type: 'action.end', actionId: 'theme-live' },
    capabilities
  );
  const duplicate = await service.handleProtocolEvent(
    'chat-live',
    { type: 'action.end', actionId: 'theme-live' },
    capabilities
  );

  assert.deepEqual(themes, ['dark']);
  assert.equal(first?.status, 'executed');
  assert.deepEqual(first?.result, { theme: 'dark' });
  assert.equal(duplicate?.duplicate, true);
});

test('action service rejects unsupported, unknown, and malformed allowed actions', async () => {
  const service = new ConversationActionService();
  let executionCount = 0;
  const capabilities = {
    setTheme: () => {
      executionCount += 1;
    }
  };
  const unsupported = await service.handleProtocolEvent(
    'chat-blocked',
    {
      type: 'action.snapshot',
      actionId: 'fireworks',
      actionName: 'launch_fireworks',
      arguments: { durationMs: 8_000 }
    },
    capabilities
  );
  const unknown = await service.handleProtocolEvent(
    'chat-blocked',
    {
      type: 'action.snapshot',
      actionId: 'external',
      actionName: 'open_external_url',
      arguments: { url: 'https://example.com' }
    },
    capabilities
  );
  await service.handleProtocolEvent(
    'chat-blocked',
    { type: 'action.start', actionId: 'invalid', actionName: 'switch_theme' },
    capabilities
  );
  await service.handleProtocolEvent(
    'chat-blocked',
    { type: 'action.args', actionId: 'invalid', delta: '{not-json' },
    capabilities
  );
  const malformed = await service.handleProtocolEvent(
    'chat-blocked',
    { type: 'action.end', actionId: 'invalid' },
    capabilities
  );

  assert.equal(unsupported?.status, 'blocked');
  assert.equal(unsupported?.reason, 'unsupported_on_mobile');
  assert.equal(unknown?.status, 'blocked');
  assert.equal(unknown?.reason, 'not_in_mobile_whitelist');
  assert.equal(malformed?.status, 'failed');
  assert.equal(malformed?.reason, 'invalid_arguments');
  assert.equal(executionCount, 0);
});

test('action persistence roundtrips typed nodes and migrates legacy records', () => {
  const state = applyChatTimelineEvent(null, 'chat-action-persisted', {
    type: 'action.snapshot',
    actionId: 'typed-action',
    actionName: 'switch_theme',
    arguments: { theme: 'dark' },
    timestamp: EPOCH_MS
  });
  const serialized = serializeChatTimelineState(state);
  const restored = deserializeChatTimelineState(serialized.meta, serialized.nodes);
  assert.ok(restored);
  assert.deepEqual(getActionNode(restored, 'typed-action'), getActionNode(state, 'typed-action'));

  const legacyNode = {
    id: 'action:chat-action-legacy:run-1:switch_theme',
    kind: 'action',
    title: 'switch_theme',
    body: '{"theme":"dark"}',
    status: 'completed',
    streaming: false,
    runId: 'run-1',
    createdAt: EPOCH_MS,
    updatedAt: EPOCH_MS + 100,
    order: 0,
    lifecycle: 'complete'
  };
  const payloadJson = timelinePersistenceInternals.stableStringify(legacyNode);
  const meta: SerializedTimelineMeta = {
    conversationId: 'chat-action-legacy',
    activeRunId: '',
    awaitingId: null,
    usageLabel: '',
    updatedAt: EPOCH_MS + 100,
    revision: 1,
    nextOrder: 1
  };
  const rows: SerializedTimelineNode[] = [
    {
      conversationId: meta.conversationId,
      nodeId: legacyNode.id,
      kind: 'action',
      runId: 'run-1',
      orderIndex: 0,
      createdAt: EPOCH_MS,
      updatedAt: EPOCH_MS + 100,
      payloadHash: timelinePersistenceInternals.hashText(payloadJson),
      payloadJson
    }
  ];
  const migrated = deserializeChatTimelineState(meta, rows);
  assert.ok(migrated);
  const action = getActionNode(migrated, 'switch_theme');
  assert.equal(action.id, 'action:chat-action-legacy:switch_theme');
  assert.deepEqual(action.args, { theme: 'dark' });
  assert.equal(action.policy, 'allowed');
});
