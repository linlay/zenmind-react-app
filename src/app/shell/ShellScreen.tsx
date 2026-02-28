import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Animated,
  BackHandler,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { DomainMode, InboxMessage, WebSocketMessage } from '../../core/types/common';
import { THEMES } from '../../core/constants/theme';
import {
  normalizeEndpointInput,
  normalizePtyUrlInput,
  toBackendBaseUrl,
  toDefaultPtyWebUrl
} from '../../core/network/endpoint';
import { loadSettings, patchSettings } from '../../core/storage/settingsStorage';
import {
  clearChatOverlays,
  closeChatDetailDrawer,
  openChatDetailDrawer,
  popChatOverlay,
  pushChatOverlay,
  resetChatDetailDrawerPreview,
  setChatAgentsSidebarOpen,
  setChatDetailDrawerPreviewProgress,
  setChatSearchQuery as setShellChatSearchQuery,
  showChatListRoute,
  showChatSearchRoute,
  showTerminalDetailPane,
  showTerminalListPane
} from './shellSlice';
import {
  applyEndpointDraft,
  hydrateSettings,
  setActiveDomain,
  setEndpointDraft,
  setPtyUrlDraft,
  setSelectedAgentKey as setUserSelectedAgentKey,
  toggleTheme
} from '../../modules/user/state/userSlice';
import {
  setAgents,
  setAgentsError,
  setAgentsLoading,
  setSelectedAgentKey as setAgentsSelectedAgentKey
} from '../../modules/agents/state/agentsSlice';
import {
  setChatId,
  setChats,
  setLoadingChats,
  setStatusText
} from '../../modules/chat/state/chatSlice';
import { reloadPty, requestOpenNewSessionModal, setActiveSessionId } from '../../modules/terminal/state/terminalSlice';
import { selectAgentLatestChats, selectCurrentAgentChats } from '../../modules/chat/state/chatSelectors';
import { ChatAssistantScreen } from '../../modules/chat/screens/ChatAssistantScreen';
import { TerminalScreen } from '../../modules/terminal/screens/TerminalScreen';
import { AgentsScreen } from '../../modules/agents/screens/AgentsScreen';
import { UserSettingsScreen } from '../../modules/user/screens/UserSettingsScreen';
import { BottomDomainNav } from './BottomDomainNav';
import { ChatListPane } from '../../modules/chat/components/ChatListPane';
import { ChatSearchPane, ChatSearchAgentItem } from '../../modules/chat/components/ChatSearchPane';
import { ChatDetailDrawer } from '../../modules/chat/components/ChatDetailDrawer';
import { AgentProfilePane } from '../../modules/chat/components/AgentProfilePane';
import { TerminalSessionListPane } from '../../modules/terminal/components/TerminalSessionListPane';
import { AgentSidebar } from '../../modules/chat/components/AgentSidebar';
import { useLazyGetAgentsQuery } from '../../modules/agents/api/agentsApi';
import { useLazyGetChatsQuery } from '../../modules/chat/api/chatApi';
import { useLazyListTerminalSessionsQuery } from '../../modules/terminal/api/terminalApi';
import { fetchAuthedJson, formatError } from '../../core/network/apiClient';
import {
  createRequestId,
  formatInboxTime,
  getAgentKey,
  getAgentName,
  getAgentRole,
  getChatAgentKey,
  getChatAgentName,
  getChatTimestamp,
  getChatTitle
} from '../../shared/utils/format';
import { getAppVersionLabel } from '../../shared/utils/appVersion';
import { TerminalSessionItem } from '../../modules/terminal/types/terminal';
import {
  ensureFreshAccessToken,
  getCurrentSession,
  getAccessToken,
  getDefaultDeviceName,
  loginWithMasterPassword,
  logoutCurrentDevice,
  restoreSession,
  subscribeAuthSession
} from '../../core/auth/appAuth';
import { WebViewAuthRefreshCoordinator, WebViewAuthRefreshOutcome } from '../../core/auth/webViewAuthBridge';
import { SwipeBackEdge } from '../../shared/ui/SwipeBackEdge';

const PREFRESH_MIN_VALIDITY_MS = 120_000;
const PREFRESH_JITTER_MS = 8_000;
const ACTIVE_REFRESH_DEBOUNCE_MS = 20_000;
const FOREGROUND_REFRESH_INTERVAL_MS = 60_000;

const DOMAIN_LABEL: Record<DomainMode, string> = {
  chat: '对话',
  terminal: '终端',
  agents: '智能体',
  user: '配置'
};

