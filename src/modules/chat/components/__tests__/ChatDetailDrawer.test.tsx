import React from 'react';
import { act, create } from 'react-test-renderer';
import * as ReactNative from 'react-native';
import { THEMES } from '../../../../core/constants/theme';
import { ChatDetailDrawer } from '../ChatDetailDrawer';
const { Animated, StyleSheet } = ReactNative;

describe('ChatDetailDrawer side drawer', () => {
  beforeAll(() => {
    jest.spyOn(Animated, 'timing').mockImplementation(() => {
      return {
        start: (cb?: () => void) => cb?.(),
        stop: () => {}
      } as any;
    });
    jest.spyOn(Animated, 'parallel').mockImplementation((animations: Array<{ start?: () => void }>) => {
      return {
        start: (cb?: () => void) => {
          animations.forEach((animation) => animation.start?.());
          cb?.();
        },
        stop: () => {}
      } as any;
    });
    jest.spyOn(Animated, 'spring').mockImplementation(() => {
      return {
        start: (cb?: () => void) => cb?.(),
        stop: () => {}
      } as any;
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('renders overlay mask and full-height side drawer', () => {
    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(
        <ChatDetailDrawer
          visible
          theme={THEMES.light}
          activeAgentName="Agent A"
          chats={[{ chatId: 'chat-1', chatName: '会话一', updatedAt: Date.now() } as any]}
          activeChatId="chat-1"
          onClose={() => {}}
          onCreateChat={() => {}}
          onSelectChat={() => {}}
        />
      );
    });

    expect((tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-detail-overlay-mask' })).toBeTruthy();
    const drawer = (tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-detail-drawer' });
    const style = StyleSheet.flatten(drawer.props.style) as { right?: number; top?: number; bottom?: number } | undefined;
    expect(style?.right).toBe(0);
    expect(style?.top).toBe(0);
    expect(style?.bottom).toBe(0);
    expect((style as { width?: string }).width).toBe('76%');
    expect((tree as ReturnType<typeof create>).root.findByProps({ children: '与Agent A的对话' })).toBeTruthy();
    expect((tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-detail-drawer-create-chat-btn' })).toBeTruthy();
    expect((tree as ReturnType<typeof create>).root.findByProps({ children: '新建对话 · 详情页左滑' })).toBeTruthy();
  });

  it('calls onClose when tapping mask', () => {
    const onClose = jest.fn();
    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(
        <ChatDetailDrawer
          visible
          theme={THEMES.light}
          activeAgentName="Agent A"
          chats={[{ chatId: 'chat-1', chatName: '会话一', updatedAt: Date.now() } as any]}
          activeChatId="chat-1"
          onClose={onClose}
          onCreateChat={() => {}}
          onSelectChat={() => {}}
        />
      );
    });

    const mask = (tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-detail-overlay-mask' });
    act(() => {
      mask.props.onPress();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onSelectChat when tapping an item', () => {
    const onSelectChat = jest.fn();
    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(
        <ChatDetailDrawer
          visible
          theme={THEMES.light}
          activeAgentName="Agent A"
          chats={[{ chatId: 'chat-7', chatName: '会话七', updatedAt: Date.now(), last: '最近消息' } as any]}
          activeChatId=""
          onClose={() => {}}
          onCreateChat={() => {}}
          onSelectChat={onSelectChat}
        />
      );
    });

    const item = (tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-detail-drawer-item-0' });
    act(() => {
      item.props.onPress();
    });
    expect(onSelectChat).toHaveBeenCalledWith('chat-7');
  });

  it('renders chatName + last fallback and read-state icon', () => {
    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(
        <ChatDetailDrawer
          visible
          theme={THEMES.light}
          activeAgentName="Agent A"
          chats={[
            { chatId: 'chat-7', chatName: '会话七', updatedAt: Date.now(), lastRunContent: 'last content', readStatus: 1 },
            { chatId: 'chat-8', updatedAt: Date.now(), readStatus: 0 }
          ] as any}
          activeChatId=""
          onClose={() => {}}
          onCreateChat={() => {}}
          onSelectChat={() => {}}
        />
      );
    });

    expect((tree as ReturnType<typeof create>).root.findByProps({ children: '会话七' })).toBeTruthy();
    expect((tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-detail-drawer-item-last-0' }).props.children).toBe('last content');
    expect((tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-detail-drawer-item-last-1' }).props.children).toBe('暂无内容');
    const icon0 = (tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-detail-drawer-read-icon-0' });
    const icon1 = (tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-detail-drawer-read-icon-1' });
    expect(icon0.props.children).toBe('○');
    expect(icon1.props.children).toBe('●');
  });

  it('creates new chat from drawer create row', () => {
    const onCreateChat = jest.fn();
    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(
        <ChatDetailDrawer
          visible
          theme={THEMES.light}
          activeAgentName="Agent A"
          chats={[]}
          activeChatId=""
          onClose={() => {}}
          onCreateChat={onCreateChat}
          onSelectChat={() => {}}
        />
      );
    });
    const createBtn = (tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-detail-drawer-create-chat-btn' });
    act(() => {
      createBtn.props.onPress();
    });
    expect(onCreateChat).toHaveBeenCalledTimes(1);
  });

  it('renders preview by progress when drawer is not yet opened', () => {
    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(
        <ChatDetailDrawer
          visible={false}
          previewProgress={0.5}
          interactive={false}
          theme={THEMES.light}
          activeAgentName="Agent A"
          chats={[]}
          activeChatId=""
          onClose={() => {}}
          onCreateChat={() => {}}
          onSelectChat={() => {}}
        />
      );
    });
    const drawer = (tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-detail-drawer' });
    const overlay = (tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-detail-overlay-mask' });
    const style = StyleSheet.flatten(drawer.props.style) as { opacity?: number; transform?: Array<{ translateX?: number }> } | undefined;
    expect(Number(style?.opacity || 0)).toBeGreaterThan(0);
    expect(Number(style?.transform?.[0]?.translateX || 0)).toBeGreaterThan(0);
    expect(overlay).toBeTruthy();
  });

  it('does not allow interaction when interactive=false', () => {
    const onCreateChat = jest.fn();
    const onSelectChat = jest.fn();
    const onClose = jest.fn();
    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(
        <ChatDetailDrawer
          visible={false}
          previewProgress={0.7}
          interactive={false}
          theme={THEMES.light}
          activeAgentName="Agent A"
          chats={[{ chatId: 'chat-7', chatName: '会话七', updatedAt: Date.now() } as any]}
          activeChatId=""
          onClose={onClose}
          onCreateChat={onCreateChat}
          onSelectChat={onSelectChat}
        />
      );
    });

    const mask = (tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-detail-overlay-mask' });
    const createBtn = (tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-detail-drawer-create-chat-btn' });
    const item = (tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-detail-drawer-item-0' });

    act(() => {
      mask.props.onPress?.();
      createBtn.props.onPress?.();
      item.props.onPress?.();
    });

    expect(onClose).toHaveBeenCalledTimes(0);
    expect(onCreateChat).toHaveBeenCalledTimes(0);
    expect(onSelectChat).toHaveBeenCalledTimes(0);
  });
});
