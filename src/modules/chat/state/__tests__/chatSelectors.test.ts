import { RootState } from '../../../../app/store/store';
import { selectAgentLatestChats, selectCurrentAgentChats, selectFilteredChats } from '../chatSelectors';

function createState(
  chats: Array<Record<string, unknown>>,
  chatKeyword = '',
  options: { chatId?: string; selectedAgentKey?: string; agents?: Array<Record<string, unknown>> } = {}
): RootState {
  return {
    chat: {
      chats,
      chatId: options.chatId || '',
      chatKeyword,
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
  it('sorts chats by updatedAt and then createdAt', () => {
    const state = createState([
      { chatId: 'chat-1', chatName: 'one', updatedAt: new Date(2026, 1, 20, 8, 0, 0).getTime() },
      { chatId: 'chat-2', chatName: 'two', updatedAt: new Date(2026, 1, 21, 8, 0, 0).getTime() },
      { chatId: 'chat-3', chatName: 'three', createdAt: new Date(2026, 1, 19, 8, 0, 0).getTime() }
    ]);

    const result = selectFilteredChats(state);
    expect(result.map((item) => item.chatId)).toEqual(['chat-2', 'chat-1', 'chat-3']);
  });

  it('matches keyword by chatName, title, firstAgentName and firstAgentKey', () => {
    const state = createState(
      [
        { chatId: 'chat-1', chatName: 'Alpha 会话', title: '无关键字', updatedAt: 400 },
        { chatId: 'chat-2', chatName: 'Beta 会话', title: 'Alpha 标题', updatedAt: 300 },
        { chatId: 'chat-3', chatName: 'Gamma 会话', firstAgentName: 'Alpha Agent', updatedAt: 200 },
        { chatId: 'chat-4', chatName: 'Delta 会话', firstAgentKey: 'alpha-key', updatedAt: 100 }
      ],
      'alpha'
    );

    const result = selectFilteredChats(state);
    expect(result.map((item) => item.chatId)).toEqual(['chat-1', 'chat-2', 'chat-3', 'chat-4']);
  });

  it('still allows keyword matching by chatId for定位', () => {
    const state = createState(
      [
        { chatId: 'chat-target', chatName: '普通会话', title: '无关键字' },
        { chatId: 'chat-other', chatName: '其他会话', title: '无关键字' }
      ],
      'target'
    );

    const result = selectFilteredChats(state);
    expect(result.map((item) => item.chatId)).toEqual(['chat-target']);
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
    const state = createState(
      [
        { chatId: 'a-older', chatName: 'alpha legacy', firstAgentKey: 'agent-a', firstAgentName: 'Agent A', updatedAt: 100 },
        { chatId: 'a-latest', chatName: 'newest title', firstAgentKey: 'agent-a', firstAgentName: 'Agent A', updatedAt: 200 },
        { chatId: 'b-latest', chatName: 'beta title', firstAgentKey: 'agent-b', firstAgentName: 'Sales Bot', updatedAt: 180 }
      ],
      'sales'
    );

    const byAgentName = selectAgentLatestChats(state);
    expect(byAgentName.map((item) => item.agentKey)).toEqual(['agent-b']);

    const byLatestTitle = selectAgentLatestChats(createState(state.chat.chats, 'newest'));
    expect(byLatestTitle.map((item) => item.agentKey)).toEqual(['agent-a']);

    const byAgentKey = selectAgentLatestChats(createState(state.chat.chats, 'agent-b'));
    expect(byAgentKey.map((item) => item.agentKey)).toEqual(['agent-b']);
  });

  it('uses agentKey and resolves display name from agents first', () => {
    const state = createState(
      [
        { chatId: 'chat-1', chatName: 'A', agentKey: 'demoAction', agentName: 'ChatAgentName', updatedAt: 200 },
        { chatId: 'chat-2', chatName: 'B', agentKey: 'demoAction', updatedAt: 100 }
      ],
      '',
      {
        agents: [{ key: 'demoAction', name: 'AgentFromAgents' }]
      }
    );
    const result = selectAgentLatestChats(state);
    expect(result).toHaveLength(1);
    expect(result[0].agentKey).toBe('demoAction');
    expect(result[0].agentName).toBe('AgentFromAgents');
  });

  it('returns current agent chats by active chat firstAgentKey', () => {
    const state = createState(
      [
        { chatId: 'a1', firstAgentKey: 'agent-a', updatedAt: 100 },
        { chatId: 'a2', firstAgentKey: 'agent-a', updatedAt: 200 },
        { chatId: 'b1', firstAgentKey: 'agent-b', updatedAt: 300 }
      ],
      '',
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
      '',
      { chatId: 'missing-chat', selectedAgentKey: 'agent-b' }
    );

    const result = selectCurrentAgentChats(state);
    expect(result.map((item) => item.chatId)).toEqual(['b1']);
  });
});
