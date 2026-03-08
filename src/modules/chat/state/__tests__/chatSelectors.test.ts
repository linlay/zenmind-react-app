import { RootState } from '../../../../app/store/store';
import { selectAgentLatestChats, selectCurrentAgentChats } from '../chatSelectors';

function createState(
  chats: Array<Record<string, unknown>>,
  options: {
    chatId?: string;
    selectedAgentKey?: string;
    agents?: Array<Record<string, unknown>>;
    teams?: Array<Record<string, unknown>>;
  } = {}
): RootState {
  return {
    chat: {
      chats,
      chatId: options.chatId || '',
      statusText: '',
      loadingChats: false,
      teams: options.teams || []
    },
    user: {
      selectedAgentKey: options.selectedAgentKey || ''
    },
    agents: {
      agents: options.agents || []
    }
  } as unknown as RootState;
}

describe('chatSelectors', () => {
  beforeEach(() => {
    selectAgentLatestChats.resetRecomputations();
    selectCurrentAgentChats.resetRecomputations();
  });

  it('aggregates chats by firstAgentKey and keeps only the latest chat per agent', () => {
    const state = createState([
      { chatId: 'a1-older', chatName: 'older', firstAgentKey: 'agent-a', firstAgentName: 'Agent A', updatedAt: 100 },
      { chatId: 'a1-latest', chatName: 'latest', firstAgentKey: 'agent-a', firstAgentName: 'Agent A', updatedAt: 200 },
      { chatId: 'b1-only', chatName: 'only', firstAgentKey: 'agent-b', firstAgentName: 'Agent B', updatedAt: 150 }
    ]);

    const result = selectAgentLatestChats(state);
    expect(result.map((item) => item.agentKey)).toEqual(['agent-a', 'agent-b']);
    expect(result.map((item) => item.latestChat.chatId)).toEqual(['a1-latest', 'b1-only']);
  });

  it('filters aggregated items by agentName/agentKey/latest chat title', () => {
    const state = createState([
      {
        chatId: 'a-older',
        chatName: 'alpha legacy',
        firstAgentKey: 'agent-a',
        firstAgentName: 'Agent A',
        updatedAt: 100
      },
      {
        chatId: 'a-latest',
        chatName: 'newest title',
        firstAgentKey: 'agent-a',
        firstAgentName: 'Agent A',
        updatedAt: 200
      },
      {
        chatId: 'b-latest',
        chatName: 'beta title',
        firstAgentKey: 'agent-b',
        firstAgentName: 'Sales Bot',
        updatedAt: 180
      }
    ]);

    const result = selectAgentLatestChats(state);
    expect(result.map((item) => item.agentKey)).toEqual(['agent-a', 'agent-b']);
  });

  it('uses agentKey and resolves display name from agents first', () => {
    const state = createState(
      [
        { chatId: 'chat-1', chatName: 'A', agentKey: 'demoAction', agentName: 'ChatAgentName', updatedAt: 200 },
        { chatId: 'chat-2', chatName: 'B', agentKey: 'demoAction', updatedAt: 100 }
      ],
      {
        agents: [{ key: 'demoAction', name: 'AgentFromAgents', role: '任务调度智能体' }]
      }
    );
    const result = selectAgentLatestChats(state);
    expect(result).toHaveLength(1);
    expect(result[0].agentKey).toBe('demoAction');
    expect(result[0].agentName).toBe('AgentFromAgents');
    expect(result[0].agentRole).toBe('任务调度智能体');
  });

  it('resolves icon from agent.icon object when chat payload has no icon fields', () => {
    const state = createState([{ chatId: 'chat-1', chatName: 'A', agentKey: 'demoAction', updatedAt: 200 }], {
      agents: [{ key: 'demoAction', name: 'AgentFromAgents', icon: { name: 'rocket', color: '#3F7BFA' } }]
    });
    const result = selectAgentLatestChats(state);
    expect(result).toHaveLength(1);
    expect(result[0].iconName).toBe('rocket');
    expect(result[0].iconColor).toBe('#3F7BFA');
  });

  it('falls back to role from chat payload when agent role is absent', () => {
    const state = createState(
      [{ chatId: 'chat-1', chatName: 'A', agentKey: 'demoAction', firstAgentRole: '对话专家', updatedAt: 200 }],
      {
        agents: [{ key: 'demoAction', name: 'AgentFromAgents' }]
      }
    );
    const result = selectAgentLatestChats(state);
    expect(result).toHaveLength(1);
    expect(result[0].agentRole).toBe('对话专家');
  });

  it('supplements agent name and icon from team when chat carries teamId', () => {
    const state = createState(
      [{ chatId: 'chat-1', chatName: 'A', teamId: 'team-1', updatedAt: 200 }],
      {
        teams: [
          {
            teamId: 'team-1',
            name: 'Team Alpha',
            icon: { name: 'users', color: '#2244AA' }
          }
        ]
      }
    );

    const result = selectAgentLatestChats(state);
    expect(result).toHaveLength(1);
    expect(result[0].agentName).toBe('Team Alpha');
    expect(result[0].iconName).toBe('users');
    expect(result[0].iconColor).toBe('#2244AA');
    expect(result[0].latestChat.agentName).toBe('Team Alpha');
  });

  it('does not let team override existing agent display fields', () => {
    const state = createState(
      [{ chatId: 'chat-1', chatName: 'A', agentKey: 'demoAction', teamId: 'team-1', updatedAt: 200 }],
      {
        agents: [{ key: 'demoAction', name: 'AgentFromAgents', icon: { name: 'rocket', color: '#3F7BFA' } }],
        teams: [
          {
            teamId: 'team-1',
            name: 'Team Alpha',
            icon: { name: 'users', color: '#2244AA' }
          }
        ]
      }
    );

    const result = selectAgentLatestChats(state);
    expect(result).toHaveLength(1);
    expect(result[0].agentName).toBe('AgentFromAgents');
    expect(result[0].iconName).toBe('rocket');
    expect(result[0].iconColor).toBe('#3F7BFA');
  });

  it('falls back to team defaultAgentKey when chat has no agentKey', () => {
    const state = createState(
      [{ chatId: 'chat-1', chatName: 'A', teamId: 'team-1', updatedAt: 200 }],
      {
        teams: [
          {
            teamId: 'team-1',
            meta: { defaultAgentKey: 'team-default-agent', defaultAgentKeyValid: true, invalidAgentKeys: [] }
          }
        ]
      }
    );

    const result = selectAgentLatestChats(state);
    expect(result).toHaveLength(1);
    expect(result[0].agentKey).toBe('team-default-agent');
    expect(result[0].latestChat.firstAgentKey).toBe('team-default-agent');
  });

  it('keeps chat result unchanged when teamId does not match any team', () => {
    const state = createState([{ chatId: 'chat-1', chatName: 'A', teamId: 'missing-team', updatedAt: 200 }], {
      teams: [{ teamId: 'team-1', name: 'Team Alpha', icon: { name: 'users', color: '#2244AA' } }]
    });

    const result = selectAgentLatestChats(state);
    expect(result).toHaveLength(1);
    expect(result[0].agentKey).toBe('__unknown_agent__');
    expect(result[0].agentName).toBe('未知智能体');
    expect(result[0].iconName).toBe('');
    expect(result[0].iconColor).toBe('');
  });

  it('aggregates unread count from readStatus for each agent', () => {
    const state = createState([
      { chatId: 'a1', firstAgentKey: 'agent-a', readStatus: 0, updatedAt: 300 },
      { chatId: 'a2', firstAgentKey: 'agent-a', readStatus: 1, updatedAt: 200 },
      { chatId: 'b1', firstAgentKey: 'agent-b', readStatus: 0, updatedAt: 100 },
      { chatId: 'b2', firstAgentKey: 'agent-b', readStatus: 0, updatedAt: 90 }
    ]);

    const result = selectAgentLatestChats(state);
    expect(result.find((item) => item.agentKey === 'agent-a')?.unreadCount).toBe(1);
    expect(result.find((item) => item.agentKey === 'agent-b')?.unreadCount).toBe(2);
  });

  it('keeps mixed team and non-team chats sorted by latest update and preserves unread aggregation', () => {
    const state = createState(
      [
        { chatId: 'team-chat-old', teamId: 'team-1', readStatus: 0, updatedAt: 180 },
        { chatId: 'team-chat-latest', teamId: 'team-1', readStatus: 0, updatedAt: 220 },
        { chatId: 'agent-chat', firstAgentKey: 'agent-b', readStatus: 0, updatedAt: 210 }
      ],
      {
        teams: [
          {
            teamId: 'team-1',
            name: 'Team Alpha',
            meta: { defaultAgentKey: 'team-default-agent', defaultAgentKeyValid: true, invalidAgentKeys: [] }
          }
        ]
      }
    );

    const result = selectAgentLatestChats(state);
    expect(result.map((item) => item.agentKey)).toEqual(['team-default-agent', 'agent-b']);
    expect(result.map((item) => item.latestChat.chatId)).toEqual(['team-chat-latest', 'agent-chat']);
    expect(result.find((item) => item.agentKey === 'team-default-agent')?.unreadCount).toBe(2);
    expect(result.find((item) => item.agentKey === 'agent-b')?.unreadCount).toBe(1);
  });

  it('returns current agent chats by active chat firstAgentKey', () => {
    const state = createState(
      [
        { chatId: 'a1', firstAgentKey: 'agent-a', updatedAt: 100 },
        { chatId: 'a2', firstAgentKey: 'agent-a', updatedAt: 200 },
        { chatId: 'b1', firstAgentKey: 'agent-b', updatedAt: 300 }
      ],
      { chatId: 'a1', selectedAgentKey: 'agent-b' }
    );

    const result = selectCurrentAgentChats(state);
    expect(result.map((item) => item.chatId)).toEqual(['a2', 'a1']);
  });

  it('falls back to selectedAgentKey when active chat is absent', () => {
    const state = createState(
      [
        { chatId: 'a1', firstAgentKey: 'agent-a', updatedAt: 100 },
        { chatId: 'b1', firstAgentKey: 'agent-b', updatedAt: 300 }
      ],
      { chatId: 'missing-chat', selectedAgentKey: 'agent-b' }
    );

    const result = selectCurrentAgentChats(state);
    expect(result.map((item) => item.chatId)).toEqual(['b1']);
  });

  it('memoizes selectAgentLatestChats for identical state references', () => {
    const chats = [{ chatId: 'a1', firstAgentKey: 'agent-a', updatedAt: 100 }];
    const state = createState(chats);

    selectAgentLatestChats(state);
    selectAgentLatestChats(state);

    expect(selectAgentLatestChats.recomputations()).toBe(1);
  });
});
