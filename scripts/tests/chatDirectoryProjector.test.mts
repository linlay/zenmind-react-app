import assert from 'node:assert/strict';
import test from 'node:test';

import {
  projectRemoteDirectory,
  projectRemoteHomeDirectory,
} from '../../src/features/chatPersistence/chatDirectoryProjector.ts';

test('projects remote agents and teams into stable directory items', () => {
  const items = projectRemoteDirectory(
    [
      {
        key: 'planner',
        name: 'Planner',
        icon: { name: 'flux' },
        meta: { role: 'Planning agent' },
        stats: { unreadCount: '2' },
      },
      {
        id: 'terminal',
        name: 'Terminal',
        icon: '/assets/terminal.svg',
        role: 'Ops agent',
      },
      {
        key: 'planner',
        name: 'Duplicate Planner',
      },
    ],
    [
      {
        teamId: 'team-alpha',
        name: 'Team Alpha',
        icon: { color: '#2f6df6' },
        agentKeys: ['planner', 'terminal'],
        meta: {
          defaultAgentKey: 'planner',
        },
      },
    ]
  );

  assert.deepEqual(
    items.map((item) => item.id),
    ['agent:planner', 'agent:terminal', 'team:team-alpha']
  );
  assert.deepEqual(
    items.map((item) => item.sortRank),
    [0, 1, 2]
  );
  assert.equal(items[0].subtitle, 'Planning agent');
  assert.deepEqual(items[0].icon, { name: 'flux', color: null, uri: null });
  assert.equal(items[0].unreadCount, 2);
  assert.equal(items[1].agentKey, 'terminal');
  assert.deepEqual(items[1].icon, { name: null, color: null, uri: '/assets/terminal.svg' });
  assert.equal(items[2].kind, 'team');
  assert.deepEqual(items[2].icon, { name: null, color: '#2f6df6', uri: null });
  assert.equal(items[2].defaultAgentKey, 'planner');
  assert.equal(items[2].subtitle, '默认 planner');
});

test('projects chat summaries into latest directory conversations without duplicating message text', () => {
  const projection = projectRemoteHomeDirectory({
    agents: [
      {
        key: 'planner',
        name: 'Planner',
      },
      {
        key: 'terminal',
        name: 'Terminal',
      },
    ],
    teams: [
      {
        teamId: 'team-alpha',
        name: 'Team Alpha',
        meta: {
          defaultAgentKey: 'terminal',
        },
      },
    ],
    chats: [
      {
        chatId: 'chat-old',
        chatName: 'Old Planner Chat',
        firstAgentKey: 'planner',
        lastRunContent: 'old answer',
        updatedAt: Date.parse('2026-05-20T08:00:00.000Z'),
        unreadRunCount: 1,
      },
      {
        chatId: 'chat-new',
        chatName: 'New Planner Chat',
        firstAgentKey: 'planner',
        lastRunContent: 'new answer',
        updatedAt: Date.parse('2026-05-21T08:00:00.000Z'),
        unreadRunCount: 2,
      },
      {
        chatId: 'chat-empty',
        chatName: 'Empty Planner Chat',
        firstAgentKey: 'planner',
        updatedAt: Date.parse('2026-05-23T08:00:00.000Z'),
      },
      {
        chatId: 'chat-team',
        chatName: 'Team Chat',
        teamId: 'team-alpha',
        lastRunContent: 'team answer',
        updatedAt: Date.parse('2026-05-22T08:00:00.000Z'),
        readStatus: 0,
      },
    ],
  });

  const planner = projection.directoryItems.find((item) => item.id === 'agent:planner');
  const terminal = projection.directoryItems.find((item) => item.id === 'agent:terminal');
  const team = projection.directoryItems.find((item) => item.id === 'team:team-alpha');

  assert.equal(planner?.latestConversationId, 'chat-new');
  assert.equal(planner?.unreadCount, 2);
  assert.equal(terminal?.latestConversationId, 'chat-team');
  assert.equal(terminal?.unreadCount, 1);
  assert.equal(team?.latestConversationId, 'chat-team');
  assert.equal(team?.unreadCount, 1);
  assert.equal(projection.conversationSummaries.length, 4);
  assert.equal(
    projection.conversationSummaries.find((item) => item.conversationId === 'chat-new')
      ?.unreadCount,
    1
  );
  assert.equal(
    projection.conversationSummaries.find((item) => item.conversationId === 'chat-new')
      ?.lastMessageText,
    'new answer'
  );
  assert.equal(
    projection.conversationSummaries.find((item) => item.conversationId === 'chat-empty')
      ?.lastMessageText,
    ''
  );
  assert.equal(
    projection.conversationSummaries.find((item) => item.conversationId === 'chat-empty')
      ?.unreadCount,
    undefined
  );
});
