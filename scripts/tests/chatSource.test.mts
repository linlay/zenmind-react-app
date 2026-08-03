import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createChatSource,
  encodeChatSourceId,
  getChatSourceFromId,
  getChatSourceStoragePrefix,
  getRemoteChatSourceId,
  parseChatSourceId
} from '../../src/features/chatPersistence/chatSource.ts';
import {
  scopeChatPayload,
  scopeRemoteHomePayload,
  unscopeChatPayload
} from '../../src/features/chatRealtime/chatSourcePayload.ts';

const defaultSource = createChatSource(
  'default',
  'brand/default:cn',
  'Default service'
);
const pairedSource = createChatSource(
  'paired',
  'desktop:office/1',
  'Office Desktop'
);

test('chat source ids roundtrip reserved identifiers and stay idempotent', () => {
  const scopedId = encodeChatSourceId(defaultSource, 'chat:alpha/beta?tab=1');

  assert.equal(
    scopedId,
    'zsrc:default%3Abrand%2Fdefault%3Acn:chat%3Aalpha%2Fbeta%3Ftab%3D1'
  );
  assert.equal(encodeChatSourceId(defaultSource, scopedId), scopedId);
  assert.deepEqual(parseChatSourceId(scopedId), {
    source: {
      ...defaultSource,
      displayName: '默认服务'
    },
    remoteId: 'chat:alpha/beta?tab=1'
  });
  assert.equal(getRemoteChatSourceId(scopedId), 'chat:alpha/beta?tab=1');
  assert.equal(
    getChatSourceStoragePrefix(defaultSource),
    'zsrc:default%3Abrand%2Fdefault%3Acn:'
  );
});

test('unscoped records remain classified as paired legacy data', () => {
  assert.equal(parseChatSourceId('chat-legacy'), null);
  assert.deepEqual(getChatSourceFromId('chat-legacy'), {
    kind: 'paired',
    key: 'paired:legacy',
    sourceId: 'legacy',
    displayName: '已配对设备'
  });
});

test('chat payload scoping isolates default and paired identifiers and reverses requests', () => {
  const payload = {
    chatId: 'chat-1',
    agentKey: 'planner',
    nested: {
      teamId: 'team-a',
      agentKeys: ['planner', 'writer'],
      untouched: 'chat-1'
    }
  };
  const defaultPayload = scopeChatPayload(defaultSource, payload);
  const pairedPayload = scopeChatPayload(pairedSource, payload);

  assert.notEqual(defaultPayload.chatId, pairedPayload.chatId);
  assert.equal(getChatSourceFromId(defaultPayload.chatId).kind, 'default');
  assert.equal(getChatSourceFromId(pairedPayload.chatId).kind, 'paired');
  assert.deepEqual(unscopeChatPayload(defaultPayload), payload);
  assert.deepEqual(unscopeChatPayload(pairedPayload), payload);
});

test('home payload scoping namespaces agent, team and conversation keys together', () => {
  const scoped = scopeRemoteHomePayload(defaultSource, {
    agents: [{ key: 'planner', name: 'Planner' }],
    teams: [{ teamId: 'team-a', agentKeys: ['planner'] }],
    chats: [{ chatId: 'chat-1', firstAgentKey: 'planner' }]
  });

  assert.equal(getRemoteChatSourceId(scoped.agents[0]?.key), 'planner');
  assert.equal(getChatSourceFromId(scoped.agents[0]?.key).kind, 'default');
  assert.equal(getRemoteChatSourceId(scoped.teams[0]?.teamId), 'team-a');
  assert.equal(getRemoteChatSourceId(scoped.chats[0]?.chatId), 'chat-1');
  assert.equal(getRemoteChatSourceId(scoped.chats[0]?.firstAgentKey), 'planner');
  assert.equal(
    getChatSourceFromId(scoped.chats[0]?.firstAgentKey).kind,
    'default'
  );
});
