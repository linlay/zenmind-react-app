import React from 'react';
import { act, create } from 'react-test-renderer';
import * as ReactNative from 'react-native';
import { NavigationContainer } from '@react-navigation/native';

import { ShellScreen } from '../ShellScreen';
import { ShellScreenView } from '../components/ShellScreenView';
import { THEMES } from '../../../core/constants/theme';

const mockDispatch = jest.fn();
let mockSelectorState: Record<string, any> = {};

const mockTriggerAgents = jest.fn();
const mockTriggerTeams = jest.fn();
const mockTriggerTerminalSessions = jest.fn();
let mockAppsQueryResult: Record<string, any> = {};
const mockListCachedChats = jest.fn();
const mockSyncChatsIncremental = jest.fn();
const mockMarkChatReadLocal = jest.fn();
const mockMarkChatReadApi = jest.fn();
let keyboardDismissSpy: jest.SpyInstance;
let wsInstances: Array<Record<string, any>> = [];

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null
}));

jest.mock('react-native-safe-area-context', () => {
  const ReactLocal = require('react');
  const ReactNativeLocal = require('react-native');
  const insets = { top: 0, bottom: 0, left: 0, right: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  const SafeAreaInsetsContext = ReactLocal.createContext(insets);
  const SafeAreaFrameContext = ReactLocal.createContext(frame);
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) =>
      ReactLocal.createElement(ReactNativeLocal.View, null, children),
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) =>
      ReactLocal.createElement(
        SafeAreaFrameContext.Provider,
        { value: frame },
        ReactLocal.createElement(SafeAreaInsetsContext.Provider, { value: insets }, children)
      ),
    SafeAreaInsetsContext,
    SafeAreaFrameContext,
    initialWindowMetrics: { insets, frame },
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame
  };
});

jest.mock('../../store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: Record<string, any>) => unknown) => selector(mockSelectorState)
}));

jest.mock('../../../modules/chat/screens/ChatAssistantScreen', () => {
  const ReactLocal = require('react');
  const { TouchableOpacity, View } = require('react-native');
  return {
    ChatAssistantScreen: (props: { onChatViewed?: (chatId: string) => Promise<void> }) =>
      ReactLocal.createElement(
        View,
        { testID: 'mock-chat-assistant-screen' },
        ReactLocal.createElement(TouchableOpacity, {
          testID: 'mock-chat-assistant-mark-viewed',
          onPress: () => {
            props.onChatViewed?.('chat-1').catch(() => {});
          }
        })
      )
  };
});

jest.mock('../../../modules/chat/components/AgentProfilePane', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    AgentProfilePane: () => ReactLocal.createElement(View, { testID: 'mock-agent-profile-pane' })
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
    activeDomain: 'chat',
    activeAccountId: 'acct-1'
  }),
  loadSettings: () => Promise.resolve({}),
  patchSettings: () => Promise.resolve({})
}));

jest.mock('../../../modules/agents/api/agentsApi', () => ({
  useLazyGetAgentsQuery: () => [mockTriggerAgents]
}));

jest.mock('../../../modules/chat/api/chatApi', () => ({
  useLazyGetTeamsQuery: () => [mockTriggerTeams]
}));

jest.mock('../../../modules/terminal/api/terminalApi', () => ({
  useLazyListTerminalSessionsQuery: () => [mockTriggerTerminalSessions]
}));

jest.mock('../pages/apps/appsApi', () => ({
  useGetAppsQuery: () => mockAppsQueryResult
}));

jest.mock('react-native-webview', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    WebView: ({ children, ...props }: { children?: React.ReactNode }) => ReactLocal.createElement(View, props, children)
  };
});

jest.mock('../../../modules/chat/services/chatCacheDb', () => ({
  initChatCacheDb: () => Promise.resolve(),
  listCachedChats: (...args: any[]) => mockListCachedChats(...args),
  markChatReadLocal: (...args: any[]) => mockMarkChatReadLocal(...args)
}));

jest.mock('../../../modules/chat/services/chatSyncService', () => ({
  syncChatsIncremental: (...args: any[]) => mockSyncChatsIncremental(...args)
}));

