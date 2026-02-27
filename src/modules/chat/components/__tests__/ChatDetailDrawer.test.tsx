import React from 'react';
import { act, create } from 'react-test-renderer';
import * as ReactNative from 'react-native';
import { THEMES } from '../../../../core/constants/theme';
import { ChatDetailDrawer } from '../ChatDetailDrawer';
const { Animated, StyleSheet } = ReactNative;

describe('ChatDetailDrawer side drawer', () => {
  beforeAll(() => {
    jest.spyOn(ReactNative.PanResponder, 'create').mockImplementation((config: Record<string, (...args: any[]) => unknown>) => {
      return {
        panHandlers: {
          onMoveShouldSetResponder: (event: unknown, gesture: unknown) =>
            config.onMoveShouldSetPanResponder?.(event, gesture),
          onResponderGrant: (event: unknown, gesture: unknown) =>
            config.onPanResponderGrant?.(event, gesture),
          onResponderMove: (event: unknown, gesture: unknown) =>
            config.onPanResponderMove?.(event, gesture),
          onResponderRelease: (event: unknown, gesture: unknown) =>
            config.onPanResponderRelease?.(event, gesture),
          onResponderTerminate: (event: unknown, gesture: unknown) =>
            config.onPanResponderTerminate?.(event, gesture)
        }
      } as any;
    });

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
          chats={[{ chatId: 'chat-1', chatName: '会话一', updatedAt: Date.now() } as any]}
          activeChatId="chat-1"
          onClose={() => {}}
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
  });

  it('calls onClose when tapping mask', () => {
    const onClose = jest.fn();
    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(
        <ChatDetailDrawer
          visible
          theme={THEMES.light}
          chats={[{ chatId: 'chat-1', chatName: '会话一', updatedAt: Date.now() } as any]}
          activeChatId="chat-1"
          onClose={onClose}
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
          chats={[{ chatId: 'chat-7', chatName: '会话七', updatedAt: Date.now() } as any]}
          activeChatId=""
          onClose={() => {}}
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

  it('supports swiping right to close drawer', () => {
    const onClose = jest.fn();
    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(
        <ChatDetailDrawer
          visible
          theme={THEMES.light}
          chats={[{ chatId: 'chat-7', chatName: '会话七', updatedAt: Date.now() } as any]}
          activeChatId=""
          onClose={onClose}
          onSelectChat={() => {}}
        />
      );
    });

    const swipeArea = (tree as ReturnType<typeof create>).root.findByProps({ testID: 'chat-detail-drawer-swipe-area' });
    act(() => {
      swipeArea.props.onResponderGrant?.({}, { dx: 0, dy: 0, vx: 0, vy: 0 });
      swipeArea.props.onResponderMove?.({}, { dx: 80, dy: 0, vx: 0.1, vy: 0 });
      swipeArea.props.onResponderRelease?.({}, { dx: 80, dy: 0, vx: 0.1, vy: 0 });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
