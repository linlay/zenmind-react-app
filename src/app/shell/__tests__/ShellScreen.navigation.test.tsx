import React from 'react';
import { act, create } from 'react-test-renderer';
import * as ReactNative from 'react-native';
import { ShellScreen } from '../ShellScreen';

const mockDispatch = jest.fn();
let mockSelectorState: Record<string, any> = {};

const mockTriggerAgents = jest.fn();
const mockTriggerChats = jest.fn();
const mockTriggerTerminalSessions = jest.fn();
let keyboardDismissSpy: jest.SpyInstance;

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null
}));

jest.mock('react-native-safe-area-context', () => {
  const ReactLocal = require('react');
  const ReactNativeLocal = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => ReactLocal.createElement(ReactNativeLocal.View, null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
  };
});

jest.mock('../../store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: Record<string, any>) => unknown) => selector(mockSelectorState)
}));

jest.mock('../../../modules/chat/screens/ChatAssistantScreen', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    ChatAssistantScreen: () => ReactLocal.createElement(View, { testID: 'mock-chat-assistant-screen' })
  };
});

jest.mock('../../../modules/terminal/screens/TerminalScreen', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    TerminalScreen: () => ReactLocal.createElement(View, { testID: 'mock-terminal-screen' })
  };
});

jest.mock('../../../modules/agents/screens/AgentsScreen', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    AgentsScreen: () => ReactLocal.createElement(View, { testID: 'mock-agents-screen' })
  };
});

jest.mock('../../../modules/user/screens/UserSettingsScreen', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    UserSettingsScreen: () => ReactLocal.createElement(View, { testID: 'mock-user-settings-screen' })
  };
});

jest.mock('../../../modules/chat/components/AgentSidebar', () => ({
  AgentSidebar: () => null
}));

jest.mock('../../../modules/chat/components/ChatDetailDrawer', () => ({
  ChatDetailDrawer: ({
    visible,
    activeAgentName,
    onSelectChat,
    onClose,
    onCreateChat
  }: {
    visible: boolean;
    activeAgentName: string;
    onSelectChat: (chatId: string) => void;
    onClose: () => void;
    onCreateChat: () => void;
  }) => {
    if (!visible) {
      return null;
    }
    const ReactLocal = require('react');
    const { TouchableOpacity, View } = require('react-native');
    return ReactLocal.createElement(
      View,
      { testID: 'mock-chat-detail-overlay', accessibilityLabel: activeAgentName },
      ReactLocal.createElement(TouchableOpacity, {
        testID: 'mock-chat-detail-overlay-select',
        onPress: () => onSelectChat('chat-2')
      }),
      ReactLocal.createElement(TouchableOpacity, {
        testID: 'mock-chat-detail-overlay-close',
        onPress: onClose
      }),
      ReactLocal.createElement(TouchableOpacity, {
        testID: 'mock-chat-detail-overlay-create',
        onPress: onCreateChat
      })
    );
  }
}));

jest.mock('../../../core/storage/settingsStorage', () => ({
  buildDefaultSettings: () => ({
    themeMode: 'light',
    endpointInput: 'https://api.example.com',
    ptyUrlInput: 'https://api.example.com/appterm',
    selectedAgentKey: '',
    activeDomain: 'chat'
  }),
  loadSettings: () => Promise.resolve({}),
  patchSettings: () => Promise.resolve({})
}));

jest.mock('../../../modules/agents/api/agentsApi', () => ({
  useLazyGetAgentsQuery: () => [mockTriggerAgents]
}));

jest.mock('../../../modules/chat/api/chatApi', () => ({
  useLazyGetChatsQuery: () => [mockTriggerChats]
}));

jest.mock('../../../modules/terminal/api/terminalApi', () => ({
  useLazyListTerminalSessionsQuery: () => [mockTriggerTerminalSessions]
}));

jest.mock('../../../core/network/apiClient', () => ({
  fetchAuthedJson: (...args: any[]) => {
    const path = String(args[1] || '');
    if (path.includes('/unread-count')) {
      return Promise.resolve({ unreadCount: 0 });
    }
    return Promise.resolve([]);
  },
  formatError: () => 'error'
}));

