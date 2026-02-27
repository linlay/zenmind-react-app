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
          items={[
            {
              agentKey: 'agent-1',
              agentName: 'Agent 1',
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
  });
});
