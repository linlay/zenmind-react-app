import React from 'react';
import { act, create } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { THEMES } from '../../../../core/constants/theme';
import { ChatListPane } from '../ChatListPane';

describe('ChatListPane', () => {
  it('uses uniform item background and renders telegram-like unread badge', () => {
    const onSelectChat = jest.fn();
    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(
        <ChatListPane
          theme={THEMES.light}
          loading={false}
          onSelectChat={onSelectChat}
          onSelectAgentProfile={() => {}}
          items={[
            {
              agentKey: 'agent-1',
              agentName: 'Agent 1',
              agentRole: '任务助手',
              latestChat: { chatId: 'chat-1', chatName: '会话1', updatedAt: Date.now() }
            },
            {
              agentKey: 'agent-2',
              agentName: 'Agent 2',
              latestChat: { chatId: 'chat-2', chatName: '会话2', updatedAt: Date.now() }
            }
          ]}
        />
      );
    });

    const item0 = (tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-list-item-0' });
    const item1 = (tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-list-item-1' });
    const item0Style = StyleSheet.flatten(item0.props.style) as { backgroundColor?: string } | undefined;
    const item1Style = StyleSheet.flatten(item1.props.style) as { backgroundColor?: string } | undefined;
    expect(item0Style?.backgroundColor).toBe(THEMES.light.surfaceStrong);
    expect(item1Style?.backgroundColor).toBe(THEMES.light.surfaceStrong);

    expect((tree as ReturnType<typeof create>).root.findAllByProps({ testID: 'chat-search-input' })).toHaveLength(0);
    expect((tree as ReturnType<typeof create>).root.findAllByProps({ testID: 'chat-refresh-btn' })).toHaveLength(0);

    const badge0 = (tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-list-item-unread-badge-0' });
    const badge1 = (tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-list-item-unread-badge-1' });
    const badge0Style = StyleSheet.flatten(badge0.props.style) as { backgroundColor?: string } | undefined;
    const badge1Style = StyleSheet.flatten(badge1.props.style) as { backgroundColor?: string } | undefined;
    expect(badge0Style?.backgroundColor).toBe(THEMES.light.primaryDeep);
    expect(badge1Style?.backgroundColor).toBe(THEMES.light.primaryDeep);

    const role0 = (tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-list-item-agent-role-0' });
    const role0Style = StyleSheet.flatten(role0.props.style) as { color?: string; fontSize?: number } | undefined;
    expect(role0.props.children).toBe('任务助手');
    expect(role0Style?.color).toBe(THEMES.light.textMute);
    expect(role0Style?.fontSize).toBe(12);
    expect((tree as ReturnType<typeof create>).root.findAllByProps({ testID: 'chat-list-item-agent-role-1' })).toHaveLength(0);
  });

  it('opens agent profile from avatar and keeps row click behavior for chat detail', () => {
    const onSelectChat = jest.fn();
    const onSelectAgentProfile = jest.fn();
    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(
        <ChatListPane
          theme={THEMES.light}
          loading={false}
          onSelectChat={onSelectChat}
          onSelectAgentProfile={onSelectAgentProfile}
          items={[
            {
              agentKey: 'agent-1',
              agentName: 'Agent 1',
              latestChat: { chatId: 'chat-1', chatName: '会话1', updatedAt: Date.now() }
            }
          ]}
        />
      );
    });

    const avatarBtn = (tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-list-item-avatar-btn-0' });
    act(() => {
      avatarBtn.props.onPress({ stopPropagation: jest.fn() });
    });
    expect(onSelectAgentProfile).toHaveBeenCalledWith('agent-1');
    expect(onSelectChat).not.toHaveBeenCalled();

    const rowItem = (tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-list-item-0' });
    act(() => {
      rowItem.props.onPress();
    });
    expect(onSelectChat).toHaveBeenCalledWith('chat-1', 'agent-1');
  });
});
