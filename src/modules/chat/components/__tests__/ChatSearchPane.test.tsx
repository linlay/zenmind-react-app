import React from 'react';
import { act, create } from 'react-test-renderer';
import { ScrollView } from 'react-native';
import { THEMES } from '../../../../core/constants/theme';
import { ChatSearchPane } from '../ChatSearchPane';

describe('ChatSearchPane', () => {
  it('shows mock recent searches when keyword is empty', () => {
    const onSelectRecentKeyword = jest.fn();
    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(
        <ChatSearchPane
          theme={THEMES.light}
          keyword=""
          agentResults={[]}
          chatResults={[]}
          onSelectRecentKeyword={onSelectRecentKeyword}
          onSelectAgent={() => {}}
          onSelectChat={() => {}}
        />
      );
    });

    expect((tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-search-recent-section' })).toBeTruthy();
    const chip = (tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-search-recent-chip-0' });
    act(() => {
      chip.props.onPress();
    });
    expect(onSelectRecentKeyword).toHaveBeenCalledTimes(1);
  });

  it('shows agent/chat results and handles item taps', () => {
    const onSelectAgent = jest.fn();
    const onSelectChat = jest.fn();
    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(
        <ChatSearchPane
          theme={THEMES.light}
          keyword="alpha"
          agentResults={[{ agentKey: 'agent-a', agentName: 'Agent A', latestChatName: '最近会话' }]}
          chatResults={[{ chatId: 'chat-1', chatName: 'Alpha Chat', firstAgentKey: 'agent-a', firstAgentName: 'Agent A', updatedAt: Date.now() } as any]}
          onSelectRecentKeyword={() => {}}
          onSelectAgent={onSelectAgent}
          onSelectChat={onSelectChat}
        />
      );
    });

    expect((tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-search-agent-section' })).toBeTruthy();
    expect((tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-search-chat-section' })).toBeTruthy();

    const agentItem = (tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-search-agent-item-0' });
    act(() => {
      agentItem.props.onPress();
    });
    expect(onSelectAgent).toHaveBeenCalledWith('agent-a');

    const chatItem = (tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-search-chat-item-0' });
    act(() => {
      chatItem.props.onPress();
    });
    expect(onSelectChat).toHaveBeenCalledWith('chat-1', 'agent-a');
  });

  it('configures list taps to work while keyboard is open', () => {
    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(
        <ChatSearchPane
          theme={THEMES.light}
          keyword="alpha"
          agentResults={[{ agentKey: 'agent-a', agentName: 'Agent A', latestChatName: '最近会话' }]}
          chatResults={[{ chatId: 'chat-1', chatName: 'Alpha Chat', firstAgentKey: 'agent-a', firstAgentName: 'Agent A', updatedAt: Date.now() } as any]}
          onSelectRecentKeyword={() => {}}
          onSelectAgent={() => {}}
          onSelectChat={() => {}}
        />
      );
    });

    const scrollView = (tree as ReturnType<typeof create>).root.findByType(ScrollView);
    expect(scrollView.props.keyboardShouldPersistTaps).toBe('handled');
  });
});