jest.mock('../../../core/network/apiClient', () => ({
  fetchAuthedJson: (...args: any[]) => {
    const path = String(args[1] || '');
    if (path.includes('/unread-count')) {
      return Promise.resolve({ unreadCount: 0 });
    }
    return Promise.resolve([]);
  },
  markChatReadApi: (...args: any[]) => mockMarkChatReadApi(...args),
  formatError: () => 'error'
}));

jest.mock('../../../core/auth/appAuth', () => ({
  ensureFreshAccessToken: () => Promise.resolve('token'),
  getActiveStoredAccount: () => Promise.resolve({ accountId: 'acct-1' }),
  getCurrentSession: () => ({
    accessToken: 'token',
    accessExpireAtMs: Date.now() + 60_000,
    username: 'tester',
    deviceName: 'device'
  }),
  getAccessToken: () => Promise.resolve('token'),
  getDefaultDeviceName: () => 'device',
  listStoredAccounts: () => Promise.resolve([]),
  loginWithMasterPassword: () => Promise.resolve({}),
  removeStoredAccount: () => Promise.resolve([]),
  logoutCurrentDevice: () => Promise.resolve({}),
  restoreSession: () =>
    Promise.resolve({
      accessToken: 'token',
      accessExpireAtMs: Date.now() + 60_000,
      username: 'tester',
      deviceName: 'device'
    }),
  switchActiveAccount: () => Promise.resolve(null),
  syncActiveAccountConnection: () => Promise.resolve(null),
  subscribeAuthSession: () => () => {}
}));

