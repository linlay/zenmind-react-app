import { act, create } from 'react-test-renderer';
import * as ReactNative from 'react-native';
import { THEMES } from '../../../core/constants/theme';
import { ChatAssistantScreen } from '../screens/ChatAssistantScreen';

const { BackHandler, Platform } = ReactNative;

const mockDispatch = jest.fn();
const mockRefreshChats = jest.fn(() => Promise.resolve());
const mockLoadChat = jest.fn();
const mockLoadChatUnwrap = jest.fn();
const mockSubmitFrontendTool = jest.fn();
const mockSubmitFrontendToolUnwrap = jest.fn();
const mockComposerRender = jest.fn();
const mockTimelineRowRender = jest.fn();
const mockConsumeJsonSseXhr = jest.fn((..._args: any[]) => Promise.resolve());
const mockGetAccessToken = jest.fn((..._args: any[]) => Promise.resolve('access-token-1'));
const mockGetCachedChatDetail = jest.fn();
const mockUpsertChatDetail = jest.fn();

let mockSelectorState: Record<string, unknown> = {};
let mockInitialChatStateValue: Record<string, unknown> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve(undefined)),
    removeItem: jest.fn(() => Promise.resolve(undefined)),
    multiGet: jest.fn(() => Promise.resolve([])),
    multiSet: jest.fn(() => Promise.resolve(undefined)),
    multiRemove: jest.fn(() => Promise.resolve(undefined))
  }
}));

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

jest.mock('../services/chatCacheDb', () => ({
  getCachedChatDetail: (...args: any[]) => mockGetCachedChatDetail(...args),
  upsertChatDetail: (...args: any[]) => mockUpsertChatDetail(...args)
}));

jest.mock('../services/eventReducer', () => ({
  createEmptyChatState: () => mockInitialChatStateValue,
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
  consumeJsonSseXhr: mockConsumeJsonSseXhr
}));

jest.mock('../../../core/auth/appAuth', () => ({
  getAccessToken: (...args: any[]) => mockGetAccessToken(...args)
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}));

jest.mock('../../../shared/animations/fireworks', () => ({
  createFireworksShow: () => ({
    rockets: [],
    sparks: []
  })
}));

jest.mock('../components/TimelineEntryRow', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    TimelineEntryRow: (props: Record<string, unknown>) => {
      mockTimelineRowRender(props);
      return ReactLocal.createElement(View, { testID: 'timeline-entry-row' });
    }
  };
});

jest.mock('../components/Composer', () => {
  const ReactLocal = require('react');
  const { Text, TouchableOpacity, View } = require('react-native');
  return {
    Composer: (props: Record<string, unknown>) => {
      mockComposerRender(props);
      const hasTool = Boolean(props.activeFrontendTool);
      return ReactLocal.createElement(
        View,
        { testID: hasTool ? 'composer-with-tool' : 'composer-without-tool' },
        hasTool
          ? ReactLocal.createElement(
              TouchableOpacity,
              {
                testID: 'composer-submit-tool-btn',
                onPress: () => {
                  (props.onNativeConfirmSubmit as any)({
                    selectedOption: '确认',
                    selectedIndex: 0,
                    freeText: '',
                    isCustom: false
                  }).catch(() => {});
                }
              },
              ReactLocal.createElement(Text, null, 'submit')
            )
          : null
      );
    }
  };
});

function createBaseChatState(activeFrontendTool: Record<string, unknown> | null) {
  return {
    timeline: [],
    planState: {
      planId: '',
      tasks: [],
      expanded: false,
      lastTaskId: ''
    },
    activeFrontendTool,
    actionModal: {
      visible: false,
      title: '',
      content: '',
      closeText: '关闭'
    },
    chatId: '',
    statusText: '',
    streaming: false,
    expandedTools: {}
  };
}