jest.mock('../../../core/auth/appAuth', () => ({
  ensureFreshAccessToken: () => Promise.resolve('token'),
  getCurrentSession: () => ({
    accessToken: 'token',
    accessExpireAtMs: Date.now() + 60_000,
    username: 'tester',
    deviceName: 'device'
  }),
  getAccessToken: () => Promise.resolve('token'),
  getDefaultDeviceName: () => 'device',
  loginWithMasterPassword: () => Promise.resolve({}),
  logoutCurrentDevice: () => Promise.resolve({}),
  restoreSession: () =>
    Promise.resolve({
      accessToken: 'token',
      accessExpireAtMs: Date.now() + 60_000,
      username: 'tester',
      deviceName: 'device'
    }),
  subscribeAuthSession: () => () => {}
}));

jest.mock('../../../core/auth/webViewAuthBridge', () => ({
  WebViewAuthRefreshCoordinator: class {
    async refresh() {
      return { ok: true, accessToken: 'token' };
    }
  }
}));

function makeState(overrides: Partial<Record<string, any>> = {}) {
  const user = {
    booting: false,
    themeMode: 'light',
    endpointDraft: 'https://api.example.com',
    endpointInput: 'https://api.example.com',
    ptyUrlInput: 'https://api.example.com/appterm',
    selectedAgentKey: 'agent-1',
    activeDomain: 'chat',
    ...overrides.user
  };
  return {
    shell: {
      chatRoute: 'list',
      chatSearchQuery: '',
      chatOverlayStack: [],
      terminalPane: 'list',
      chatAgentsSidebarOpen: false,
      chatDetailDrawerOpen: false,
      chatDetailDrawerPreviewProgress: 0,
      ...overrides.shell
    },
    user,
    chat: {
      chatId: '',
      chatKeyword: '',
      loadingChats: false,
      chats: [{ chatId: 'chat-1', chatName: 'Test Chat', firstAgentName: 'Agent 1', firstAgentKey: 'agent-1', updatedAt: Date.now() }],
      statusText: '',
      ...overrides.chat
    },
    agents: {
      loading: false,
      agents: [{ key: 'agent-1', name: 'Agent 1' }],
      selectedAgentKey: 'agent-1',
      ...overrides.agents
    },
    terminal: {
      activeSessionId: '',
      ptyReloadKey: 0,
      ptyLoading: false,
      ptyLoadError: '',
      openNewSessionNonce: 0,
      ...overrides.terminal
    }
  };
}

