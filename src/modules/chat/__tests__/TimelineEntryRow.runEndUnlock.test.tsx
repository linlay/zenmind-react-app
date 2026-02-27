import React from 'react';
import { act, create } from 'react-test-renderer';
import * as ReactNative from 'react-native';
import { TimelineEntryRow } from '../components/TimelineEntryRow';
const { Animated } = ReactNative;

jest.mock('../../../core/auth/appAuth', () => ({
  authorizedFetch: jest.fn()
}));

jest.mock('expo-linear-gradient', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: ({ children, ...props }: { children?: React.ReactNode }) =>
      ReactLocal.createElement(View, props, children)
  };
});

jest.mock('../components/ViewportBlockView', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    ViewportBlockView: () => ReactLocal.createElement(View, { testID: 'mock-viewport' })
  };
});

jest.mock('react-native-markdown-display', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children?: React.ReactNode }) => ReactLocal.createElement(View, { testID: 'mock-markdown' }, children)
  };
});

const theme = {
  timelineLine: '#111',
  timelineDot: '#222',
  ok: '#00aa00',
  danger: '#cc0000',
  warn: '#cc8800',
  text: '#101010',
  textSoft: '#444444',
  textMute: '#666666',
  primary: '#0077ff',
  primaryDeep: '#0044aa',
  primarySoft: '#dde8ff',
  surfaceSoft: '#f5f5f5',
  surfaceStrong: '#efefef',
  systemBubble: '#eee',
  border: '#d0d8e5',
  userBubble: ['#a', '#b'] as [string, string]
};

function createRunEndItem() {
  return {
    id: 'run-end-1',
    kind: 'message',
    role: 'system',
    variant: 'run_end',
    text: '本次运行结束',
    ts: Date.now()
  } as any;
}

function renderRunEndRow(options: { showRunEndUnlock?: boolean; onUnlockNewChat?: () => void } = {}) {
  const onUnlock = options.onUnlockNewChat || jest.fn();
  let tree: ReturnType<typeof create> | null = null;
  act(() => {
    tree = create(
      <TimelineEntryRow
        item={createRunEndItem()}
        theme={theme as any}
        contentWidth={390}
        backendUrl="https://api.example.com"
        chatImageToken="chat-token"
        toolExpanded={false}
        onToggleTool={() => {}}
        onToggleReasoning={() => {}}
        onCopyText={() => {}}
        onImageAuthError={() => {}}
        showRunEndUnlock={Boolean(options.showRunEndUnlock)}
        onUnlockNewChat={onUnlock}
      />
    );
  });
  return { tree: tree as ReturnType<typeof create>, onUnlock };
}

describe('TimelineEntryRow run_end unlock slider', () => {
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
    jest.spyOn(Animated, 'spring').mockImplementation(() => {
      return {
        start: (cb?: () => void) => cb?.(),
        stop: () => {}
      } as any;
    });
    jest.spyOn(Animated, 'sequence').mockImplementation((animations: Array<{ start?: () => void }>) => {
      return {
        start: (cb?: () => void) => {
          animations.forEach((animation) => animation.start?.());
          cb?.();
        },
        stop: () => {}
      } as any;
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('shows slider only when showRunEndUnlock is true', () => {
    const withSlider = renderRunEndRow({ showRunEndUnlock: true });
    expect(withSlider.tree.root.findAllByProps({ testID: 'run-end-unlock-track' }).length).toBeGreaterThan(0);

    const withoutSlider = renderRunEndRow({ showRunEndUnlock: false });
    expect(withoutSlider.tree.root.findAllByProps({ testID: 'run-end-unlock-track' }).length).toBe(0);
  });

  it('triggers unlock when drag passes threshold', () => {
    const onUnlock = jest.fn();
    const { tree } = renderRunEndRow({ showRunEndUnlock: true, onUnlockNewChat: onUnlock });
    const track = tree.root.findByProps({ testID: 'run-end-unlock-track' });
    act(() => {
      track.props.onLayout?.({ nativeEvent: { layout: { width: 180, height: 24, x: 0, y: 0 } } });
    });

    const handle = tree.root.findByProps({ testID: 'run-end-unlock-handle' });
    act(() => {
      handle.props.onResponderGrant?.({}, { dx: 0, dy: 0, vx: 0, vy: 0 });
      handle.props.onResponderMove?.({}, { dx: 90, dy: 0, vx: 0.1, vy: 0 });
      handle.props.onResponderRelease?.({}, { dx: 90, dy: 0, vx: 0.1, vy: 0 });
    });

    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('does not trigger unlock when drag is below threshold', () => {
    const onUnlock = jest.fn();
    const { tree } = renderRunEndRow({ showRunEndUnlock: true, onUnlockNewChat: onUnlock });
    const track = tree.root.findByProps({ testID: 'run-end-unlock-track' });
    act(() => {
      track.props.onLayout?.({ nativeEvent: { layout: { width: 180, height: 24, x: 0, y: 0 } } });
    });

    const handle = tree.root.findByProps({ testID: 'run-end-unlock-handle' });
    act(() => {
      handle.props.onResponderGrant?.({}, { dx: 0, dy: 0, vx: 0, vy: 0 });
      handle.props.onResponderMove?.({}, { dx: 20, dy: 0, vx: 0.1, vy: 0 });
      handle.props.onResponderRelease?.({}, { dx: 20, dy: 0, vx: 0.1, vy: 0 });
    });

    expect(onUnlock).toHaveBeenCalledTimes(0);
  });
});