jest.mock('../../../core/auth/webViewAuthBridge', () => ({
  WebViewAuthRefreshCoordinator: class {
    async refresh() {
      return { ok: true, accessToken: 'token' };
    }
  },
  createWebViewAuthTokenMessage: () => null,
  buildWebViewPostMessageScript: () => 'true;',
  relayWebViewAuthMessage: () => Promise.resolve(),
  WEBVIEW_AUTH_BRIDGE_SCRIPT: 'true;'
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
    savedAccounts: [],
    activeAccountId: 'acct-1',
    accountSwitching: false,
    ...overrides.user
  };

  return {
    shell: {
      chatSearchQuery: '',
      chatAgentsSidebarOpen: false,
      chatDetailDrawerOpen: false,
      chatDetailDrawerPreviewProgress: 0,
      ...overrides.shell
    },
    user,
    chat: {
      chatId: '',
      loadingChats: false,
      teams: [],
      chats: [
        {
          chatId: 'chat-1',
          chatName: 'Test Chat',
          firstAgentName: 'Agent 1',
          firstAgentKey: 'agent-1',
          updatedAt: Date.now()
        }
      ],
      statusText: '',
      ...overrides.chat
    },
    agents: {
      loading: false,
      agents: [{ key: 'agent-1', name: 'Agent 1', role: '任务调度助手' }],
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
  mockTriggerTeams.mockReturnValue({ unwrap: () => Promise.resolve([]) });
  mockListCachedChats.mockResolvedValue(mockSelectorState.chat.chats);
  mockSyncChatsIncremental.mockResolvedValue({ chats: mockSelectorState.chat.chats, updatedChatIds: [] });
  mockMarkChatReadLocal.mockResolvedValue(undefined);
  mockMarkChatReadApi.mockResolvedValue({ chatId: 'chat-1', readStatus: 1, readAt: Date.now() });
  mockTriggerTerminalSessions.mockReturnValue({
    unwrap: () => Promise.resolve([{ sessionId: 's-1', title: 'session-1' }])
  });

  let tree: ReturnType<typeof create> | null = null;
  await act(async () => {
    tree = create(
      <NavigationContainer>
        <ShellScreen />
      </NavigationContainer>
    );
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree as ReturnType<typeof create>;
}

function createShellController(overrides: Partial<Record<string, any>> = {}) {
  return {
    dispatch: mockDispatch,
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
    window: { width: 390, height: 844, scale: 2, fontScale: 1 },
    theme: THEMES.light,
    keyboardInset: 0,
    inboxOpen: false,
    chatPlusMenuOpen: false,
    chatSearchQuery: '',
    chatAgentsSidebarOpen: false,
    chatDetailDrawerOpen: false,
    chatDetailDrawerPreviewProgress: 0,
    inboxMessages: [],
    inboxUnreadCount: 0,
    inboxLoading: false,
    terminalSessions: [{ sessionId: 's-1', title: 'session-1' }],
    terminalSessionsLoading: false,
    terminalSessionsError: '',
    terminalCurrentWebViewUrl: 'https://api.example.com/appterm?session_id=s-1',
    activeTerminalSessionId: 's-1',
    activeDomain: 'chat',
    selectedAgentKey: 'agent-1',
    authAccessToken: 'token',
    authAccessExpireAtMs: Date.now() + 60_000,
    authTokenSignal: 1,
    authUsername: 'tester',
    authDeviceName: 'device',
    authError: '',
    endpointDraft: 'https://api.example.com',
    savedAccounts: [],
    activeAccountId: 'acct-1',
    accountSwitching: false,
    deviceName: 'device',
    masterPassword: '',
    canSubmitLogin: true,
    currentAgentChats: [],
    chatId: '',
    agents: [{ key: 'agent-1', name: 'Agent 1', role: '任务调度助手' }],
    activeAgent: { key: 'agent-1', name: 'Agent 1', role: '任务调度助手' },
    activeAgentName: 'Agent 1',
    activeAgentRole: '任务调度助手',
    backendUrl: 'https://api.example.com',
    chatRefreshSignal: 0,
    loadingChats: false,
    searchAgentResults: [],
    searchChatResults: [],
    inboxAnim: new ReactNative.Animated.Value(0),
    appVersionLabel: '1.0.0',
    terminalListResetSignal: 0,
    setDeviceName: jest.fn(),
    setMasterPassword: jest.fn(),
    setInboxOpen: jest.fn(),
    setChatPlusMenuOpen: jest.fn(),
    setAuthError: jest.fn(),
    setChatSearchQuery: jest.fn(),
    setEndpointDraftText: jest.fn(),
    submitLogin: jest.fn(),
    switchSavedAccount: jest.fn(),
    removeSavedAccount: jest.fn(),
    refreshTerminalSessions: jest.fn().mockResolvedValue(undefined),
    openTerminalCreateSessionModal: jest.fn(),
    openTerminalDetail: jest.fn(),
    handleTerminalWebViewUrlChange: jest.fn(),
    handleRequestSwitchAgentChat: jest.fn(),
    handleWebViewAuthRefreshRequest: jest.fn(),
    markChatViewed: jest.fn(),
    refreshChats: jest.fn().mockResolvedValue(undefined),
    refreshAll: jest.fn().mockResolvedValue(undefined),
    handleLogout: jest.fn(),
    markAllInboxRead: jest.fn().mockResolvedValue(undefined),
    markInboxRead: jest.fn().mockResolvedValue(undefined),
    closeFloatingPanels: jest.fn(),
    booting: false,
    authChecking: false,
    authReady: true,
    ...overrides
  };
}

function syncMockStateFromController(controller: Record<string, any>) {
  mockSelectorState = makeState({
    user: {
      activeDomain: controller.activeDomain,
      selectedAgentKey: controller.selectedAgentKey,
      themeMode: controller.theme?.mode || 'light'
    },
    shell: {
      chatSearchQuery: controller.chatSearchQuery,
      chatAgentsSidebarOpen: controller.chatAgentsSidebarOpen,
      chatDetailDrawerOpen: controller.chatDetailDrawerOpen,
      chatDetailDrawerPreviewProgress: controller.chatDetailDrawerPreviewProgress
    },
    chat: {
      chatId: controller.chatId
    },
    agents: {
      agents: controller.agents
    },
    terminal: {
      activeSessionId: controller.activeTerminalSessionId
    }
  });
}

async function renderShellView(overrides: Partial<Record<string, any>> = {}) {
  const controller = createShellController(overrides);
  syncMockStateFromController(controller);

  let tree: ReturnType<typeof create> | null = null;
  await act(async () => {
    tree = create(
      <NavigationContainer>
        <ShellScreenView controller={controller as any} />
      </NavigationContainer>
    );
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  const rerender = async (nextOverrides: Partial<Record<string, any>>) => {
    const nextController = createShellController({
      ...controller,
      ...nextOverrides
    });
    syncMockStateFromController(nextController);

    await act(async () => {
      tree!.update(
        <NavigationContainer>
          <ShellScreenView controller={nextController as any} />
        </NavigationContainer>
      );
    });

    return nextController;
  };

  return {
    tree: tree as ReturnType<typeof create>,
    controller,
    rerender
  };
}

describe('ShellScreen navigation flow', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    (globalThis as any).WebSocket = class {
      onopen: (() => void) | null = null;
      onclose: (() => void) | null = null;
      onmessage: ((evt: any) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        wsInstances.push(this as unknown as Record<string, any>);
      }
      close() {}
    };
  });

  beforeEach(() => {
    mockDispatch.mockClear();
    mockAppsQueryResult = {
      data: {
        generatedAt: '2026-03-09T11:02:03.655Z',
        apps: [
          {
            key: 'cost',
            name: '记账',
            description: '按日期记录个人开销的轻量应用',
            effectiveMode: 'dev',
            mountPath: '/cost',
            apiBase: '/cost/api',
            publicMountPath: '/ma/cost',
            publicApiBase: '/ma/cost/api',
            frontendStatus: 'active',
            backendStatus: 'active',
            status: 'active',
            lastFrontendLoadAt: '',
            lastBackendLoadAt: '',
            lastFrontendError: null,
            lastBackendError: null
          }
        ]
      },
      isLoading: false,
      isError: false,
      error: undefined
    };
    mockDispatch.mockImplementation((action: { type?: string; payload?: any }) => {
      switch (action?.type) {
        case 'user/setActiveDomain':
          mockSelectorState.user.activeDomain = action.payload;
          break;
        case 'terminal/setActiveSessionId':
          mockSelectorState.terminal.activeSessionId = action.payload;
          break;
        default:
          break;
      }
      return action;
    });
    mockTriggerAgents.mockReset();
    mockTriggerTeams.mockReset();
    mockTriggerTerminalSessions.mockReset();
    mockListCachedChats.mockReset();
    mockSyncChatsIncremental.mockReset();
    mockMarkChatReadLocal.mockReset();
    mockMarkChatReadApi.mockReset();
    wsInstances = [];
    keyboardDismissSpy = jest.spyOn(ReactNative.Keyboard, 'dismiss').mockImplementation(() => {});
  });

  afterEach(() => {
    keyboardDismissSpy.mockRestore();
  });

  it('switches domain from bottom nav and projects activeDomain', async () => {
    const { tree } = await renderShellView();

    const terminalTab = tree.root.findByProps({ testID: 'bottom-nav-tab-terminal' });
    act(() => {
      terminalTab.props.onPress();
    });

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'user/setActiveDomain', payload: 'terminal' });
    expect(tree.root.findByProps({ testID: 'terminal-session-list-pane' })).toBeTruthy();
  });

  it('shows terminal detail route, hides bottom nav, and returns to list by top back button', async () => {
    const { tree } = await renderShellView({ activeDomain: 'terminal' });

    const sessionItem = tree.root.findByProps({ testID: 'terminal-session-item-0' });
    await act(async () => {
      sessionItem.props.onPress();
      await Promise.resolve();
    });

    expect(tree.root.findByProps({ testID: 'mock-terminal-screen' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'terminal-detail-back-btn' })).toBeTruthy();
    expect(tree.root.findAllByProps({ testID: 'bottom-nav-tab-terminal' }).length).toBe(0);

    const backBtn = tree.root.findByProps({ testID: 'terminal-detail-back-btn' });
    act(() => {
      backBtn.props.onPress();
    });

    expect(tree.root.findByProps({ testID: 'terminal-session-list-pane' })).toBeTruthy();
    expect(tree.root.findAllByProps({ testID: 'bottom-nav-tab-terminal' }).length).toBeGreaterThan(0);
  });

  it('resets terminal detail route to list when terminalListResetSignal changes', async () => {
    const { tree, rerender } = await renderShellView({ activeDomain: 'terminal', terminalListResetSignal: 0 });

    const sessionItem = tree.root.findByProps({ testID: 'terminal-session-item-0' });
    await act(async () => {
      sessionItem.props.onPress();
      await Promise.resolve();
    });

    expect(tree.root.findByProps({ testID: 'mock-terminal-screen' })).toBeTruthy();

    await rerender({ activeDomain: 'terminal', terminalListResetSignal: 1 });

    expect(tree.root.findByProps({ testID: 'terminal-session-list-pane' })).toBeTruthy();
  });

  it('opens terminal drive from list and returns to list by top back button', async () => {
    const { tree } = await renderShellView({ activeDomain: 'terminal' });

    const driveBtn = tree.root.findByProps({ testID: 'shell-terminal-drive-btn' });
    act(() => {
      driveBtn.props.onPress();
    });

    expect(tree.root.findByProps({ testID: 'terminal-drive-page' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'terminal-drive-back-btn' })).toBeTruthy();
    expect(tree.root.findAllByProps({ testID: 'bottom-nav-tab-terminal' }).length).toBe(0);
    expect(tree.root.findAllByProps({ testID: 'shell-terminal-refresh-btn' }).length).toBe(0);

    const backBtn = tree.root.findByProps({ testID: 'terminal-drive-back-btn' });
    act(() => {
      backBtn.props.onPress();
    });

    expect(tree.root.findByProps({ testID: 'terminal-session-list-pane' })).toBeTruthy();
    expect(tree.root.findAllByProps({ testID: 'bottom-nav-tab-terminal' }).length).toBeGreaterThan(0);
  });

  it('keeps terminal refresh button behavior on detail shell state', async () => {
    const { tree } = await renderShellView({ activeDomain: 'terminal' });

    const sessionItem = tree.root.findByProps({ testID: 'terminal-session-item-0' });
    await act(async () => {
      sessionItem.props.onPress();
      await Promise.resolve();
    });

    mockDispatch.mockClear();
    const detailRefreshBtn = tree.root.findByProps({ testID: 'shell-terminal-refresh-btn' });
    act(() => {
      detailRefreshBtn.props.onPress();
    });
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'terminal/reloadPty', payload: undefined });
  });

  it('shows agents publish route from navigation and returns to list by top back button', async () => {
    const { tree } = await renderShellView({ activeDomain: 'agents' });

    expect(tree.root.findByProps({ testID: 'mock-agents-screen' })).toBeTruthy();

    const publishBtn = tree.root.findByProps({ testID: 'shell-publish-toggle-btn' });
    await act(async () => {
      publishBtn.props.onPress();
      await Promise.resolve();
    });

    expect(tree.root.findByProps({ testID: 'agents-publish-page' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'agents-publish-back-btn' })).toBeTruthy();
    expect(tree.root.findAllByProps({ testID: 'bottom-nav-tab-agents' }).length).toBe(0);

    const backBtn = tree.root.findByProps({ testID: 'agents-publish-back-btn' });
    act(() => {
      backBtn.props.onPress();
    });

    expect(tree.root.findByProps({ testID: 'mock-agents-screen' })).toBeTruthy();
    expect(tree.root.findAllByProps({ testID: 'bottom-nav-tab-agents' }).length).toBeGreaterThan(0);
  });

  it('submits agents publish action and returns to list', async () => {
    const { tree } = await renderShellView({ activeDomain: 'agents' });

    const publishBtn = tree.root.findByProps({ testID: 'shell-publish-toggle-btn' });
    await act(async () => {
      publishBtn.props.onPress();
      await Promise.resolve();
    });

    mockDispatch.mockClear();
    const submitBtn = tree.root.findByProps({ testID: 'shell-publish-submit-btn' });
    act(() => {
      submitBtn.props.onPress();
    });

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'chat/setStatusText', payload: '发布任务已创建（演示）' });
    expect(tree.root.findByProps({ testID: 'mock-agents-screen' })).toBeTruthy();
  });

  it('shows chat search route from navigation and restores list on back', async () => {
    const { tree } = await renderShellView({ activeDomain: 'chat' });

    const searchBtn = tree.root.findByProps({ testID: 'chat-list-search-btn' });
    act(() => {
      searchBtn.props.onPress();
    });

    expect(tree.root.findByProps({ testID: 'chat-top-search-input' })).toBeTruthy();
    expect(tree.root.findAllByProps({ testID: 'bottom-nav-tab-chat' }).length).toBe(0);

    const backBtn = tree.root.findByProps({ testID: 'chat-search-back-btn' });
    act(() => {
      backBtn.props.onPress();
    });

    expect(tree.root.findAllByProps({ testID: 'chat-top-search-input' }).length).toBe(0);
    expect(tree.root.findAllByProps({ testID: 'bottom-nav-tab-chat' }).length).toBeGreaterThan(0);
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'shell/setChatSearchQuery', payload: '' });
  });

  it('shows chat detail shell state from navigation', async () => {
    const { tree } = await renderShellView({
      activeDomain: 'chat',
      agents: [{ key: 'agent-1', name: 'Agent 1', role: '任务调度助手' }],
      activeAgentRole: '任务调度助手'
    });

    const item = tree.root.findByProps({ testID: 'chat-list-item-0' });
    act(() => {
      item.props.onPress();
    });

    expect(tree.root.findByProps({ testID: 'mock-chat-assistant-screen' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'chat-detail-back-btn' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'chat-detail-menu-btn' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'shell-top-subtitle' }).props.children).toBe('任务调度助手');
    expect(tree.root.findAllByProps({ testID: 'bottom-nav-tab-chat' }).length).toBe(0);
  });

  it('uses api app name as shell title on apps detail route', async () => {
    const { tree } = await renderShellView({ activeDomain: 'chat' });

    const appsTab = tree.root.findByProps({ testID: 'bottom-nav-tab-apps' });
    act(() => {
      appsTab.props.onPress();
    });

    const appCard = tree.root.findByProps({ testID: 'apps-list-card-0' });
    await act(async () => {
      appCard.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(tree.root.findByProps({ testID: 'apps-detail-back-btn' })).toBeTruthy();
    const titleWrap = tree.root.findByProps({ testID: 'shell-top-title-wrap' });
    const titleText = titleWrap.findAllByType(ReactNative.Text)[0];
    expect(titleText.props.children).toBe('记账');
  });

  it('shows agent profile shell state from navigation', async () => {
    const { tree } = await renderShellView({ activeDomain: 'chat' });

    const avatarBtn = tree.root.findByProps({ testID: 'chat-list-item-avatar-btn-0' });
    act(() => {
      avatarBtn.props.onPress({ stopPropagation: jest.fn() });
    });

    expect(tree.root.findByProps({ testID: 'mock-agent-profile-pane' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'chat-agent-back-btn' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'chat-agent-right-placeholder' })).toBeTruthy();
    expect(tree.root.findAllByProps({ testID: 'bottom-nav-tab-chat' }).length).toBe(0);
  });

  it('registers a 5-second polling timer for incremental chat sync', async () => {
    const intervalSpy = jest.spyOn(globalThis, 'setInterval');
    const tree = await renderScreen();
    expect(intervalSpy.mock.calls.some((call) => Number(call[1]) === 5000)).toBe(true);
    intervalSpy.mockRestore();

    await act(async () => {
      tree.unmount();
    });
  });

  it('triggers incremental sync when websocket receives chat.new_content', async () => {
    const tree = await renderScreen();
    const before = mockSyncChatsIncremental.mock.calls.length;
    const socket = wsInstances[0];
    expect(socket).toBeTruthy();

    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({ type: 'chat.new_content', payload: {} })
      });
      await Promise.resolve();
    });

    expect(mockSyncChatsIncremental.mock.calls.length).toBeGreaterThan(before);

    await act(async () => {
      tree.unmount();
    });
  });

  it('keeps local read update when chat read API fails from chat detail route', async () => {
    mockMarkChatReadApi.mockRejectedValueOnce(new Error('read failed'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const tree = await renderScreen();
    const listItem = tree.root.findByProps({ testID: 'chat-list-item-0' });
    act(() => {
      listItem.props.onPress();
    });

    const markViewedBtn = tree.root.findByProps({ testID: 'mock-chat-assistant-mark-viewed' });
    await act(async () => {
      markViewedBtn.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockMarkChatReadLocal).toHaveBeenCalled();
    expect(mockMarkChatReadApi).toHaveBeenCalledWith('https://api.example.com', 'chat-1');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();

    await act(async () => {
      tree.unmount();
    });
  });
});