async function renderScreen(overrides: Partial<Record<string, any>> = {}) {
  mockSelectorState = makeState(overrides);
  mockTriggerAgents.mockReturnValue({ unwrap: () => Promise.resolve([{ key: 'agent-1', name: 'Agent 1' }]) });
  mockTriggerChats.mockReturnValue({ unwrap: () => Promise.resolve(mockSelectorState.chat.chats) });
  mockTriggerTerminalSessions.mockReturnValue({
    unwrap: () => Promise.resolve([{ sessionId: 's-1', title: 'session-1' }])
  });

  let tree: ReturnType<typeof create> | null = null;
  await act(async () => {
    tree = create(<ShellScreen />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree as ReturnType<typeof create>;
}

describe('ShellScreen navigation flow', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    (globalThis as any).WebSocket = class {
      onopen: (() => void) | null = null;
      onclose: (() => void) | null = null;
      onmessage: ((evt: any) => void) | null = null;
      onerror: (() => void) | null = null;
      close() {}
    };
  });

  beforeEach(() => {
    mockDispatch.mockClear();
    mockTriggerAgents.mockReset();
    mockTriggerChats.mockReset();
    mockTriggerTerminalSessions.mockReset();
    keyboardDismissSpy = jest.spyOn(ReactNative.Keyboard, 'dismiss').mockImplementation(() => {});
  });

  afterEach(() => {
    keyboardDismissSpy.mockRestore();
  });

  it('switches domain from bottom nav', async () => {
    const tree = await renderScreen();
    const terminalTab = tree.root.findByProps({ testID: 'bottom-nav-tab-terminal' });
    act(() => {
      terminalTab.props.onPress();
    });
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'user/setActiveDomain', payload: 'terminal' });
  });

  it('opens chat detail overlay when selecting chat list item', async () => {
    const tree = await renderScreen();
    const item = tree.root.findByProps({ testID: 'chat-list-item-0' });
    act(() => {
      item.props.onPress();
    });

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'chat/setChatId', payload: 'chat-1' });
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'agents/setSelectedAgentKey', payload: 'agent-1' });
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'user/setSelectedAgentKey', payload: 'agent-1' });
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'shell/pushChatOverlay', payload: expect.objectContaining({ type: 'chatDetail' }) })
    );
  });

  it('opens agent detail overlay when tapping avatar in chat list item', async () => {
    const tree = await renderScreen();
    const avatarBtn = tree.root.findByProps({ testID: 'chat-list-item-avatar-btn-0' });
    act(() => {
      avatarBtn.props.onPress({ stopPropagation: jest.fn() });
    });

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'agents/setSelectedAgentKey', payload: 'agent-1' });
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'user/setSelectedAgentKey', payload: 'agent-1' });
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'shell/pushChatOverlay', payload: expect.objectContaining({ type: 'agentDetail' }) })
    );
  });

  it('hides bottom nav when chat overlay stack has active item', async () => {
    const tree = await renderScreen({
      user: { activeDomain: 'chat' },
      shell: { chatOverlayStack: [{ overlayId: 'overlay-chat-1', type: 'chatDetail' }] }
    });
    expect(tree.root.findAllByProps({ testID: 'bottom-nav-tab-chat' }).length).toBe(0);
  });

  it('shows search route and exits by back button', async () => {
    const tree = await renderScreen({ user: { activeDomain: 'chat' }, shell: { chatRoute: 'search', chatSearchQuery: 'agent' } });
    expect(tree.root.findByProps({ testID: 'chat-route-track' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'chat-route-page-list' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'chat-route-page-search' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'chat-search-pane' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'chat-top-search-input' })).toBeTruthy();

    const backBtn = tree.root.findByProps({ testID: 'chat-search-back-btn' });
    act(() => {
      backBtn.props.onPress();
    });
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'shell/showChatListRoute', payload: undefined });
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'shell/setChatSearchQuery', payload: '' });
  });

  it('opens agent detail overlay from search results', async () => {
    const tree = await renderScreen({
      user: { activeDomain: 'chat' },
      shell: { chatRoute: 'search', chatSearchQuery: 'agent' }
    });
    const agentItem = tree.root.findByProps({ testID: 'chat-search-agent-item-0' });
    act(() => {
      agentItem.props.onPress();
    });

    expect(keyboardDismissSpy).toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'agents/setSelectedAgentKey', payload: 'agent-1' });
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'user/setSelectedAgentKey', payload: 'agent-1' });
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'shell/pushChatOverlay', payload: expect.objectContaining({ type: 'agentDetail' }) })
    );
  });

  it('opens chat detail overlay from search chat results and dismisses keyboard', async () => {
    const tree = await renderScreen({
      user: { activeDomain: 'chat' },
      shell: { chatRoute: 'search', chatSearchQuery: 'agent' }
    });
    const chatItem = tree.root.findByProps({ testID: 'chat-search-chat-item-0' });
    act(() => {
      chatItem.props.onPress();
    });

    expect(keyboardDismissSpy).toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'chat/setChatId', payload: 'chat-1' });
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'agents/setSelectedAgentKey', payload: 'agent-1' });
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'user/setSelectedAgentKey', payload: 'agent-1' });
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'shell/pushChatOverlay', payload: expect.objectContaining({ type: 'chatDetail' }) })
    );
  });

  it('opens chat detail drawer from the right menu action', async () => {
    const tree = await renderScreen({
      user: { activeDomain: 'chat' },
      shell: { chatOverlayStack: [{ overlayId: 'overlay-chat-1', type: 'chatDetail' }] }
    });
    const menuBtn = tree.root.findByProps({ testID: 'chat-detail-menu-btn' });
    act(() => {
      menuBtn.props.onPress();
    });
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'shell/openChatDetailDrawer', payload: undefined });
  });

  it('switches chat when selecting an item in chat detail drawer', async () => {
    const tree = await renderScreen({
      user: { activeDomain: 'chat' },
      shell: {
        chatOverlayStack: [{ overlayId: 'overlay-chat-1', type: 'chatDetail' }],
        chatDetailDrawerOpen: true
      },
      chat: {
        chatId: 'chat-1',
        chats: [
          { chatId: 'chat-1', chatName: 'Chat 1', firstAgentName: 'Agent 1', firstAgentKey: 'agent-1', updatedAt: 200 },
          { chatId: 'chat-2', chatName: 'Chat 2', firstAgentName: 'Agent 1', firstAgentKey: 'agent-1', updatedAt: 100 }
        ]
      }
    });
    const overlay = tree.root.findByProps({ testID: 'mock-chat-detail-overlay' });
    expect(overlay.props.accessibilityLabel).toBe('Agent 1');
    const item = tree.root.findByProps({ testID: 'mock-chat-detail-overlay-select' });
    act(() => {
      item.props.onPress();
    });
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'chat/setChatId', payload: 'chat-2' });
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'shell/closeChatDetailDrawer', payload: undefined });
  });

  it('shows agent role in top subtitle for chat detail overlay', async () => {
    const tree = await renderScreen({
      user: { activeDomain: 'chat' },
      shell: { chatOverlayStack: [{ overlayId: 'overlay-chat-1', type: 'chatDetail' }] },
      agents: {
        agents: [{ key: 'agent-1', name: 'Agent 1', role: '任务调度助手' }]
      }
    });
    const subtitle = tree.root.findByProps({ testID: 'shell-top-subtitle' });
    expect(subtitle.props.children).toBe('任务调度助手');
    expect(subtitle.props.children).not.toBe('agent-1');
  });

  it('creates new chat when tapping create action in chat detail drawer', async () => {
    const tree = await renderScreen({
      user: { activeDomain: 'chat' },
      shell: {
        chatOverlayStack: [{ overlayId: 'overlay-chat-1', type: 'chatDetail' }],
        chatDetailDrawerOpen: true
      }
    });
    const createBtn = tree.root.findByProps({ testID: 'mock-chat-detail-overlay-create' });
    act(() => {
      createBtn.props.onPress();
    });
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'chat/setChatId', payload: '' });
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'chat/setStatusText', payload: '' });
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'shell/closeChatDetailDrawer', payload: undefined });
  });

  it('uses larger style for chat detail back button', async () => {
    const tree = await renderScreen({
      shell: { chatOverlayStack: [{ overlayId: 'overlay-chat-1', type: 'chatDetail' }] },
      user: { activeDomain: 'chat' }
    });
    const backText = tree.root.findByProps({ testID: 'chat-detail-back-text' });
    const style = ReactNative.StyleSheet.flatten(backText.props.style) as { fontSize?: number } | undefined;
    expect(Number(style?.fontSize || 0)).toBeGreaterThanOrEqual(18);
  });

  it('pops agent overlay by back button', async () => {
    const tree = await renderScreen({
      shell: { chatOverlayStack: [{ overlayId: 'overlay-agent-1', type: 'agentDetail' }] },
      user: { activeDomain: 'chat' }
    });
    const backBtn = tree.root.findByProps({ testID: 'chat-agent-back-btn' });
    act(() => {
      backBtn.props.onPress();
    });
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'shell/popChatOverlay', payload: undefined });
  });

  it('disables detail swipe-back when chat drawer is open', async () => {
    const tree = await renderScreen({
      shell: {
        chatOverlayStack: [{ overlayId: 'overlay-chat-1', type: 'chatDetail' }],
        chatDetailDrawerOpen: true
      },
      user: { activeDomain: 'chat' }
    });
    const edge = tree.root.findByProps({ testID: 'swipe-back-edge' });
    expect(edge.props.pointerEvents).toBe('none');
  });
});