export function ShellScreen() {
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();

  const {
    chatRoute,
    chatSearchQuery,
    chatOverlayStack,
    terminalPane,
    chatAgentsSidebarOpen,
    chatDetailDrawerOpen,
    chatDetailDrawerPreviewProgress
  } = useAppSelector((state) => state.shell);
  const {
    booting,
    themeMode,
    endpointDraft,
    endpointInput,
    ptyUrlInput,
    selectedAgentKey,
    activeDomain
  } = useAppSelector((state) => state.user);
  const chatId = useAppSelector((state) => state.chat.chatId);
  const chats = useAppSelector((state) => state.chat.chats);
  const loadingChats = useAppSelector((state) => state.chat.loadingChats);
  const agentsLoading = useAppSelector((state) => state.agents.loading);
  const agents = useAppSelector((state) => state.agents.agents);
  const agentLatestChats = useAppSelector(selectAgentLatestChats);
  const currentAgentChats = useAppSelector(selectCurrentAgentChats);
  const activeTerminalSessionId = useAppSelector((state) => state.terminal.activeSessionId);

  const [inboxOpen, setInboxOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [shellKeyboardHeight, setShellKeyboardHeight] = useState(0);
  const [authChecking, setAuthChecking] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [deviceName, setDeviceName] = useState(getDefaultDeviceName());
  const [inboxMessages, setInboxMessages] = useState<InboxMessage[]>([]);
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [chatRefreshSignal, setChatRefreshSignal] = useState(0);
  const [authAccessToken, setAuthAccessToken] = useState('');
  const [authAccessExpireAtMs, setAuthAccessExpireAtMs] = useState<number | undefined>(undefined);
  const [authTokenSignal, setAuthTokenSignal] = useState(0);
  const [authUsername, setAuthUsername] = useState('');
  const [authDeviceName, setAuthDeviceName] = useState('');
  const [terminalSessions, setTerminalSessions] = useState<TerminalSessionItem[]>([]);
  const [terminalSessionsLoading, setTerminalSessionsLoading] = useState(false);
  const [terminalSessionsError, setTerminalSessionsError] = useState('');
  const [chatPlusMenuOpen, setChatPlusMenuOpen] = useState(false);

  const [triggerAgents] = useLazyGetAgentsQuery();
  const [triggerChats] = useLazyGetChatsQuery();
  const [triggerTerminalSessions] = useLazyListTerminalSessionsQuery();

  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRetryRef = useRef(0);
  const wsAccessTokenRef = useRef('');
  const appStateRef = useRef(AppState.currentState);
  const lastActiveRefreshAtRef = useRef(0);
  const authRefreshCoordinatorRef = useRef<WebViewAuthRefreshCoordinator | null>(null);

  const inboxAnim = useRef(new Animated.Value(0)).current;
  const publishAnim = useRef(new Animated.Value(0)).current;
  const chatRouteAnim = useRef(new Animated.Value(chatRoute === 'search' ? 1 : 0)).current;
  const chatOverlayEnterAnim = useRef(new Animated.Value(1)).current;
  const terminalPaneAnim = useRef(new Animated.Value(terminalPane === 'detail' ? 1 : 0)).current;
  const theme = THEMES[themeMode] || THEMES.light;
  const backendUrl = useMemo(() => toBackendBaseUrl(endpointInput), [endpointInput]);
  const ptyWebUrl = useMemo(() => normalizePtyUrlInput(ptyUrlInput, endpointInput), [endpointInput, ptyUrlInput]);
  const normalizedLoginEndpointDraft = useMemo(
    () => normalizeEndpointInput(endpointDraft),
    [endpointDraft]
  );
  const canSubmitLogin = Boolean(normalizedLoginEndpointDraft) && !authChecking;

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvent, (e) => setShellKeyboardHeight(e?.endCoordinates?.height || 0));
    const onHide = Keyboard.addListener(hideEvent, () => setShellKeyboardHeight(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  const keyboardInset = Platform.OS === 'android' ? Math.max(0, shellKeyboardHeight) : 0;

  const terminalTranslateX = useMemo(
    () =>
      terminalPaneAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -window.width]
      }),
    [terminalPaneAnim, window.width]
  );
  const chatRouteTranslateX = useMemo(
    () =>
      chatRouteAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -window.width]
      }),
    [chatRouteAnim, window.width]
  );
  const chatOverlayEnterTranslateX = useMemo(
    () =>
      chatOverlayEnterAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [18, 0]
      }),
    [chatOverlayEnterAnim]
  );
  const topChatOverlay = chatOverlayStack.length ? chatOverlayStack[chatOverlayStack.length - 1] : null;
  const topChatOverlayId = topChatOverlay?.overlayId || '';
  const topChatOverlayType = topChatOverlay?.type || '';
  const hasChatOverlay = Boolean(topChatOverlay);
  const previousTopChatOverlayIdRef = useRef(topChatOverlayId);

  const syncAuthStateFromSession = useCallback((session = getCurrentSession()) => {
    if (!session) {
      setAuthAccessToken('');
      setAuthAccessExpireAtMs(undefined);
      setAuthUsername('');
      setAuthDeviceName('');
      setAuthTokenSignal((prev) => prev + 1);
      return;
    }
    setAuthAccessToken(String(session.accessToken || ''));
    setAuthAccessExpireAtMs(Number.isFinite(session.accessExpireAtMs) ? session.accessExpireAtMs : undefined);
    setAuthUsername(String(session.username || '').trim());
    setAuthDeviceName(String(session.deviceName || '').trim());
    setAuthTokenSignal((prev) => prev + 1);
  }, []);

  const refreshAgents = useCallback(
    async (base = backendUrl, silent = false) => {
      if (!silent) dispatch(setAgentsLoading(true));
      try {
        const list = await triggerAgents(base).unwrap();
        dispatch(setAgents(list));
        dispatch(setAgentsError(''));

        const current = selectedAgentKey;
        if (current && list.some((agent) => getAgentKey(agent) === current)) {
          return;
        }

        const fallback = getAgentKey(list[0]) || '';
        dispatch(setAgentsSelectedAgentKey(fallback));
        dispatch(setUserSelectedAgentKey(fallback));
      } catch (error) {
        dispatch(setAgentsError(formatError(error)));
        dispatch(setStatusText(`Agent 加载失败：${formatError(error)}`));
      } finally {
        if (!silent) dispatch(setAgentsLoading(false));
      }
    },
    [backendUrl, dispatch, selectedAgentKey, triggerAgents]
  );

  const refreshChats = useCallback(
    async (silent = false, base = backendUrl) => {
      if (!silent) dispatch(setLoadingChats(true));
      try {
        const list = await triggerChats(base).unwrap();
        dispatch(setChats(list));
      } catch (error) {
        dispatch(setStatusText(`会话列表加载失败：${formatError(error)}`));
      } finally {
        if (!silent) dispatch(setLoadingChats(false));
      }
    },
    [backendUrl, dispatch, triggerChats]
  );

  const refreshTerminalSessions = useCallback(
    async (silent = false) => {
      if (!silent) {
        setTerminalSessionsLoading(true);
      }
      try {
        const sessions = await triggerTerminalSessions({ backendUrl, ptyWebUrl }).unwrap();
        setTerminalSessions(Array.isArray(sessions) ? sessions : []);
        setTerminalSessionsError('');
        if (activeTerminalSessionId && !sessions.some((item) => item.sessionId === activeTerminalSessionId)) {
          dispatch(setActiveSessionId(''));
          dispatch(showTerminalListPane());
        }
      } catch (error) {
        const message = formatError(error);
        setTerminalSessionsError(message);
        dispatch(setStatusText(`终端会话加载失败：${message}`));
      } finally {
        if (!silent) {
          setTerminalSessionsLoading(false);
        }
      }
    },
    [activeTerminalSessionId, backendUrl, dispatch, ptyWebUrl, triggerTerminalSessions]
  );

  const openTerminalCreateSessionModal = useCallback(() => {
    dispatch(requestOpenNewSessionModal(Date.now()));
    dispatch(reloadPty());
    dispatch(showTerminalDetailPane());
  }, [dispatch]);

  const refreshAll = useCallback(
    async (silent = false, base = backendUrl) => {
      await Promise.all([refreshAgents(base, silent), refreshChats(silent, base)]);
    },
    [backendUrl, refreshAgents, refreshChats]
  );

  const refreshInbox = useCallback(
    async (silent = false, base = backendUrl) => {
      if (!silent) {
        setInboxLoading(true);
      }
      try {
        const [list, unread] = await Promise.all([
          fetchAuthedJson<InboxMessage[]>(base, '/api/app/inbox?limit=50'),
          fetchAuthedJson<{ unreadCount?: number }>(base, '/api/app/inbox/unread-count')
        ]);
        setInboxMessages(Array.isArray(list) ? list : []);
        setInboxUnreadCount(Number((unread && unread.unreadCount) || 0));
      } catch (error) {
        dispatch(setStatusText(`消息盒子加载失败：${formatError(error)}`));
      } finally {
        if (!silent) {
          setInboxLoading(false);
        }
      }
    },
    [backendUrl, dispatch]
  );

  const markInboxRead = useCallback(
    async (messageId: string) => {
      if (!messageId) {
        return;
      }
      try {
        await fetchAuthedJson<unknown>(backendUrl, '/api/app/inbox/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageIds: [messageId] })
        });
        await refreshInbox(true);
      } catch (error) {
        dispatch(setStatusText(`消息已读失败：${formatError(error)}`));
      }
    },
    [backendUrl, dispatch, refreshInbox]
  );

  const markAllInboxRead = useCallback(async () => {
    try {
      await fetchAuthedJson<unknown>(backendUrl, '/api/app/inbox/read-all', {
        method: 'POST'
      });
      await refreshInbox(true);
    } catch (error) {
      dispatch(setStatusText(`全部已读失败：${formatError(error)}`));
    }
  }, [backendUrl, dispatch, refreshInbox]);

  const clearWs = useCallback(() => {
    if (wsReconnectTimerRef.current) {
      clearTimeout(wsReconnectTimerRef.current);
      wsReconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      try {
        wsRef.current.close();
      } catch {
        // ignore close errors
      }
      wsRef.current = null;
    }
    wsAccessTokenRef.current = '';
  }, []);

  const handleWsEnvelope = useCallback(
    (raw: string) => {
      if (!raw) {
        return;
      }

      let parsed: WebSocketMessage | null = null;
      try {
        parsed = JSON.parse(raw) as WebSocketMessage;
      } catch {
        return;
      }

      const type = String(parsed?.type || '');
      const payload = parsed?.payload || {};

      if (type === 'inbox.new') {
        const message = payload.message as InboxMessage | undefined;
        if (message && message.messageId) {
          setInboxMessages((prev) => [message, ...prev.filter((item) => item.messageId !== message.messageId)]);
        }
        if (typeof payload.unreadCount === 'number') {
          setInboxUnreadCount(payload.unreadCount);
        } else {
          refreshInbox(true).catch(() => {});
        }
        return;
      }

      if (type === 'inbox.sync') {
        if (typeof payload.unreadCount === 'number') {
          setInboxUnreadCount(payload.unreadCount);
        } else {
          refreshInbox(true).catch(() => {});
        }
        return;
      }

      if (type === 'chat.new_content') {
        refreshChats(true).catch(() => {});
        setChatRefreshSignal((prev) => prev + 1);
      }
    },
    [refreshChats, refreshInbox]
  );

  const handleHardAuthFailure = useCallback(
    (statusMessage = '登录状态失效，请重新登录') => {
      clearWs();
      setAuthReady(false);
      setInboxMessages([]);
      setInboxUnreadCount(0);
      setAuthError(statusMessage);
      setMasterPassword('');
      syncAuthStateFromSession(null);
      dispatch(setStatusText(statusMessage));
    },
    [clearWs, dispatch, syncAuthStateFromSession]
  );

  const handleLogout = useCallback(async () => {
    try {
      await logoutCurrentDevice(backendUrl);
    } catch {
      // ignore logout API errors
    }
    handleHardAuthFailure('已登出');
  }, [backendUrl, handleHardAuthFailure]);

  const runForegroundProactiveRefresh = useCallback(async () => {
    if (!authReady) {
      return null;
    }
    const accessToken = await ensureFreshAccessToken(backendUrl, {
      minValidityMs: PREFRESH_MIN_VALIDITY_MS,
      jitterMs: PREFRESH_JITTER_MS,
      failureMode: 'soft'
    });
    if (accessToken) {
      syncAuthStateFromSession();
    }
    return accessToken;
  }, [authReady, backendUrl, syncAuthStateFromSession]);

  const resolveHardRefreshToken = useCallback(async () => {
    const accessToken = await getAccessToken(backendUrl, true);
    if (accessToken) {
      syncAuthStateFromSession();
    }
    return accessToken;
  }, [backendUrl, syncAuthStateFromSession]);

  useEffect(() => {
    authRefreshCoordinatorRef.current = new WebViewAuthRefreshCoordinator(resolveHardRefreshToken, {
      onHardFailure: () => {
        handleHardAuthFailure();
      }
    });
    return () => {
      authRefreshCoordinatorRef.current = null;
    };
  }, [handleHardAuthFailure, resolveHardRefreshToken]);

  const handleWebViewAuthRefreshRequest = useCallback(
    async (_requestId: string, _source: string): Promise<WebViewAuthRefreshOutcome> => {
      const coordinator = authRefreshCoordinatorRef.current;
      if (!coordinator) {
        return {
          ok: false,
          error: 'Auth refresh coordinator unavailable'
        };
      }
      return coordinator.refresh();
    },
    []
  );

  const connectWs = useCallback(async () => {
    clearWs();
    const accessToken = await getAccessToken(backendUrl);
    if (!accessToken) {
      handleHardAuthFailure();
      return;
    }

    let wsUrl = '';
    try {
      const url = new URL(`${backendUrl}/api/app/ws`);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.searchParams.set('access_token', accessToken);
      wsUrl = url.toString();
    } catch {
      return;
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    wsAccessTokenRef.current = accessToken;

    ws.onopen = () => {
      wsRetryRef.current = 0;
    };

    ws.onmessage = (event) => {
      handleWsEnvelope(String(event?.data || ''));
    };

    ws.onclose = () => {
      if (!authReady) {
        return;
      }
      const retryCount = Math.min(wsRetryRef.current, 6);
      const delayMs = Math.min(30_000, 1000 * (2 ** retryCount));
      wsRetryRef.current += 1;
      wsReconnectTimerRef.current = setTimeout(() => {
        connectWs().catch(() => {});
      }, delayMs);
    };

    ws.onerror = () => {
      // rely on onclose to schedule reconnect
    };
  }, [authReady, backendUrl, clearWs, handleHardAuthFailure, handleWsEnvelope]);

  useEffect(() => {
    const unsubscribe = subscribeAuthSession((event) => {
      if (event.type === 'session_updated') {
        const previousToken = wsAccessTokenRef.current;
        const nextToken = String(event.session.accessToken || '');
        syncAuthStateFromSession(event.session);
        if (authReady && previousToken && nextToken && previousToken !== nextToken) {
          connectWs().catch(() => {});
        }
        return;
      }
      syncAuthStateFromSession(null);
    });
    return () => {
      unsubscribe();
    };
  }, [authReady, connectWs, syncAuthStateFromSession]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      if ((prevState === 'background' || prevState === 'inactive') && nextState === 'active') {
        if (booting || !authReady) {
          return;
        }
        const now = Date.now();
        if (now - lastActiveRefreshAtRef.current < ACTIVE_REFRESH_DEBOUNCE_MS) {
          return;
        }
        lastActiveRefreshAtRef.current = now;
        runForegroundProactiveRefresh().catch(() => {});
      }
    });

    return () => {
      subscription.remove();
    };
  }, [authReady, booting, runForegroundProactiveRefresh]);

  useEffect(() => {
    if (booting || !authReady) {
      return;
    }
    const timer = setInterval(() => {
      if (appStateRef.current !== 'active') {
        return;
      }
      runForegroundProactiveRefresh().catch(() => {});
    }, FOREGROUND_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [authReady, booting, runForegroundProactiveRefresh]);

  const submitLogin = useCallback(async () => {
    const normalizedEndpoint = normalizeEndpointInput(endpointDraft);
    if (!normalizedEndpoint) {
      setAuthError('请输入后端域名或 IP');
      return;
    }

    const password = String(masterPassword || '').trim();
    if (!password) {
      setAuthError('请输入主密码');
      return;
    }

    const loginBackendUrl = toBackendBaseUrl(normalizedEndpoint);
    if (!loginBackendUrl) {
      setAuthError('后端地址格式无效');
      return;
    }

    dispatch(setEndpointDraft(normalizedEndpoint));
    dispatch(setPtyUrlDraft(toDefaultPtyWebUrl(normalizedEndpoint)));
    dispatch(applyEndpointDraft());

    setAuthChecking(true);
    setAuthError('');
    try {
      await loginWithMasterPassword(loginBackendUrl, password, deviceName);
      setMasterPassword('');
      setAuthReady(true);
      syncAuthStateFromSession();
      await Promise.all([refreshAll(true, loginBackendUrl), refreshInbox(true, loginBackendUrl)]);
    } catch (error) {
      setAuthReady(false);
      setInboxMessages([]);
      setInboxUnreadCount(0);
      setAuthError(formatError(error));
      syncAuthStateFromSession(null);
    } finally {
      setAuthChecking(false);
    }
  }, [
    deviceName,
    dispatch,
    endpointDraft,
    masterPassword,
    refreshAll,
    refreshInbox,
    syncAuthStateFromSession
  ]);

  useEffect(() => {
    let mounted = true;
    loadSettings()
      .then((settings) => {
        if (!mounted) return;
        dispatch(hydrateSettings(settings));
        dispatch(setAgentsSelectedAgentKey(settings.selectedAgentKey || ''));
      })
      .catch(() => {
        if (!mounted) return;
        dispatch(hydrateSettings({}));
      });

    return () => {
      mounted = false;
    };
  }, [dispatch]);

  useEffect(() => {
    Animated.timing(inboxAnim, {
      toValue: inboxOpen ? 1 : 0,
      duration: inboxOpen ? 240 : 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [inboxAnim, inboxOpen]);

  useEffect(() => {
    Animated.timing(publishAnim, {
      toValue: publishOpen ? 1 : 0,
      duration: publishOpen ? 240 : 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [publishAnim, publishOpen]);

  useEffect(() => {
    Animated.timing(chatRouteAnim, {
      toValue: chatRoute === 'search' ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [chatRoute, chatRouteAnim]);

  useEffect(() => {
    const previousOverlayId = previousTopChatOverlayIdRef.current;
    previousTopChatOverlayIdRef.current = topChatOverlayId;
    if (!topChatOverlayId) {
      chatOverlayEnterAnim.setValue(1);
      return;
    }
    if (topChatOverlayId === previousOverlayId) {
      return;
    }
    chatOverlayEnterAnim.setValue(0);
    Animated.timing(chatOverlayEnterAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [chatOverlayEnterAnim, topChatOverlayId]);

  useEffect(() => {
    Animated.timing(terminalPaneAnim, {
      toValue: terminalPane === 'detail' ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [terminalPane, terminalPaneAnim]);

  useEffect(() => {
    if (booting) return;

    if (!backendUrl) {
      setAuthReady(false);
      setInboxMessages([]);
      setInboxUnreadCount(0);
      syncAuthStateFromSession(null);
      setAuthChecking(false);
      return;
    }

    let cancelled = false;
    setAuthChecking(true);
    setAuthError('');
    restoreSession(backendUrl)
      .then((session) => {
        if (cancelled) return;
        setAuthReady(Boolean(session));
        if (!session) {
          setInboxMessages([]);
          setInboxUnreadCount(0);
          syncAuthStateFromSession(null);
        } else {
          syncAuthStateFromSession(session);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setAuthReady(false);
        setInboxMessages([]);
        setInboxUnreadCount(0);
        syncAuthStateFromSession(null);
      })
      .finally(() => {
        if (!cancelled) {
          setAuthChecking(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [backendUrl, booting, syncAuthStateFromSession]);

  useEffect(() => {
    if (booting || !authReady) {
      clearWs();
      return;
    }

    runForegroundProactiveRefresh().catch(() => {});
    refreshAll(true).catch(() => {});
    refreshInbox(true).catch(() => {});
    connectWs().catch(() => {});

    return () => {
      clearWs();
    };
  }, [authReady, booting, clearWs, connectWs, refreshAll, refreshInbox, runForegroundProactiveRefresh]);

  useEffect(() => {
    if (booting) return;
    patchSettings({
      themeMode,
      endpointInput,
      ptyUrlInput,
      selectedAgentKey,
      activeDomain
    }).catch(() => {});
  }, [activeDomain, booting, endpointInput, ptyUrlInput, selectedAgentKey, themeMode]);

  useEffect(() => {
    if (activeDomain !== 'chat' && activeDomain !== 'user') {
      setInboxOpen(false);
    }
    if (activeDomain !== 'chat') {
      setChatPlusMenuOpen(false);
      dispatch(showChatListRoute());
      dispatch(clearChatOverlays());
      dispatch(setChatAgentsSidebarOpen(false));
      dispatch(closeChatDetailDrawer());
      dispatch(resetChatDetailDrawerPreview());
    }
  }, [activeDomain, dispatch]);

  useEffect(() => {
    if (topChatOverlayType !== 'chatDetail' && chatDetailDrawerOpen) {
      dispatch(closeChatDetailDrawer());
    }
    if (topChatOverlayType !== 'chatDetail' && chatDetailDrawerPreviewProgress > 0) {
      dispatch(resetChatDetailDrawerPreview());
    }
  }, [chatDetailDrawerOpen, chatDetailDrawerPreviewProgress, dispatch, topChatOverlayType]);

  useEffect(() => {
    if (!inboxOpen || !authReady) {
      return;
    }
    refreshInbox(true).catch(() => {});
  }, [authReady, inboxOpen, refreshInbox]);

  useEffect(() => {
    if (!authReady) {
      setTerminalSessions([]);
      setTerminalSessionsLoading(false);
      setTerminalSessionsError('');
      dispatch(setActiveSessionId(''));
      dispatch(showTerminalListPane());
    }
  }, [authReady, dispatch]);

  useEffect(() => {
    if (booting || !authReady || activeDomain !== 'terminal') {
      return;
    }
    refreshTerminalSessions(true).catch(() => {});
  }, [activeDomain, authReady, booting, refreshTerminalSessions]);

  useEffect(() => {
    if (booting || !authReady || activeDomain !== 'terminal' || terminalPane !== 'list') {
      return;
    }
    refreshTerminalSessions(true).catch(() => {});
  }, [activeDomain, authReady, booting, refreshTerminalSessions, terminalPane]);

  useEffect(() => {
    if (activeDomain !== 'agents' && publishOpen) {
      setPublishOpen(false);
    }
  }, [activeDomain, publishOpen]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (inboxOpen) {
        setInboxOpen(false);
        return true;
      }
      if (chatDetailDrawerOpen) {
        dispatch(closeChatDetailDrawer());
        return true;
      }
      if (chatAgentsSidebarOpen) {
        dispatch(setChatAgentsSidebarOpen(false));
        return true;
      }
      if (publishOpen) {
        setPublishOpen(false);
        return true;
      }
      if (activeDomain === 'chat' && hasChatOverlay) {
        dispatch(popChatOverlay());
        return true;
      }
      if (activeDomain === 'chat' && chatRoute === 'search') {
        setChatPlusMenuOpen(false);
        dispatch(showChatListRoute());
        dispatch(setShellChatSearchQuery(''));
        return true;
      }
      if (activeDomain === 'terminal' && terminalPane === 'detail') {
        dispatch(showTerminalListPane());
        return true;
      }
      return false;
    });

    return () => sub.remove();
  }, [
    activeDomain,
    chatAgentsSidebarOpen,
    chatDetailDrawerOpen,
    chatRoute,
    dispatch,
    hasChatOverlay,
    inboxOpen,
    publishOpen,
    terminalPane
  ]);

  const activeAgent = useMemo(() => {
    const found = agents.find((agent) => getAgentKey(agent) === selectedAgentKey);
    return found || agents[0] || null;
  }, [agents, selectedAgentKey]);
  const activeAgentName = useMemo(() => getAgentName(activeAgent) || 'Agent', [activeAgent]);
  const activeAgentRole = useMemo(() => getAgentRole(activeAgent), [activeAgent]);
  const normalizedSearchKeyword = String(chatSearchQuery || '').trim().toLowerCase();

  const searchAgentResults = useMemo<ChatSearchAgentItem[]>(() => {
    if (!normalizedSearchKeyword) {
      return [];
    }
    return agents
      .map((agent) => {
        const agentKey = getAgentKey(agent);
        const agentName = getAgentName(agent);
        if (!agentKey || !agentName) {
          return null;
        }
        const haystack = `${agentName} ${agentKey}`.toLowerCase();
        if (!haystack.includes(normalizedSearchKeyword)) {
          return null;
        }
        const latestChat = [...chats]
          .filter((chat) => String(getChatAgentKey(chat) || '').trim() === agentKey)
          .sort((a, b) => getChatTimestamp(b) - getChatTimestamp(a))[0];
        return {
          agentKey,
          agentName,
          latestChatName: latestChat ? getChatTitle(latestChat) : ''
        };
      })
      .filter((item) => Boolean(item)) as ChatSearchAgentItem[];
  }, [agents, chats, normalizedSearchKeyword]);

  const searchChatResults = useMemo(() => {
    if (!normalizedSearchKeyword) {
      return [];
    }
    return [...chats]
      .filter((chat) => {
        const haystack = `${chat.chatName || ''} ${chat.title || ''} ${chat.chatId || ''} ${getChatAgentName(chat)} ${getChatAgentKey(chat)}`.toLowerCase();
        return haystack.includes(normalizedSearchKeyword);
      })
      .sort((a, b) => getChatTimestamp(b) - getChatTimestamp(a));
  }, [chats, normalizedSearchKeyword]);

  const isChatDomain = activeDomain === 'chat';
  const isTerminalDomain = activeDomain === 'terminal';
  const isAgentsDomain = activeDomain === 'agents';
  const isUserDomain = activeDomain === 'user';
  const isChatDetailOverlay = topChatOverlayType === 'chatDetail';
  const isChatAgentOverlay = topChatOverlayType === 'agentDetail';
  const topNavTitle = isChatDomain
    ? isChatDetailOverlay
      ? activeAgentName
      : isChatAgentOverlay
        ? activeAgentName
      : chatRoute === 'search'
        ? '搜索'
        : '对话'
    : isTerminalDomain
      ? terminalPane === 'detail'
        ? '终端/CLI'
        : '会话'
      : DOMAIN_LABEL[activeDomain];
  const topNavSubtitle = isChatDomain && isChatDetailOverlay ? activeAgentRole : '';
  const appVersionLabel = useMemo(() => getAppVersionLabel(), []);
  const showBottomNav = !((isChatDomain && hasChatOverlay) || (isTerminalDomain && terminalPane === 'detail'));

  const closeFloatingPanels = useCallback(() => {
    setInboxOpen(false);
    setPublishOpen(false);
    setChatPlusMenuOpen(false);
    dispatch(setChatAgentsSidebarOpen(false));
    dispatch(closeChatDetailDrawer());
    dispatch(resetChatDetailDrawerPreview());
  }, [dispatch]);

  const handleDomainSwitch = useCallback(
    (mode: DomainMode) => {
      if (mode === activeDomain) {
        if (mode === 'chat') {
          if (chatDetailDrawerOpen) {
            dispatch(closeChatDetailDrawer());
            return;
          }
          if (chatAgentsSidebarOpen) {
            dispatch(setChatAgentsSidebarOpen(false));
            return;
          }
          if (hasChatOverlay) {
            dispatch(clearChatOverlays());
            dispatch(showChatListRoute());
            return;
          }
          if (chatRoute === 'search') {
            dispatch(showChatListRoute());
            dispatch(setShellChatSearchQuery(''));
            return;
          }
          return;
        }
        if (mode === 'terminal' && terminalPane === 'detail') {
          dispatch(showTerminalListPane());
          return;
        }
        return;
      }
      closeFloatingPanels();
      if (mode === 'chat') {
        dispatch(showChatListRoute());
      } else {
        dispatch(showChatListRoute());
        dispatch(setShellChatSearchQuery(''));
        dispatch(clearChatOverlays());
      }
      dispatch(setActiveDomain(mode));
    },
    [
      activeDomain,
      chatAgentsSidebarOpen,
      chatDetailDrawerOpen,
      chatRoute,
      closeFloatingPanels,
      dispatch,
      hasChatOverlay,
      terminalPane
    ]
  );

  const openChatDetail = useCallback(
    (nextChatId: string, nextAgentKey?: string) => {
      Keyboard.dismiss();
      const normalizedAgentKey = String(nextAgentKey || '').trim();
      if (normalizedAgentKey && normalizedAgentKey !== '__unknown_agent__') {
        dispatch(setAgentsSelectedAgentKey(normalizedAgentKey));
        dispatch(setUserSelectedAgentKey(normalizedAgentKey));
      }
      dispatch(setChatId(nextChatId));
      dispatch(closeChatDetailDrawer());
      dispatch(resetChatDetailDrawerPreview());
      dispatch(setChatAgentsSidebarOpen(false));
      dispatch(
        pushChatOverlay({
          overlayId: createRequestId('chat_detail_overlay'),
          type: 'chatDetail'
        })
      );
    },
    [dispatch]
  );

  const openAgentProfile = useCallback(
    (agentKey: string) => {
      Keyboard.dismiss();
      const normalizedKey = String(agentKey || '').trim();
      if (!normalizedKey) {
        dispatch(setStatusText('智能体信息不可用'));
        return;
      }
      dispatch(setAgentsSelectedAgentKey(normalizedKey));
      dispatch(setUserSelectedAgentKey(normalizedKey));
      dispatch(setChatAgentsSidebarOpen(false));
      dispatch(closeChatDetailDrawer());
      dispatch(resetChatDetailDrawerPreview());
      dispatch(
        pushChatOverlay({
          overlayId: createRequestId('agent_detail_overlay'),
          type: 'agentDetail'
        })
      );
    },
    [dispatch]
  );

  const handleAgentSelectNewChat = useCallback(
    (agentKey: string) => {
      dispatch(setAgentsSelectedAgentKey(agentKey));
      dispatch(setUserSelectedAgentKey(agentKey));
      dispatch(setChatId(''));
      dispatch(setStatusText(''));
      dispatch(setChatAgentsSidebarOpen(false));
      dispatch(closeChatDetailDrawer());
      dispatch(resetChatDetailDrawerPreview());
      if (!isChatDetailOverlay) {
        dispatch(
          pushChatOverlay({
            overlayId: createRequestId('chat_detail_overlay'),
            type: 'chatDetail'
          })
        );
      }
    },
    [dispatch, isChatDetailOverlay]
  );

  const openNewCurrentAgentChat = useCallback(() => {
    dispatch(setChatId(''));
    dispatch(setStatusText(''));
    dispatch(closeChatDetailDrawer());
    dispatch(resetChatDetailDrawerPreview());
    if (!isChatDetailOverlay) {
      dispatch(
        pushChatOverlay({
          overlayId: createRequestId('chat_detail_overlay'),
          type: 'chatDetail'
        })
      );
    }
    setChatPlusMenuOpen(false);
  }, [dispatch, isChatDetailOverlay]);

  const handleSearchSelectAgent = useCallback(
    (agentKey: string) => {
      openAgentProfile(agentKey);
    },
    [openAgentProfile]
  );

  const handleSearchBack = useCallback(() => {
    setChatPlusMenuOpen(false);
    dispatch(showChatListRoute());
    dispatch(setShellChatSearchQuery(''));
  }, [dispatch]);

  const handleAgentProfileStartChat = useCallback(
    (agentKey: string) => {
      const normalizedKey = String(agentKey || '').trim();
      if (!normalizedKey) {
        dispatch(setStatusText('智能体信息不可用'));
        return;
      }
      handleAgentSelectNewChat(normalizedKey);
    },
    [dispatch, handleAgentSelectNewChat]
  );

  const handleRequestSwitchAgentChat = useCallback(
    (direction: 'prev' | 'next') => {
      const list = currentAgentChats;
      if (!list.length) {
        return { ok: false, message: '暂无可切换对话' };
      }
      const currentIndex = list.findIndex((item) => String(item.chatId || '') === String(chatId || ''));
      if (currentIndex < 0) {
        return { ok: false, message: '未找到当前对话' };
      }

      const nextIndex = direction === 'prev' ? currentIndex + 1 : currentIndex - 1;
      if (nextIndex < 0) {
        return { ok: false, message: '已到最新对话' };
      }
      if (nextIndex >= list.length) {
        return { ok: false, message: '已到最早对话' };
      }
      const targetChatId = String(list[nextIndex]?.chatId || '');
      if (!targetChatId) {
        return { ok: false, message: '目标对话不可用' };
      }
      dispatch(setChatId(targetChatId));
      dispatch(closeChatDetailDrawer());
      return { ok: true };
    },
    [chatId, currentAgentChats, dispatch]
  );

  const handleRequestCreateAgentChatBySwipe = useCallback(() => {
    openNewCurrentAgentChat();
    return { ok: true, message: '已新建当前智能体对话' };
  }, [openNewCurrentAgentChat]);

  const handleRequestShowChatDetailDrawer = useCallback(() => {
    if (!isChatDetailOverlay) {
      dispatch(resetChatDetailDrawerPreview());
      return;
    }
    setInboxOpen(false);
    setPublishOpen(false);
    dispatch(setChatAgentsSidebarOpen(false));
    dispatch(openChatDetailDrawer());
  }, [dispatch, isChatDetailOverlay]);

  const handleRequestPreviewChatDetailDrawer = useCallback(
    (progress: number) => {
      if (!isChatDetailOverlay || chatDetailDrawerOpen) {
        dispatch(resetChatDetailDrawerPreview());
        return;
      }
      dispatch(setChatDetailDrawerPreviewProgress(progress));
    },
    [chatDetailDrawerOpen, dispatch, isChatDetailOverlay]
  );

  const openTerminalDetail = useCallback(
    (sessionId: string) => {
      dispatch(setActiveSessionId(sessionId));
      dispatch(reloadPty());
      dispatch(showTerminalDetailPane());
    },
    [dispatch]
  );

  if (booting) {
    return (
      <SafeAreaView edges={['top']} style={[styles.safeRoot, { backgroundColor: theme.surface }]}> 
        <View style={[styles.gradientFill, { backgroundColor: theme.surface }]}> 
          <View style={styles.bootWrap}>
            <View style={[styles.bootCard, { borderColor: theme.border }]}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[styles.bootText, { color: theme.textSoft }]}>正在加载配置...</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (authChecking) {
    return (
      <SafeAreaView edges={['top']} style={[styles.safeRoot, { backgroundColor: theme.surface }]}> 
        <View style={[styles.gradientFill, { backgroundColor: theme.surface }]}> 
          <View style={styles.bootWrap}>
            <View style={[styles.bootCard, { borderColor: theme.border }]}> 
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[styles.bootText, { color: theme.textSoft }]}>正在验证登录状态...</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!authReady) {
    return (
      <SafeAreaView edges={['top']} style={[styles.safeRoot, { backgroundColor: theme.surface }]}> 
        <View style={[styles.gradientFill, { backgroundColor: theme.surface }]}> 
          <View style={[styles.bootWrap, { paddingHorizontal: 20 }]}> 
            <View style={[styles.bootCard, { borderColor: theme.border, width: '100%', maxWidth: 440, flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}> 
              <Text style={[styles.authTitle, { color: theme.text }]}>设备登录</Text>
              <Text style={[styles.emptyHistoryText, { color: theme.textMute, textAlign: 'left' }]}>请先填写后端地址，再输入主密码完成设备授权。</Text>

              <TextInput
                value={endpointDraft}
                onChangeText={(text) => dispatch(setEndpointDraft(text))}
                placeholder="后端域名 / IP（如 api.example.com 或 192.168.1.8:8080）"
                placeholderTextColor={theme.textMute}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.chatSearchInput, { backgroundColor: theme.surfaceStrong, color: theme.text, marginBottom: 0 }]}
              />

              <TextInput
                value={deviceName}
                onChangeText={setDeviceName}
                placeholder="设备名称"
                placeholderTextColor={theme.textMute}
                style={[styles.chatSearchInput, { backgroundColor: theme.surfaceStrong, color: theme.text, marginBottom: 0 }]}
              />
              <TextInput
                value={masterPassword}
                onChangeText={setMasterPassword}
                placeholder="主密码"
                placeholderTextColor={theme.textMute}
                secureTextEntry
                style={[styles.chatSearchInput, { backgroundColor: theme.surfaceStrong, color: theme.text, marginBottom: 0 }]}
              />

              {authError ? <Text style={[styles.emptyHistoryText, { color: theme.danger, textAlign: 'left' }]}>{authError}</Text> : null}

              <TouchableOpacity
                activeOpacity={0.82}
                style={[
                  styles.publishPrimaryBtn,
                  styles.loginSubmitBtn,
                  {
                    backgroundColor: theme.primary,
                    borderColor: theme.primaryDeep,
                    alignSelf: 'stretch',
                    opacity: canSubmitLogin ? 1 : 0.56
                  }
                ]}
                onPress={() => {
                  submitLogin().catch(() => {});
                }}
                testID="app-login-submit-btn"
                disabled={!canSubmitLogin}
              >
                <Text style={styles.loginSubmitText}>登录设备</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={[styles.loginVersionTextBottom, { color: theme.textMute, bottom: insets.bottom + 12 }]} testID="login-version-label">
            {appVersionLabel}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safeRoot, { backgroundColor: theme.surface }]}
      nativeID="shell-root"
      testID="shell-root"
    >
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />

      <View style={[styles.gradientFill, { backgroundColor: theme.surface }]}> 
        <KeyboardAvoidingView
          style={[styles.shell, { paddingBottom: keyboardInset }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
        >
          <View style={styles.topNavCompact} nativeID="shell-top-nav" testID="shell-top-nav">
            {isChatDomain ? (
              hasChatOverlay ? (
                <TouchableOpacity
                  activeOpacity={0.72}
                  style={[styles.detailBackBtn, { backgroundColor: theme.surfaceStrong }]}
                  testID={isChatDetailOverlay ? 'chat-detail-back-btn' : 'chat-agent-back-btn'}
                  onPress={() => {
                    setPublishOpen(false);
                    setInboxOpen(false);
                    if (chatDetailDrawerOpen) {
                      dispatch(closeChatDetailDrawer());
                      return;
                    }
                    dispatch(popChatOverlay());
                  }}
                >
                  <Text
                    style={[styles.detailBackText, { color: theme.primaryDeep }]}
                    testID={isChatDetailOverlay ? 'chat-detail-back-text' : 'chat-agent-back-text'}
                  >
                    ‹
                  </Text>
                </TouchableOpacity>
              ) : chatRoute === 'search' ? (
                <TouchableOpacity
                  activeOpacity={0.72}
                  style={[styles.detailBackBtn, { backgroundColor: theme.surfaceStrong }]}
                  testID="chat-search-back-btn"
                  onPress={handleSearchBack}
                >
                  <Text style={[styles.detailBackText, { color: theme.primaryDeep }]}>‹</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.72}
                  style={[styles.iconOnlyBtn, { backgroundColor: theme.surfaceStrong }]}
                  testID="chat-left-action-btn"
                  onPress={() => {
                    setPublishOpen(false);
                    setInboxOpen(false);
                    setChatPlusMenuOpen(false);
                    dispatch(closeChatDetailDrawer());
                    dispatch(resetChatDetailDrawerPreview());
                    dispatch(setChatAgentsSidebarOpen(!chatAgentsSidebarOpen));
                  }}
                >
                  <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
                    <Rect x={2} y={5.6} width={16} height={2.2} rx={1.1} fill={theme.primaryDeep} />
                    <Rect x={2} y={12.2} width={10} height={2.2} rx={1.1} fill={theme.primaryDeep} />
                  </Svg>
                </TouchableOpacity>
              )
            ) : isTerminalDomain ? (
              terminalPane === 'detail' ? (
                <TouchableOpacity
                  activeOpacity={0.72}
                  style={[styles.detailBackBtn, { backgroundColor: theme.surfaceStrong }]}
                  testID="terminal-detail-back-btn"
                  onPress={() => {
                    setPublishOpen(false);
                    setInboxOpen(false);
                    dispatch(showTerminalListPane());
                  }}
                >
                  <Text style={[styles.detailBackText, { color: theme.primaryDeep }]}>‹</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.72}
                  style={[styles.iconOnlyBtn, { backgroundColor: theme.surfaceStrong }]}
                  testID="terminal-left-action-btn"
                  onPress={() => {
                    setPublishOpen(false);
                    setInboxOpen(false);
                  }}
                >
                  <Text style={[styles.topActionText, { color: theme.textMute }]}>·</Text>
                </TouchableOpacity>
              )
            ) : isUserDomain ? (
              <TouchableOpacity
                activeOpacity={0.72}
                style={[styles.iconOnlyBtn, { backgroundColor: theme.surfaceStrong }]}
                testID="shell-user-inbox-toggle-btn"
                onPress={() => {
                  setPublishOpen(false);
                  dispatch(setChatAgentsSidebarOpen(false));
                  dispatch(closeChatDetailDrawer());
                  setInboxOpen((prev) => !prev);
                }}
              >
                <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                  <Rect x={3.2} y={5} width={17.6} height={14} rx={3} stroke={theme.primaryDeep} strokeWidth={1.9} />
                  <Path d="M4.8 8.4L12 13.2L19.2 8.4" stroke={theme.primaryDeep} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
                {inboxUnreadCount > 0 ? (
                  <View style={[styles.inboxBadge, { backgroundColor: theme.danger }]}>
                    <Text style={styles.inboxBadgeText}>{inboxUnreadCount > 99 ? '99+' : String(inboxUnreadCount)}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ) : (
              <View style={styles.iconOnlyBtn} />
            )}

            {isChatDomain && !hasChatOverlay && chatRoute === 'search' ? (
              <View style={[styles.topSearchWrap, { backgroundColor: theme.surfaceStrong, borderColor: theme.border }]}>
                <TextInput
                  value={chatSearchQuery}
                  onChangeText={(value) => dispatch(setShellChatSearchQuery(value))}
                  placeholder="搜索 chat / 智能体"
                  placeholderTextColor={theme.textMute}
                  autoFocus
                  autoCorrect={false}
                  autoCapitalize="none"
                  style={[styles.topSearchInput, { color: theme.text }]}
                  testID="chat-top-search-input"
                />
              </View>
            ) : (
              <View style={[styles.assistantTopBtn, { backgroundColor: theme.surfaceStrong }]}>
                <View style={styles.assistantTopTextWrap}>
                  <Text style={[styles.assistantTopTitle, { color: theme.text }]} numberOfLines={1}>
                    {topNavTitle}
                  </Text>
                  {topNavSubtitle ? (
                    <Text
                      style={[styles.assistantTopSubTitle, { color: theme.textMute }]}
                      numberOfLines={1}
                      testID="shell-top-subtitle"
                    >
                      {topNavSubtitle}
                    </Text>
                  ) : null}
                </View>
              </View>
            )}

            {isTerminalDomain ? (
              <TouchableOpacity
                activeOpacity={0.72}
                style={[styles.topActionBtn, { backgroundColor: theme.surfaceStrong }]}
                testID="shell-terminal-refresh-btn"
                onPress={() => {
                  setInboxOpen(false);
                  setPublishOpen(false);
                  if (terminalPane === 'detail') {
                    dispatch(reloadPty());
                  } else {
                    refreshTerminalSessions().catch(() => {});
                  }
                }}
              >
                <Text style={[styles.topActionText, { color: theme.primaryDeep }]}>刷新</Text>
              </TouchableOpacity>
            ) : isChatDomain ? (
              isChatDetailOverlay ? (
                <TouchableOpacity
                  activeOpacity={0.72}
                  style={[styles.iconOnlyBtn, { backgroundColor: theme.surfaceStrong }]}
                  testID="chat-detail-menu-btn"
                  onPress={() => {
                    setInboxOpen(false);
                    setPublishOpen(false);
                    dispatch(setChatAgentsSidebarOpen(false));
                    dispatch(openChatDetailDrawer());
                  }}
                >
                  <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
                    <Rect x={2} y={4.8} width={16} height={2.2} rx={1.1} fill={theme.primaryDeep} />
                    <Rect x={2} y={8.9} width={16} height={2.2} rx={1.1} fill={theme.primaryDeep} />
                    <Rect x={2} y={13} width={16} height={2.2} rx={1.1} fill={theme.primaryDeep} />
                  </Svg>
                </TouchableOpacity>
              ) : isChatAgentOverlay ? (
                <View style={styles.iconOnlyBtn} testID="chat-agent-right-placeholder" />
              ) : chatRoute === 'search' ? (
                <View style={styles.iconOnlyBtn} testID="chat-search-right-placeholder" />
              ) : (
                <View style={styles.chatListTopActions} testID="chat-list-top-actions">
                  <TouchableOpacity
                    activeOpacity={0.72}
                    style={[styles.iconOnlyBtn, { backgroundColor: theme.surfaceStrong }]}
                    testID="chat-list-search-btn"
                    onPress={() => {
                      setChatPlusMenuOpen(false);
                      dispatch(showChatSearchRoute());
                    }}
                  >
                    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                      <Path
                        d="M16.2 16.2L20 20M18 11a7 7 0 1 1-14 0a7 7 0 0 1 14 0Z"
                        stroke={theme.primaryDeep}
                        strokeWidth={1.9}
                        strokeLinecap="round"
                      />
                    </Svg>
                  </TouchableOpacity>

                  <View style={styles.chatPlusWrap}>
                    <TouchableOpacity
                      activeOpacity={0.72}
                      style={[styles.iconOnlyBtn, { backgroundColor: theme.surfaceStrong }]}
                      testID="chat-list-plus-btn"
                      onPress={() => setChatPlusMenuOpen((prev) => !prev)}
                    >
                      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                        <Path d="M12 5v14M5 12h14" stroke={theme.primaryDeep} strokeWidth={2} strokeLinecap="round" />
                      </Svg>
                    </TouchableOpacity>

                    {chatPlusMenuOpen ? (
                      <View style={[styles.chatPlusMenu, { backgroundColor: theme.surfaceStrong, borderColor: theme.border }]} testID="chat-list-plus-menu">
                        {['扫一扫', '建立群组', '创建频道'].map((label, index) => (
                          <TouchableOpacity
                            key={label}
                            activeOpacity={0.74}
                            style={[
                              styles.chatPlusMenuItem,
                              index > 0 ? { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth } : null
                            ]}
                            testID={`chat-list-plus-menu-item-${index}`}
                            onPress={() => {
                              setChatPlusMenuOpen(false);
                              dispatch(setStatusText(`功能建设中：${label}`));
                            }}
                          >
                            <Text style={[styles.chatPlusMenuItemText, { color: theme.text }]}>{label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </View>
              )
            ) : isAgentsDomain ? (
              <TouchableOpacity
                activeOpacity={0.72}
                style={[styles.topActionBtn, { backgroundColor: theme.surfaceStrong }]}
                testID="shell-publish-toggle-btn"
                onPress={() => {
                  dispatch(setChatAgentsSidebarOpen(false));
                  setInboxOpen(false);
                  setPublishOpen((prev) => !prev);
                }}
              >
                <Text style={[styles.topActionText, { color: theme.primaryDeep }]}>发布</Text>
              </TouchableOpacity>
            ) : isUserDomain ? (
              <TouchableOpacity
                activeOpacity={0.72}
                style={[styles.iconOnlyBtn, { backgroundColor: theme.surfaceStrong }]}
                testID="shell-theme-toggle-btn"
                onPress={() => {
                  dispatch(setChatAgentsSidebarOpen(false));
                  setPublishOpen(false);
                  setInboxOpen(false);
                  dispatch(toggleTheme());
                }}
              >
                <Text style={[styles.themeToggleText, { color: theme.primaryDeep }]}>◐</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.iconOnlyBtn} />
            )}
          </View>

          {isChatDomain && !hasChatOverlay && chatRoute === 'list' && chatPlusMenuOpen ? (
            <Pressable style={styles.chatTopMenuMask} onPress={() => setChatPlusMenuOpen(false)} testID="chat-list-plus-menu-mask" />
          ) : null}

          <View style={styles.domainContent}>
            {isChatDomain ? (
              <View style={styles.stackViewport} testID="chat-pane-stack">
                <Animated.View
                  style={[
                    styles.stackTrack,
                    {
                      width: window.width * 2,
                      transform: [{ translateX: chatRouteTranslateX }]
                    }
                  ]}
                  testID="chat-route-track"
                >
                  <View
                    pointerEvents={chatRoute === 'list' ? 'auto' : 'none'}
                    style={[styles.stackPage, { width: window.width }]}
                    testID="chat-route-page-list"
                  >
                    <ChatListPane
                      theme={theme}
                      loading={loadingChats}
                      items={agentLatestChats}
                      onSelectChat={openChatDetail}
                      onSelectAgentProfile={openAgentProfile}
                    />
                  </View>
                  <View
                    pointerEvents={chatRoute === 'search' ? 'auto' : 'none'}
                    style={[styles.stackPage, { width: window.width }]}
                    testID="chat-route-page-search"
                  >
                    <ChatSearchPane
                      theme={theme}
                      keyword={chatSearchQuery}
                      agentResults={searchAgentResults}
                      chatResults={searchChatResults}
                      onSelectRecentKeyword={(keyword) => dispatch(setShellChatSearchQuery(keyword))}
                      onSelectAgent={handleSearchSelectAgent}
                      onSelectChat={openChatDetail}
                    />
                  </View>
                </Animated.View>
                {chatOverlayStack.map((overlay, index) => {
                  const isTop = index === chatOverlayStack.length - 1;
                  return (
                    <Animated.View
                      key={overlay.overlayId}
                      pointerEvents={isTop ? 'auto' : 'none'}
                      style={[
                        styles.chatOverlayPage,
                        { zIndex: 10 + index, backgroundColor: theme.surface },
                        isTop
                          ? {
                              opacity: chatOverlayEnterAnim,
                              transform: [{ translateX: chatOverlayEnterTranslateX }]
                            }
                          : null
                      ]}
                    >
                      {overlay.type === 'chatDetail' ? (
                        <ChatAssistantScreen
                          theme={theme}
                          backendUrl={backendUrl}
                          contentWidth={window.width}
                          onRefreshChats={refreshChats}
                          keyboardHeight={keyboardInset}
                          refreshSignal={chatRefreshSignal}
                          authAccessToken={authAccessToken}
                          authAccessExpireAtMs={authAccessExpireAtMs}
                          authTokenSignal={authTokenSignal}
                          onWebViewAuthRefreshRequest={handleWebViewAuthRefreshRequest}
                          onRequestSwitchAgentChat={handleRequestSwitchAgentChat}
                          onRequestCreateAgentChatBySwipe={handleRequestCreateAgentChatBySwipe}
                          onRequestPreviewChatDetailDrawer={handleRequestPreviewChatDetailDrawer}
                          onRequestShowChatDetailDrawer={handleRequestShowChatDetailDrawer}
                        />
                      ) : (
                        <AgentProfilePane
                          theme={theme}
                          agent={activeAgent}
                          onStartChat={handleAgentProfileStartChat}
                        />
                      )}
                    </Animated.View>
                  );
                })}
                <SwipeBackEdge
                  enabled={hasChatOverlay && !chatDetailDrawerOpen && !chatAgentsSidebarOpen}
                  onBack={() => dispatch(popChatOverlay())}
                />
                {!hasChatOverlay && chatRoute === 'search' ? (
                  <SwipeBackEdge enabled onBack={handleSearchBack} />
                ) : null}
              </View>
            ) : null}

            {isTerminalDomain ? (
              <View style={styles.stackViewport} testID="terminal-pane-stack">
                <Animated.View
                  style={[
                    styles.stackTrack,
                    {
                      width: window.width * 2,
                      transform: [{ translateX: terminalTranslateX }]
                    }
                  ]}
                >
                  <View style={[styles.stackPage, { width: window.width }]}>
                    <TerminalSessionListPane
                      theme={theme}
                      loading={terminalSessionsLoading}
                      error={terminalSessionsError}
                      sessions={terminalSessions}
                      activeSessionId={activeTerminalSessionId}
                      onCreateSession={openTerminalCreateSessionModal}
                      onRefresh={() => {
                        refreshTerminalSessions().catch(() => {});
                      }}
                      onSelectSession={openTerminalDetail}
                    />
                  </View>
                  <View style={[styles.stackPage, { width: window.width }]}>
                    <TerminalScreen
                      theme={theme}
                      authAccessToken={authAccessToken}
                      authAccessExpireAtMs={authAccessExpireAtMs}
                      authTokenSignal={authTokenSignal}
                      onWebViewAuthRefreshRequest={handleWebViewAuthRefreshRequest}
                    />
                  </View>
                </Animated.View>
                <SwipeBackEdge enabled={terminalPane === 'detail'} onBack={() => dispatch(showTerminalListPane())} />
              </View>
            ) : null}

            {isAgentsDomain ? <AgentsScreen theme={theme} /> : null}
            {isUserDomain ? (
              <UserSettingsScreen
                theme={theme}
                onSettingsApplied={() => refreshAll(true)}
                username={authUsername}
                deviceName={authDeviceName}
                accessToken={authAccessToken}
                versionLabel={appVersionLabel}
                onLogout={handleLogout}
              />
            ) : null}
          </View>

          {showBottomNav ? (
            <View style={[styles.bottomNavWrap, { paddingBottom: Math.max(insets.bottom, 6) }]}>
              <BottomDomainNav value={activeDomain} theme={theme} onPressItem={handleDomainSwitch} />
            </View>
          ) : null}
        </KeyboardAvoidingView>

        <View pointerEvents={inboxOpen ? 'auto' : 'none'} style={styles.inboxLayer}>
          <Animated.View
            style={[
              styles.inboxModal,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                opacity: inboxAnim,
                paddingTop: insets.top + 8,
                transform: [
                  {
                    translateY: inboxAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-Math.max(120, window.height * 0.16), 0]
                    })
                  }
                ]
              }
            ]}
          >
            <View style={[styles.inboxModalHead, { borderBottomColor: theme.border }]}> 
              <View>
                <Text style={[styles.inboxTitle, { color: theme.text }]}>消息盒子</Text>
                <Text style={[styles.inboxSubTitle, { color: theme.textMute }]}>未读 {inboxUnreadCount}</Text>
              </View>
              <View style={styles.inboxHeadActions}>
                <TouchableOpacity
                  activeOpacity={0.78}
                  style={[styles.inboxActionBtn, { borderColor: theme.border, backgroundColor: theme.surfaceStrong }]}
                  onPress={() => {
                    markAllInboxRead().catch(() => {});
                  }}
                  testID="shell-inbox-read-all-btn"
                >
                  <Text style={[styles.inboxCloseText, { color: theme.textSoft }]}>全部已读</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.78}
                  style={[styles.inboxActionBtn, { borderColor: theme.border, backgroundColor: theme.surfaceStrong }]}
                  onPress={() => setInboxOpen(false)}
                  testID="shell-inbox-close-btn"
                >
                  <Text style={[styles.inboxCloseText, { color: theme.textSoft }]}>关闭</Text>
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView style={styles.inboxModalScroll} contentContainerStyle={styles.inboxList}>
              {inboxLoading ? <Text style={[styles.inboxItemBody, { color: theme.textMute }]}>加载中...</Text> : null}
              {!inboxLoading && inboxMessages.length === 0 ? (
                <Text style={[styles.inboxItemBody, { color: theme.textMute }]}>暂无消息</Text>
              ) : null}
              {inboxMessages.map((message) => (
                <TouchableOpacity
                  key={message.messageId}
                  activeOpacity={0.78}
                  style={[
                    styles.inboxItem,
                    {
                      borderColor: theme.border,
                      backgroundColor: message.read ? theme.surface : theme.primarySoft
                    }
                  ]}
                  onPress={() => {
                    if (!message.read) {
                      markInboxRead(message.messageId).catch(() => {});
                    }
                  }}
                >
                  <View style={styles.inboxItemTop}>
                    <Text style={[styles.inboxItemTitle, { color: theme.text }]}>{message.title}</Text>
                    <Text style={[styles.inboxItemTime, { color: theme.textMute }]}>{formatInboxTime(message.createAt)}</Text>
                  </View>
                  <Text style={[styles.inboxItemBody, { color: theme.textSoft }]}>{message.content}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Animated.View>
        </View>

        <View pointerEvents={publishOpen ? 'auto' : 'none'} style={styles.publishLayer}>
          <Animated.View
            style={[
              styles.publishModal,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                opacity: publishAnim,
                paddingTop: insets.top + 8,
                transform: [
                  {
                    translateY: publishAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [Math.max(120, window.height * 0.14), 0]
                    })
                  }
                ]
              }
            ]}
          >
            <View style={[styles.publishHead, { borderBottomColor: theme.border }]}>
              <View style={styles.publishTitleWrap}>
                <Text style={[styles.publishTitle, { color: theme.text }]}>发布中心</Text>
                <Text style={[styles.publishSubTitle, { color: theme.textMute }]} numberOfLines={2}>
                  {selectedAgentKey ? `当前智能体：${selectedAgentKey}` : '请先选择智能体，然后发起发布。'}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.78}
                style={[styles.publishCloseBtn, { borderColor: theme.border, backgroundColor: theme.surfaceStrong }]}
                onPress={() => setPublishOpen(false)}
                testID="shell-publish-close-btn"
              >
                <Text style={[styles.publishCloseText, { color: theme.textSoft }]}>关闭</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.publishScroll} contentContainerStyle={styles.publishContent}>
              <View style={[styles.publishSection, { borderColor: theme.border, backgroundColor: theme.surfaceStrong }]}>
                <Text style={[styles.publishSectionTitle, { color: theme.text }]}>发布目标</Text>
                <View style={styles.publishChipRow}>
                  {['内部频道', '变更公告页', '测试环境'].map((item) => (
                    <View key={item} style={[styles.publishChip, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
                      <Text style={[styles.publishChipText, { color: theme.textSoft }]}>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={[styles.publishSection, { borderColor: theme.border, backgroundColor: theme.surfaceStrong }]}>
                <Text style={[styles.publishSectionTitle, { color: theme.text }]}>发布说明</Text>
                <Text style={[styles.publishSectionBody, { color: theme.textSoft }]}>本次发布会同步当前智能体配置、默认提示词和会话能力开关。建议先在测试环境验证 5 分钟后再推送到团队频道。</Text>
              </View>

              <View style={[styles.publishSection, { borderColor: theme.border, backgroundColor: theme.surfaceStrong }]}>
                <Text style={[styles.publishSectionTitle, { color: theme.text }]}>发布清单</Text>
                <View style={styles.publishChecklist}>
                  {['配置校验已通过', '变更摘要已生成', '回滚方案已就绪'].map((item) => (
                    <View key={item} style={styles.publishChecklistItem}>
                      <Text style={[styles.publishChecklistDot, { color: theme.primaryDeep }]}>•</Text>
                      <Text style={[styles.publishChecklistText, { color: theme.textSoft }]}>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={[styles.publishFooter, { borderTopColor: theme.border }]}> 
              <TouchableOpacity
                activeOpacity={0.76}
                style={[styles.publishGhostBtn, { backgroundColor: theme.surfaceStrong }]}
                onPress={() => setPublishOpen(false)}
              >
                <Text style={[styles.publishGhostText, { color: theme.textSoft }]}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.82}
                style={[styles.publishPrimaryBtn, { backgroundColor: theme.primary }]}
                testID="shell-publish-submit-btn"
                onPress={() => {
                  setPublishOpen(false);
                  dispatch(setStatusText('发布任务已创建（演示）'));
                }}
              >
                <Text style={styles.publishPrimaryText}>确认发布</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>

        <AgentSidebar
          visible={isChatDomain && chatAgentsSidebarOpen}
          theme={theme}
          agents={agents}
          selectedAgentKey={selectedAgentKey}
          onClose={() => dispatch(setChatAgentsSidebarOpen(false))}
          onSelectAgent={handleAgentSelectNewChat}
        />
        <ChatDetailDrawer
          visible={isChatDomain && isChatDetailOverlay && chatDetailDrawerOpen}
          previewProgress={isChatDomain && isChatDetailOverlay ? chatDetailDrawerPreviewProgress : 0}
          interactive={isChatDomain && isChatDetailOverlay && chatDetailDrawerOpen}
          theme={theme}
          activeAgentName={activeAgentName}
          chats={currentAgentChats}
          activeChatId={chatId}
          onClose={() => dispatch(closeChatDetailDrawer())}
          onCreateChat={openNewCurrentAgentChat}
          onSelectChat={(nextChatId) => {
            dispatch(setChatId(nextChatId));
            dispatch(closeChatDetailDrawer());
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeRoot: {
    flex: 1
  },
  gradientFill: {
    flex: 1
  },
  shell: {
    flex: 1
  },
  bootWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  bootCard: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  authTitle: {
    fontSize: 18,
    fontWeight: '600'
  },
  bootText: {
    fontSize: 14
  },
  domainContent: {
    flex: 1
  },
  chatTopMenuMask: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 56,
    zIndex: 8
  },
  stackViewport: {
    flex: 1,
    overflow: 'hidden'
  },
  stackTrack: {
    flex: 1,
    flexDirection: 'row'
  },
  stackPage: {
    flex: 1
  },
  chatOverlayPage: {
    ...StyleSheet.absoluteFillObject
  },
  topNavCompact: {
    position: 'relative',
    zIndex: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 14,
    marginTop: 6,
    marginBottom: 6,
    gap: 8
  },
  iconOnlyBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  detailBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  inboxBadge: {
    position: 'absolute',
    right: -4,
    top: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3
  },
  inboxBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '600'
  },
  topActionBtn: {
    minWidth: 52,
    height: 34,
    borderRadius: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  topActionText: {
    fontSize: 12,
    fontWeight: '600'
  },
  chatListTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  chatPlusWrap: {
    position: 'relative'
  },
  chatPlusMenu: {
    position: 'absolute',
    right: 0,
    top: 40,
    width: 132,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    zIndex: 12
  },
  chatPlusMenuItem: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 10
  },
  chatPlusMenuItemText: {
    fontSize: 12,
    fontWeight: '600'
  },
  detailBackText: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22
  },
  themeToggleText: {
    fontSize: 16,
    fontWeight: '600'
  },
  assistantTopBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    gap: 5
  },
  topSearchWrap: {
    flex: 1,
    minHeight: 36,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    paddingHorizontal: 10
  },
  topSearchInput: {
    height: 34,
    paddingHorizontal: 0,
    paddingVertical: 0,
    fontSize: 13
  },
  assistantTopTextWrap: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
    alignItems: 'center',
    maxWidth: '84%'
  },
  assistantTopTitle: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center'
  },
  assistantTopSubTitle: {
    marginTop: 0,
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center'
  },
  inboxLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 12
  },
  inboxModal: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: StyleSheet.hairlineWidth
  },
  inboxModalHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  inboxModalScroll: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 10
  },
  inboxHeadActions: {
    flexDirection: 'row',
    gap: 8
  },
  inboxActionBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  inboxCloseText: {
    fontSize: 11,
    fontWeight: '600'
  },
  inboxTitle: {
    fontSize: 15,
    fontWeight: '700'
  },
  inboxSubTitle: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2
  },
  inboxList: {
    paddingBottom: 16,
    gap: 8
  },
  inboxItem: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  inboxItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  inboxItemTitle: {
    fontSize: 13,
    fontWeight: '600'
  },
  inboxItemTime: {
    fontSize: 10
  },
  inboxItemBody: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16
  },
  publishLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 13
  },
  publishModal: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: StyleSheet.hairlineWidth
  },
  publishHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  publishTitleWrap: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10
  },
  publishTitle: {
    fontSize: 16,
    fontWeight: '600'
  },
  publishSubTitle: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16
  },
  publishCloseBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  publishCloseText: {
    fontSize: 11,
    fontWeight: '600'
  },
  publishScroll: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 10
  },
  publishContent: {
    paddingBottom: 14,
    gap: 10
  },
  publishSection: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  publishSectionTitle: {
    fontSize: 13,
    fontWeight: '600'
  },
  publishSectionBody: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18
  },
  publishChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8
  },
  publishChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  publishChipText: {
    fontSize: 11,
    fontWeight: '600'
  },
  publishChecklist: {
    marginTop: 8,
    gap: 6
  },
  publishChecklistItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6
  },
  publishChecklistDot: {
    fontSize: 12,
    lineHeight: 16
  },
  publishChecklistText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18
  },
  publishFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    flexDirection: 'row',
    gap: 8
  },
  publishGhostBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center'
  },
  publishGhostText: {
    fontSize: 12,
    fontWeight: '600'
  },
  publishPrimaryBtn: {
    flex: 1.2,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center'
  },
  publishPrimaryText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600'
  },
  loginSubmitBtn: {
    minHeight: 44,
    borderWidth: 1
  },
  loginSubmitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3
  },
  loginVersionTextBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    fontSize: 11,
    textAlign: 'center'
  },
  chatSearchInput: {
    borderRadius: 10,
    height: 38,
    paddingHorizontal: 12,
    paddingVertical: 0,
    fontSize: 13,
    lineHeight: 18,
    textAlignVertical: 'center',
    marginBottom: 10
  },
  emptyHistoryText: {
    fontSize: 12
  },
  bottomNavWrap: {
    borderTopWidth: 0
  }
});
