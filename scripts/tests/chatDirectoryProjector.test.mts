import assert from 'node:assert/strict';
import test from 'node:test';

import {
  projectRemoteDirectory,
  projectRemoteHomeDirectory,
} from '../../src/features/chatPersistence/chatDirectoryProjector.ts';
import { canUsePlanMode } from '../../src/features/chatPersistence/agentMode.ts';
import { createChatConversationTarget } from '../../src/features/chatPersistence/chatConversationTarget.ts';

test('projects remote agents and teams into stable directory items', () => {
  const items = projectRemoteDirectory(
    [
      {
        key: 'planner',
        name: 'Planner',
        icon: { name: 'flux' },
        mode: 'CODER',
        meta: {
          modelKey: 'th-minimax-m2_7-highspeed',
          role: 'Planning agent',
          stageSettings: {
            execute: {
              modelConfig: {
                reasoning: {
                  enabled: true,
                  effort: 'HIGH',
                },
              },
            },
          },
        },
        stats: { unreadCount: '2' },
      },
      {
        id: 'terminal',
        name: 'Terminal',
        icon: '/assets/terminal.svg',
        mode: 'REACT',
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
  assert.equal(items[0].agentMode, 'CODER');
  assert.equal(items[0].modelKey, 'th-minimax-m2_7-highspeed');
  assert.equal(items[0].reasoningEffort, 'HIGH');
  assert.equal(canUsePlanMode(items[0].agentMode), true);
  assert.equal(canUsePlanMode(' coder '), true);
  assert.deepEqual(items[0].icon, { name: 'flux', color: null, uri: null });
  assert.equal(items[0].unreadCount, 2);
  assert.equal(items[1].agentKey, 'terminal');
  assert.equal(items[1].agentMode, 'REACT');
  assert.equal(canUsePlanMode(items[1].agentMode), false);
  assert.deepEqual(items[1].icon, { name: null, color: null, uri: '/assets/terminal.svg' });
  assert.equal(items[2].kind, 'team');
  assert.deepEqual(items[2].icon, { name: null, color: '#2f6df6', uri: null });
  assert.equal(items[2].defaultAgentKey, 'planner');
  assert.equal(items[2].agentMode, null);
  assert.equal(items[2].modelKey, 'th-minimax-m2_7-highspeed');
  assert.equal(items[2].reasoningEffort, 'HIGH');
  assert.equal(items[2].subtitle, '默认 planner');
  assert.deepEqual(createChatConversationTarget(items[0]), {
    source: {
      kind: 'paired',
      key: 'paired:legacy',
      sourceId: 'legacy',
      displayName: '已配对设备',
    },
    kind: 'agent',
    title: 'Planner',
    subtitle: 'Planning agent',
    agentKey: 'planner',
    teamId: null,
    agentMode: 'CODER',
    modelKey: 'th-minimax-m2_7-highspeed',
    reasoningEffort: 'HIGH',
  });
});

test('omits a remote default chat title candidate', () => {
  const projection = projectRemoteHomeDirectory({
    agents: [{ key: 'planner', name: 'Planner' }],
    teams: [],
    chats: [
      {
        chatId: 'chat-default-title',
        chatName: 'default',
        firstAgentKey: 'planner',
        lastRunContent: 'done',
      },
    ],
  });

  assert.equal(projection.conversationSummaries[0]?.title, undefined);
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
