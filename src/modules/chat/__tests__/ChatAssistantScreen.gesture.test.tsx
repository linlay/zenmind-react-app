import React from 'react';
import { act, create } from 'react-test-renderer';
import * as ReactNative from 'react-native';
import { THEMES } from '../../../core/constants/theme';
import { ChatAssistantScreen } from '../screens/ChatAssistantScreen';

const mockDispatch = jest.fn();
const mockRefreshChats = jest.fn(() => Promise.resolve());
const mockLoadChat = jest.fn();
const mockLoadChatUnwrap = jest.fn();
const mockSubmitFrontendTool = jest.fn();
let mockSelectorState: Record<string, unknown> = {};
let mockInitialChatState: Record<string, unknown> = {};

jest.mock('../../../app/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: Record<string, unknown>) => unknown) => selector(mockSelectorState)
}));

jest.mock('../state/chatSlice', () => ({
  setChatId: (payload: string) => ({ type: 'chat/setChatId', payload }),
  setStatusText: (payload: string) => ({ type: 'chat/setStatusText', payload })
}));

jest.mock('../../../modules/user/state/userSlice', () => ({
  toggleTheme: () => ({ type: 'user/toggleTheme' }),
  setThemeMode: (payload: string) => ({ type: 'user/setThemeMode', payload })
}));

jest.mock('../api/chatApi', () => ({
  useLazyGetChatQuery: () => [mockLoadChat, { isFetching: false }],
  useSubmitFrontendToolMutation: () => [mockSubmitFrontendTool]
}));

jest.mock('../services/eventReducer', () => ({
  createEmptyChatState: () => mockInitialChatState,
  createRuntimeMaps: () => ({
    sequence: 0,
    contentIdMap: new Map(),
    toolIdMap: new Map(),
    actionIdMap: new Map(),
    reasoningIdMap: new Map(),
    actionStateMap: new Map(),
    toolStateMap: new Map(),
    runId: ''
  }),
  reduceChatEvent: (prevState: Record<string, unknown>) => ({ next: prevState, effects: [] })
}));

jest.mock('../services/chatStreamClient', () => ({
  consumeJsonSseXhr: jest.fn(() => Promise.resolve())
}));

jest.mock('../../../core/auth/appAuth', () => ({
  getAccessToken: () => Promise.resolve('access-token-1')
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}));

jest.mock('../../../shared/animations/fireworks', () => ({
  createFireworksShow: () => ({ rockets: [], sparks: [] })
}));

jest.mock('../components/TimelineEntryRow', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    TimelineEntryRow: () => ReactLocal.createElement(View, { testID: 'timeline-entry-row' })
  };
});

jest.mock('../components/Composer', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    Composer: () => ReactLocal.createElement(View, { testID: 'mock-composer' })
  };
});

function createBaseChatState(streaming = false) {
  return {
    timeline: [],
    planState: {
      planId: '',
      tasks: [],
      expanded: false,
      lastTaskId: ''
    },
    activeFrontendTool: null,
    actionModal: {
      visible: false,
      title: '',
      content: '',
      closeText: '关闭'
    },
    chatId: '',
    statusText: '',
    streaming,
    expandedTools: {}
  };
}

async function renderScreen(props: Partial<Record<string, unknown>> = {}) {
  let tree: ReturnType<typeof create> | null = null;
  await act(async () => {
    tree = create(
      <ChatAssistantScreen
        theme={THEMES.light}
        backendUrl="https://api.example.com"
        contentWidth={390}
        onRefreshChats={mockRefreshChats}
        keyboardHeight={0}
        onRequestSwitchAgentChat={props.onRequestSwitchAgentChat as any}
        onRequestCreateAgentChatBySwipe={props.onRequestCreateAgentChatBySwipe as any}
      />
    );
  });
  return tree as ReturnType<typeof create>;
}