function createActiveFrontendTool() {
  return {
    runId: 'run-sheet',
    toolId: 'tool-sheet',
    toolKey: 'confirm_dialog',
    toolType: 'html',
    toolName: 'confirm_dialog',
    renderMode: 'native_confirm_dialog',
    toolTimeout: null,
    toolParams: {
      question: '确认操作？',
      options: ['确认'],
      allowFreeText: false
    },
    paramsReady: true,
    paramsError: '',
    argsText: '',
    toolInitDispatched: false,
    userInteracted: false,
    initAttempt: 0,
    initLastSentAtMs: undefined,
    viewportHtml: null,
    loading: false,
    loadError: ''
  };
}

function createTimelineEntry(id = 'assistant-entry-1') {
  return {
    id,
    kind: 'message',
    role: 'assistant',
    text: 'hello',
    ts: Date.now()
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
        onChatViewed={props.onChatViewed as any}
      />
    );
  });
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
  return tree as ReturnType<typeof create>;
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderTimelineRowViaList(tree: ReturnType<typeof create>) {
  const list = tree.root.findByProps({ testID: 'chat-timeline-list' });
  const sampleItem = {
    id: 'assistant-sample',
    kind: 'message',
    role: 'assistant',
    text: 'hello',
    ts: Date.now()
  };
  const element = list.props.renderItem({ item: sampleItem });
  let rowTree: ReturnType<typeof create> | null = null;
  act(() => {
    rowTree = create(element);
  });
  act(() => {
    rowTree?.unmount();
  });
}

