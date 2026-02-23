import React from 'react';
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
  consumeJsonSseXhr: jest.fn(() => Promise.resolve())
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
    TimelineEntryRow: () => ReactLocal.createElement(View, { testID: 'timeline-entry-row' })
  };
});

jest.mock('../components/Composer', () => {
  const ReactLocal = require('react');
  const { Text, TouchableOpacity, View } = require('react-native');
  return {
    Composer: (props: Record<string, unknown>) => {
      const hasTool = Boolean(props.activeFrontendTool);
      mockComposerRender({ hasTool });
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

async function renderScreen() {
  let tree: ReturnType<typeof create> | null = null;
  await act(async () => {
    tree = create(
      <ChatAssistantScreen
        theme={THEMES.light}
        backendUrl="https://app.linlay.cc"
        contentWidth={390}
        onRefreshChats={mockRefreshChats}
        keyboardHeight={0}
      />
    );
  });
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
  return tree as ReturnType<typeof create>;
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
      agents: { selectedAgentKey: 'agent-1', agents: [{ key: 'agent-1', name: 'Agent 1' }] }
    };
    mockInitialChatStateValue = createBaseChatState(null);

    mockDispatch.mockReset();
    mockRefreshChats.mockClear();
    mockLoadChat.mockReset();
    mockLoadChatUnwrap.mockReset();
    mockLoadChatUnwrap.mockResolvedValue({ events: [] });
    mockLoadChat.mockReturnValue({ unwrap: mockLoadChatUnwrap });
    mockSubmitFrontendTool.mockReset();
    mockSubmitFrontendToolUnwrap.mockReset();
    mockSubmitFrontendToolUnwrap.mockResolvedValue({ accepted: true });
    mockSubmitFrontendTool.mockReturnValue({ unwrap: mockSubmitFrontendToolUnwrap });
    mockComposerRender.mockClear();
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
    expect(tree.root.findAllByProps({ testID: 'frontend-tool-overlay' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'composer-without-tool' }).length).toBeGreaterThan(0);

    await act(async () => {
      tree.unmount();
    });
  });
});