describe('ChatAssistantScreen gestures', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.spyOn(ReactNative.PanResponder, 'create').mockImplementation((config: Record<string, (...args: any[]) => unknown>) => {
      return {
        panHandlers: {
          onMoveShouldSetResponder: (event: unknown, gesture: unknown) =>
            config.onMoveShouldSetPanResponder?.(event, gesture),
          onResponderRelease: (event: unknown, gesture: unknown) =>
            config.onPanResponderRelease?.(event, gesture)
        }
      } as any;
    });
  });

  beforeEach(() => {
    mockDispatch.mockReset();
    mockSelectorState = {
      chat: { chatId: 'chat-1', statusText: '' },
      agents: { selectedAgentKey: 'agent-1', agents: [{ key: 'agent-1', name: 'Agent 1' }] }
    };
    mockInitialChatState = createBaseChatState(false);
    mockLoadChat.mockReset();
    mockLoadChatUnwrap.mockReset();
    mockLoadChatUnwrap.mockResolvedValue({ events: [], chatImageToken: '' });
    mockLoadChat.mockReturnValue({ unwrap: mockLoadChatUnwrap });
    mockSubmitFrontendTool.mockReset();
    mockSubmitFrontendTool.mockReturnValue({ unwrap: jest.fn().mockResolvedValue({ accepted: true }) });
  });

  afterAll(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('triggers create-chat callback on right-to-left swipe', async () => {
    const onCreate = jest.fn(() => ({ ok: true }));
    const tree = await renderScreen({ onRequestCreateAgentChatBySwipe: onCreate });
    const layer = tree.root.findByProps({ testID: 'chat-timeline-gesture-layer' });
    act(() => {
      layer.props.onMoveShouldSetResponder?.({}, { dx: -90, dy: 8 });
      layer.props.onResponderRelease?.({}, { dx: -90, dy: 8 });
    });
    expect(onCreate).toHaveBeenCalledTimes(1);
    await act(async () => {
      tree.unmount();
      jest.runOnlyPendingTimers();
    });
  });

  it('triggers prev switch when pulling down at top', async () => {
    const onSwitch = jest.fn(() => ({ ok: true }));
    const tree = await renderScreen({ onRequestSwitchAgentChat: onSwitch });
    const layer = tree.root.findByProps({ testID: 'chat-timeline-gesture-layer' });
    act(() => {
      layer.props.onMoveShouldSetResponder?.({}, { dx: 0, dy: 88 });
      layer.props.onResponderRelease?.({}, { dx: 0, dy: 88 });
    });
    expect(onSwitch).toHaveBeenCalledWith('prev');
    await act(async () => {
      tree.unmount();
      jest.runOnlyPendingTimers();
    });
  });

  it('triggers next switch when pulling up at bottom', async () => {
    const onSwitch = jest.fn(() => ({ ok: true }));
    const tree = await renderScreen({ onRequestSwitchAgentChat: onSwitch });
    const list = tree.root.findByProps({ testID: 'chat-timeline-list' });
    act(() => {
      list.props.onScroll({
        nativeEvent: {
          contentOffset: { x: 0, y: 210 },
          layoutMeasurement: { width: 390, height: 240 },
          contentSize: { width: 390, height: 450 }
        }
      });
    });

    const layer = tree.root.findByProps({ testID: 'chat-timeline-gesture-layer' });
    act(() => {
      layer.props.onMoveShouldSetResponder?.({}, { dx: 0, dy: -90 });
      layer.props.onResponderRelease?.({}, { dx: 0, dy: -90 });
    });
    expect(onSwitch).toHaveBeenCalledWith('next');
    await act(async () => {
      tree.unmount();
      jest.runOnlyPendingTimers();
    });
  });

  it('does not switch chat while streaming', async () => {
    mockInitialChatState = createBaseChatState(true);
    const onSwitch = jest.fn(() => ({ ok: true }));
    const tree = await renderScreen({ onRequestSwitchAgentChat: onSwitch });
    const layer = tree.root.findByProps({ testID: 'chat-timeline-gesture-layer' });
    act(() => {
      layer.props.onMoveShouldSetResponder?.({}, { dx: 0, dy: 92 });
      layer.props.onResponderRelease?.({}, { dx: 0, dy: 92 });
    });
    expect(onSwitch).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'chat/setStatusText', payload: '当前正在回复，暂不能切换对话' });
    await act(async () => {
      tree.unmount();
      jest.runOnlyPendingTimers();
    });
  });
});