describe('ChatAssistantScreen frontend tool overlay', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    const globalWindow = (
      globalThis as unknown as { window?: { dispatchEvent?: (...args: unknown[]) => unknown } }
    ).window;
    if (!globalWindow) {
      (globalThis as unknown as { window: { dispatchEvent: (...args: unknown[]) => unknown } }).window = {
        dispatchEvent: () => undefined
      };
    } else if (typeof globalWindow.dispatchEvent !== 'function') {
      globalWindow.dispatchEvent = () => undefined;
    }
  });

  beforeEach(() => {
    mockSelectorState = {
      chat: { chatId: '', statusText: '' },
      user: { selectedAgentKey: 'agent-1' },
      agents: { agents: [{ key: 'agent-1', name: 'Agent 1' }] }
    };
    mockInitialChatStateValue = createBaseChatState(null);

    mockDispatch.mockReset();
    mockRefreshChats.mockClear();
    mockLoadChat.mockReset();
    mockLoadChatUnwrap.mockReset();
    mockLoadChatUnwrap.mockResolvedValue({ events: [], chatImageToken: '' });
    mockLoadChat.mockReturnValue({ unwrap: mockLoadChatUnwrap });
    mockSubmitFrontendTool.mockReset();
    mockSubmitFrontendToolUnwrap.mockReset();
    mockSubmitFrontendToolUnwrap.mockResolvedValue({ accepted: true });
    mockSubmitFrontendTool.mockReturnValue({ unwrap: mockSubmitFrontendToolUnwrap });
    mockComposerRender.mockClear();
    mockTimelineRowRender.mockClear();
    mockConsumeJsonSseXhr.mockReset();
    mockConsumeJsonSseXhr.mockResolvedValue(undefined);
    mockGetAccessToken.mockReset();
    mockGetAccessToken.mockResolvedValue('access-token-1');
    mockGetCachedChatDetail.mockReset();
    mockGetCachedChatDetail.mockResolvedValue(null);
    mockUpsertChatDetail.mockReset();
    mockUpsertChatDetail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.clearAllTimers();
    jest.restoreAllMocks();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('does not render overlay when no active frontend tool', async () => {
    mockInitialChatStateValue = createBaseChatState(null);
    const tree = await renderScreen();

    expect(tree.root.findAllByProps({ testID: 'frontend-tool-overlay' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'composer-without-tool' }).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ testID: 'composer-with-tool' })).toHaveLength(0);

    await act(async () => {
      tree.unmount();
    });
  });

  it('calls onChatViewed after loading chat history from cache', async () => {
    const onChatViewed = jest.fn(() => Promise.resolve());
    mockSelectorState = {
      chat: { chatId: 'chat-history-1', statusText: '' },
      user: { selectedAgentKey: 'agent-1' },
      agents: { agents: [{ key: 'agent-1', name: 'Agent 1' }] }
    };
    mockGetCachedChatDetail.mockResolvedValue({
      chatId: 'chat-history-1',
      chatName: '历史会话',
      chatImageToken: '',
      events: [{ type: 'content.snapshot', contentId: 'content-1', text: 'cached response' }],
      detailUpdatedAt: Date.now()
    });

    const tree = await renderScreen({ onChatViewed });
    await flushMicrotasks();

    expect(onChatViewed).toHaveBeenCalledWith('chat-history-1');
    expect(mockLoadChat).not.toHaveBeenCalled();

    await act(async () => {
      tree.unmount();
    });
  });

  it('renders overlay with bottom sheet and no inline composer when active tool exists', async () => {
    mockInitialChatStateValue = createBaseChatState(createActiveFrontendTool());
    const tree = await renderScreen();

    expect(tree.root.findAllByProps({ testID: 'frontend-tool-overlay' }).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ testID: 'frontend-tool-overlay-mask' }).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ testID: 'frontend-tool-overlay-sheet' }).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ testID: 'composer-with-tool' }).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ testID: 'composer-without-tool' })).toHaveLength(0);

    await act(async () => {
      tree.unmount();
    });
  });

  it('registers and blocks android hardware back when overlay is active', async () => {
    const originalOs = Platform.OS;
    (Platform as { OS: string }).OS = 'android';
    const remove = jest.fn();
    const addListenerSpy = jest
      .spyOn(BackHandler, 'addEventListener')
      .mockReturnValue({ remove } as unknown as ReturnType<typeof BackHandler.addEventListener>);

    mockInitialChatStateValue = createBaseChatState(createActiveFrontendTool());
    const tree = await renderScreen();

    expect(addListenerSpy).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
    const handler = addListenerSpy.mock.calls[0][1] as () => boolean;
    expect(handler()).toBe(true);

    await act(async () => {
      tree.unmount();
    });
    expect(remove).toHaveBeenCalledTimes(1);

    (Platform as { OS: string }).OS = originalOs;
  });

  it('disables clipped subviews for web timeline list', async () => {
    const originalOs = Platform.OS;
    (Platform as { OS: string }).OS = 'web';

    try {
      mockInitialChatStateValue = createBaseChatState(null);
      const tree = await renderScreen();
      const list = tree.root.findByProps({ testID: 'chat-timeline-list' });
      expect(list.props.removeClippedSubviews).toBe(false);
      await act(async () => {
        tree.unmount();
      });
    } finally {
      (Platform as { OS: string }).OS = originalOs;
    }
  });

  it('configures timeline list with stable scroll options', async () => {
    const tree = await renderScreen();
    const list = tree.root.findByProps({ testID: 'chat-timeline-list' });
    expect(list.props.removeClippedSubviews).toBe(false);
    expect(list.props.keyboardShouldPersistTaps).toBe('handled');
    await act(async () => {
      tree.unmount();
    });
  });

  it('does not show scroll-to-bottom button when timeline is not scrollable', async () => {
    mockInitialChatStateValue = {
      ...createBaseChatState(null),
      timeline: [createTimelineEntry()]
    };
    const tree = await renderScreen();
    const list = tree.root.findByProps({ testID: 'chat-timeline-list' });

    act(() => {
      list.props.onLayout({ nativeEvent: { layout: { width: 390, height: 320 } } });
      list.props.onContentSizeChange(390, 220);
      list.props.onScroll({
        nativeEvent: {
          contentOffset: { x: 0, y: 0 },
          layoutMeasurement: { width: 390, height: 320 },
          contentSize: { width: 390, height: 220 }
        }
      });
    });

    expect(tree.root.findAllByProps({ testID: 'scroll-to-bottom-btn' })).toHaveLength(0);

    await act(async () => {
      tree.unmount();
    });
  });

  it('does not show scroll-to-bottom button when content size arrives before layout', async () => {
    mockInitialChatStateValue = {
      ...createBaseChatState(null),
      timeline: [createTimelineEntry()]
    };
    const tree = await renderScreen();
    const list = tree.root.findByProps({ testID: 'chat-timeline-list' });

    act(() => {
      list.props.onContentSizeChange(390, 220);
    });
    expect(tree.root.findAllByProps({ testID: 'scroll-to-bottom-btn' })).toHaveLength(0);

    act(() => {
      list.props.onLayout({ nativeEvent: { layout: { width: 390, height: 320 } } });
      list.props.onScroll({
        nativeEvent: {
          contentOffset: { x: 0, y: 0 },
          layoutMeasurement: { width: 390, height: 320 },
          contentSize: { width: 390, height: 220 }
        }
      });
    });
    expect(tree.root.findAllByProps({ testID: 'scroll-to-bottom-btn' })).toHaveLength(0);

    await act(async () => {
      tree.unmount();
    });
  });

  it('shows edge toasts for scrollable timeline edges and auto hides after 2s', async () => {
    mockInitialChatStateValue = {
      ...createBaseChatState(null),
      timeline: [createTimelineEntry()]
    };
    const tree = await renderScreen();
    const list = tree.root.findByProps({ testID: 'chat-timeline-list' });

    act(() => {
      list.props.onLayout({ nativeEvent: { layout: { width: 390, height: 240 } } });
      list.props.onContentSizeChange(390, 700);
      list.props.onScroll({
        nativeEvent: {
          contentOffset: { x: 0, y: 180 },
          layoutMeasurement: { width: 390, height: 240 },
          contentSize: { width: 390, height: 700 }
        }
      });
    });

    expect(tree.root.findAllByProps({ testID: 'chat-edge-toast-top' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'chat-edge-toast-bottom' })).toHaveLength(0);

    act(() => {
      list.props.onScroll({
        nativeEvent: {
          contentOffset: { x: 0, y: 0 },
          layoutMeasurement: { width: 390, height: 240 },
          contentSize: { width: 390, height: 700 }
        }
      });
    });

    expect(tree.root.findAllByProps({ testID: 'chat-edge-toast-top' }).length).toBeGreaterThan(0);

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(tree.root.findAllByProps({ testID: 'chat-edge-toast-top' })).toHaveLength(0);

    act(() => {
      list.props.onScroll({
        nativeEvent: {
          contentOffset: { x: 0, y: 120 },
          layoutMeasurement: { width: 390, height: 240 },
          contentSize: { width: 390, height: 700 }
        }
      });
      list.props.onScroll({
        nativeEvent: {
          contentOffset: { x: 0, y: 460 },
          layoutMeasurement: { width: 390, height: 240 },
          contentSize: { width: 390, height: 700 }
        }
      });
    });

    expect(tree.root.findAllByProps({ testID: 'chat-edge-toast-bottom' }).length).toBeGreaterThan(0);

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(tree.root.findAllByProps({ testID: 'chat-edge-toast-bottom' })).toHaveLength(0);

    await act(async () => {
      tree.unmount();
    });
  });

  it('does not show edge toasts when viewport height is unknown', async () => {
    mockInitialChatStateValue = {
      ...createBaseChatState(null),
      timeline: [createTimelineEntry()]
    };
    const tree = await renderScreen();
    const list = tree.root.findByProps({ testID: 'chat-timeline-list' });

    act(() => {
      list.props.onContentSizeChange(390, 700);
      list.props.onScroll({
        nativeEvent: {
          contentOffset: { x: 0, y: 0 },
          layoutMeasurement: { width: 390, height: 0 },
          contentSize: { width: 390, height: 700 }
        }
      });
      list.props.onScroll({
        nativeEvent: {
          contentOffset: { x: 0, y: 460 },
          layoutMeasurement: { width: 390, height: 0 },
          contentSize: { width: 390, height: 700 }
        }
      });
    });

    expect(tree.root.findAllByProps({ testID: 'chat-edge-toast-top' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'chat-edge-toast-bottom' })).toHaveLength(0);

    await act(async () => {
      tree.unmount();
    });
  });

  it('does not show edge toasts when timeline is not scrollable', async () => {
    mockInitialChatStateValue = {
      ...createBaseChatState(null),
      timeline: [createTimelineEntry()]
    };
    const tree = await renderScreen();
    const list = tree.root.findByProps({ testID: 'chat-timeline-list' });

    act(() => {
      list.props.onLayout({ nativeEvent: { layout: { width: 390, height: 300 } } });
      list.props.onContentSizeChange(390, 180);
      list.props.onScroll({
        nativeEvent: {
          contentOffset: { x: 0, y: 0 },
          layoutMeasurement: { width: 390, height: 300 },
          contentSize: { width: 390, height: 180 }
        }
      });
      list.props.onScroll({
        nativeEvent: {
          contentOffset: { x: 0, y: 12 },
          layoutMeasurement: { width: 390, height: 300 },
          contentSize: { width: 390, height: 180 }
        }
      });
      list.props.onScroll({
        nativeEvent: {
          contentOffset: { x: 0, y: 0 },
          layoutMeasurement: { width: 390, height: 300 },
          contentSize: { width: 390, height: 180 }
        }
      });
    });

    expect(tree.root.findAllByProps({ testID: 'chat-edge-toast-top' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'chat-edge-toast-bottom' })).toHaveLength(0);

    await act(async () => {
      tree.unmount();
    });
  });

  it('passes history chatImageToken from getChat response to row renderer', async () => {
    mockSelectorState = {
      chat: { chatId: 'chat-history-1', statusText: '' },
      user: { selectedAgentKey: 'agent-1' },
      agents: { agents: [{ key: 'agent-1', name: 'Agent 1' }] }
    };
    mockLoadChatUnwrap.mockResolvedValue({
      chatId: 'chat-history-1',
      chatImageToken: 'history-token-1',
      events: []
    });

    const tree = await renderScreen();
    await flushMicrotasks();
    renderTimelineRowViaList(tree);

    const latestRowProps = mockTimelineRowRender.mock.calls[mockTimelineRowRender.mock.calls.length - 1]?.[0] || {};
    expect(latestRowProps.chatImageToken).toBe('history-token-1');

    await act(async () => {
      tree.unmount();
    });
  });

  it('updates row chatImageToken when chat.start event carries token', async () => {
    mockSelectorState = {
      chat: { chatId: 'chat-stream-1', statusText: '' },
      user: { selectedAgentKey: 'agent-1' },
      agents: { agents: [{ key: 'agent-1', name: 'Agent 1' }] }
    };
    mockLoadChatUnwrap.mockResolvedValue({
      chatId: 'chat-stream-1',
      chatImageToken: '',
      events: [{ type: 'chat.start', chatImageToken: 'stream-token-1' }]
    });

    const tree = await renderScreen();
    await flushMicrotasks();

    renderTimelineRowViaList(tree);
    const latestRowProps = mockTimelineRowRender.mock.calls[mockTimelineRowRender.mock.calls.length - 1]?.[0] || {};
    expect(latestRowProps.chatImageToken).toBe('stream-token-1');

    await act(async () => {
      tree.unmount();
    });
  });

  it('hides overlay after frontend tool submit succeeds', async () => {
    mockInitialChatStateValue = createBaseChatState(createActiveFrontendTool());
    const tree = await renderScreen();

    expect(tree.root.findAllByProps({ testID: 'frontend-tool-overlay' }).length).toBeGreaterThan(0);
    const submitBtn = tree.root.findByProps({ testID: 'composer-submit-tool-btn' });

    await act(async () => {
      submitBtn.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSubmitFrontendTool).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByProps({ testID: 'frontend-tool-overlay' }).length).toBeGreaterThan(0);

    act(() => {
      jest.advanceTimersByTime(220);
    });

    expect(tree.root.findAllByProps({ testID: 'frontend-tool-overlay' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'composer-without-tool' }).length).toBeGreaterThan(0);

    await act(async () => {
      tree.unmount();
    });
  });
});
