import { RootState } from '../../../../app/store/store';
import { selectAgentLatestChats, selectCurrentAgentChats } from '../chatSelectors';

function createState(
  chats: Array<Record<string, unknown>>,
  options: { chatId?: string; selectedAgentKey?: string; agents?: Array<Record<string, unknown>> } = {}
): RootState {
  return {
    chat: {
      chats,
      chatId: options.chatId || '',
      statusText: '',
      loadingChats: false
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
      { chatId: 'a-older', chatName: 'alpha legacy', firstAgentKey: 'agent-a', firstAgentName: 'Agent A', updatedAt: 100 },
      { chatId: 'a-latest', chatName: 'newest title', firstAgentKey: 'agent-a', firstAgentName: 'Agent A', updatedAt: 200 },
      { chatId: 'b-latest', chatName: 'beta title', firstAgentKey: 'agent-b', firstAgentName: 'Sales Bot', updatedAt: 180 }
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
    const state = createState(
      [{ chatId: 'chat-1', chatName: 'A', agentKey: 'demoAction', updatedAt: 200 }],
      {
        agents: [{ key: 'demoAction', name: 'AgentFromAgents', icon: { name: 'rocket', color: '#3F7BFA' } }]
      }
    );
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
});
