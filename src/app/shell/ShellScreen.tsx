import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Animated,
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
import { setDrawerOpen } from './shellSlice';
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
  setChatKeyword,
  setChats,
  setLoadingChats,
  setStatusText
} from '../../modules/chat/state/chatSlice';
import { reloadPty, requestOpenNewSessionModal, setActiveSessionId } from '../../modules/terminal/state/terminalSlice';
import { selectFilteredChats } from '../../modules/chat/state/chatSelectors';
import { ChatAssistantScreen } from '../../modules/chat/screens/ChatAssistantScreen';
import { TerminalScreen } from '../../modules/terminal/screens/TerminalScreen';
import { AgentsScreen } from '../../modules/agents/screens/AgentsScreen';
import { UserSettingsScreen } from '../../modules/user/screens/UserSettingsScreen';
import { DomainSwitcher } from './DomainSwitcher';
import { useLazyGetAgentsQuery } from '../../modules/agents/api/agentsApi';
import { useLazyGetChatsQuery } from '../../modules/chat/api/chatApi';
import { useLazyListTerminalSessionsQuery } from '../../modules/terminal/api/terminalApi';
import { fetchAuthedJson, formatError } from '../../core/network/apiClient';
import { formatChatListTime, formatInboxTime, getAgentKey, getAgentName, getChatAgentName, getChatTitle } from '../../shared/utils/format';
import { getAppVersionLabel } from '../../shared/utils/appVersion';
import { TerminalSessionItem } from '../../modules/terminal/types/terminal';
import {
  ensureFreshAccessToken,
  getCurrentSession,
  getAccessToken,
  getDefaultDeviceName,
  loginWithMasterPassword,
  restoreSession,
  subscribeAuthSession
} from '../../core/auth/appAuth';
import { WebViewAuthRefreshCoordinator, WebViewAuthRefreshOutcome } from '../../core/auth/webViewAuthBridge';

const DRAWER_MAX_WIDTH = 332;
const PREFRESH_MIN_VALIDITY_MS = 120_000;
const PREFRESH_JITTER_MS = 8_000;
const ACTIVE_REFRESH_DEBOUNCE_MS = 20_000;
const FOREGROUND_REFRESH_INTERVAL_MS = 60_000;

const DOMAIN_LABEL: Record<DomainMode, string> = {
  chat: '助理',
  terminal: '终端',
  agents: '智能体',
  user: '配置'
};

const DRAWER_TITLE: Record<DomainMode, string> = {
  chat: '对话',
  terminal: '会话',
  agents: '智能体',
  user: '配置'
};

export function ShellScreen() {
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();

  const drawerOpen = useAppSelector((state) => state.shell.drawerOpen);
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
  const chatKeyword = useAppSelector((state) => state.chat.chatKeyword);
  const loadingChats = useAppSelector((state) => state.chat.loadingChats);
  const agentsLoading = useAppSelector((state) => state.agents.loading);
  const agents = useAppSelector((state) => state.agents.agents);
  const filteredChats = useAppSelector(selectFilteredChats);
  const activeTerminalSessionId = useAppSelector((state) => state.terminal.activeSessionId);

  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
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

  const drawerAnim = useRef(new Animated.Value(0)).current;
  const inboxAnim = useRef(new Animated.Value(0)).current;
  const publishAnim = useRef(new Animated.Value(0)).current;
  const theme = THEMES[themeMode] || THEMES.light;
  const backendUrl = useMemo(() => toBackendBaseUrl(endpointInput), [endpointInput]);
  const ptyWebUrl = useMemo(() => normalizePtyUrlInput(ptyUrlInput, endpointInput), [endpointInput, ptyUrlInput]);
  const normalizedLoginEndpointDraft = useMemo(
    () => normalizeEndpointInput(endpointDraft),
    [endpointDraft]
  );
  const canSubmitLogin = Boolean(normalizedLoginEndpointDraft) && !authChecking;

  const drawerWidth = useMemo(() => {
    const candidate = Math.floor(window.width * 0.84);
    return Math.min(DRAWER_MAX_WIDTH, Math.max(278, candidate));
  }, [window.width]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvent, (e) => setShellKeyboardHeight(e?.endCoordinates?.height || 0));
    const onHide = Keyboard.addListener(hideEvent, () => setShellKeyboardHeight(0));
    return () => { onShow.remove(); onHide.remove(); };
  }, []);

  const keyboardInset = Platform.OS === 'android' ? Math.max(0, shellKeyboardHeight - insets.bottom) : 0;

  const drawerTranslateX = useMemo(
    () =>
      drawerAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [-drawerWidth, 0]
      }),
    [drawerAnim, drawerWidth]
  );

  const mainTranslateX = useMemo(
    () =>
      drawerAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, drawerWidth - 42]
      }),
    [drawerAnim, drawerWidth]
  );

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
    dispatch(setDrawerOpen(false));
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
    Animated.timing(drawerAnim, {
      toValue: drawerOpen ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [drawerAnim, drawerOpen]);

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
    if (activeDomain !== 'chat' || drawerOpen) {
      setAgentMenuOpen(false);
    }
  }, [activeDomain, drawerOpen]);

  useEffect(() => {
    if (drawerOpen) {
      setInboxOpen(false);
      setPublishOpen(false);
    }
  }, [drawerOpen]);

  useEffect(() => {
    if (activeDomain !== 'chat' && inboxOpen) {
      setInboxOpen(false);
    }
  }, [activeDomain, inboxOpen]);

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
    }
  }, [authReady, dispatch]);

  useEffect(() => {
    if (booting || !authReady || activeDomain !== 'terminal') {
      return;
    }
    refreshTerminalSessions(true).catch(() => {});
  }, [activeDomain, authReady, booting, refreshTerminalSessions]);

  useEffect(() => {
    if (!drawerOpen || !authReady || activeDomain !== 'terminal') {
      return;
    }
    refreshTerminalSessions(true).catch(() => {});
  }, [activeDomain, authReady, drawerOpen, refreshTerminalSessions]);

  useEffect(() => {
    if (activeDomain !== 'agents' && publishOpen) {
      setPublishOpen(false);
    }
  }, [activeDomain, publishOpen]);

  const activeAgentName = useMemo(() => {
    const found = agents.find((agent) => getAgentKey(agent) === selectedAgentKey);
    return getAgentName(found || agents[0]) || 'Agent';
  }, [agents, selectedAgentKey]);

  const isChatDomain = activeDomain === 'chat';
  const isTerminalDomain = activeDomain === 'terminal';
  const isAgentsDomain = activeDomain === 'agents';
  const isUserDomain = activeDomain === 'user';
  const topNavTitle = isChatDomain ? activeAgentName : isTerminalDomain ? '终端/CLI' : DOMAIN_LABEL[activeDomain];
  const topNavSubtitle = selectedAgentKey;
  const profileName = authUsername || '未登录用户';
  const profileDeviceLabel = authDeviceName || deviceName || '当前设备';
  const profileInitial = useMemo(() => {
    const source = profileName.trim();
    return source ? source.slice(0, 1).toUpperCase() : 'U';
  }, [profileName]);
  const appVersionLabel = useMemo(() => getAppVersionLabel(), []);

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
              <Text style={[styles.drawerTitle, { color: theme.text, fontSize: 18 }]}>设备登录</Text>
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
              <Text style={[styles.loginVersionText, { color: theme.textMute }]} testID="login-version-label">
                {appVersionLabel}
              </Text>
            </View>
          </View>
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
        <Animated.View style={[styles.mainShell, { transform: [{ translateX: mainTranslateX }] }]}> 
          <KeyboardAvoidingView
            style={[styles.shell, { paddingBottom: keyboardInset }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
            pointerEvents={drawerOpen ? 'none' : 'auto'}
          >
            <View style={styles.topNavCompact} nativeID="shell-top-nav" testID="shell-top-nav">
              <TouchableOpacity
                activeOpacity={0.72}
                style={[styles.iconOnlyBtn, { backgroundColor: theme.surfaceStrong }]}
                testID="open-drawer-btn"
                onPress={() => {
                  setAgentMenuOpen(false);
                  setInboxOpen(false);
                  setPublishOpen(false);
                  dispatch(setDrawerOpen(true));
                }}
              >
                <Svg width={20} height={20} viewBox="0 0 20 20" fill="none" style={styles.menuIconSvg}>
                  <Rect x={2} y={5.6} width={16} height={2.2} rx={1.1} fill={theme.primaryDeep} />
                  <Rect x={2} y={12.2} width={10} height={2.2} rx={1.1} fill={theme.primaryDeep} />
                </Svg>
              </TouchableOpacity>

              {isChatDomain ? (
                <TouchableOpacity
                  activeOpacity={0.76}
                  style={[styles.assistantTopBtn, { backgroundColor: theme.surfaceStrong }]}
                  testID="chat-agent-toggle-btn"
                  onPress={() => {
                    setInboxOpen(false);
                    setPublishOpen(false);
                    setAgentMenuOpen((prev) => !prev);
                  }}
                >
                  <View style={styles.assistantTopTextWrap}>
                    <Text style={[styles.assistantTopTitle, { color: theme.text }]} numberOfLines={1}>
                      {topNavTitle}
                    </Text>
                    <Text style={[styles.assistantTopSubTitle, { color: theme.textMute }]} numberOfLines={1}>
                      {topNavSubtitle}
                    </Text>
                  </View>
                  <Text style={[styles.assistantTopArrow, { color: theme.textMute }]}>{agentMenuOpen ? '▴' : '▾'}</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.assistantTopBtn, { backgroundColor: theme.surfaceStrong }]}>
                  <Text style={[styles.assistantTopSingleTitle, { color: theme.text }]} numberOfLines={1}>
                    {topNavTitle}
                  </Text>
                </View>
              )}

              {isTerminalDomain ? (
                <TouchableOpacity
                  activeOpacity={0.72}
                  style={[styles.topActionBtn, { backgroundColor: theme.surfaceStrong }]}
                  testID="shell-terminal-refresh-btn"
                  onPress={() => {
                    setAgentMenuOpen(false);
                    setInboxOpen(false);
                    setPublishOpen(false);
                    dispatch(reloadPty());
                  }}
                >
                  <Text style={[styles.topActionText, { color: theme.primaryDeep }]}>刷新</Text>
                </TouchableOpacity>
              ) : isAgentsDomain ? (
                <TouchableOpacity
                  activeOpacity={0.72}
                  style={[styles.topActionBtn, { backgroundColor: theme.surfaceStrong }]}
                  testID="shell-publish-toggle-btn"
                  onPress={() => {
                    setAgentMenuOpen(false);
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
                    setAgentMenuOpen(false);
                    setPublishOpen(false);
                    setInboxOpen(false);
                    dispatch(toggleTheme());
                  }}
                >
                  <Text style={[styles.themeToggleText, { color: theme.primaryDeep }]}>◐</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.72}
                  style={[styles.iconOnlyBtn, { backgroundColor: theme.surfaceStrong }]}
                  testID="shell-inbox-toggle-btn"
                  onPress={() => {
                    setAgentMenuOpen(false);
                    setPublishOpen(false);
                    setInboxOpen((prev) => !prev);
                  }}
                >
                  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" style={styles.inboxIconSvg}>
                    <Rect x={3.2} y={5} width={17.6} height={14} rx={3} stroke={theme.primaryDeep} strokeWidth={1.9} />
                    <Path d="M4.8 8.4L12 13.2L19.2 8.4" stroke={theme.primaryDeep} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                  {inboxUnreadCount > 0 ? (
                    <View style={[styles.inboxBadge, { backgroundColor: theme.danger }]}> 
                      <Text style={styles.inboxBadgeText}>{inboxUnreadCount > 99 ? '99+' : String(inboxUnreadCount)}</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              )}
            </View>

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
                    <Text style={[styles.publishSectionBody, { color: theme.textSoft }]}>
                      本次发布会同步当前智能体配置、默认提示词和会话能力开关。建议先在测试环境验证 5 分钟后再推送到团队频道。
                    </Text>
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

            {isChatDomain && agentMenuOpen ? (
              <View
                style={[styles.agentMenuCard, { backgroundColor: theme.surfaceStrong, borderColor: theme.border }]}
                nativeID="agent-menu-card"
                testID="agent-menu-card"
              >
                <ScrollView style={styles.agentMenuList} contentContainerStyle={styles.agentMenuListContent}>
                  {(agents.length ? agents : [{ key: '', name: '暂无 Agent' }]).map((agent, index) => {
                    const key = getAgentKey(agent);
                    const name = getAgentName(agent) || key || `Agent ${index + 1}`;
                    const selected = key && key === selectedAgentKey;
                    return (
                      <TouchableOpacity
                        key={key || `${name}-${index}`}
                        disabled={!key}
                        activeOpacity={0.78}
                        testID={`agent-menu-item-${index}`}
                        style={[
                          styles.agentMenuItem,
                          {
                            backgroundColor: selected ? theme.primarySoft : theme.surface,
                            borderColor: selected ? theme.primary : theme.border
                          }
                        ]}
                        onPress={() => {
                          if (!key) return;
                          dispatch(setAgentsSelectedAgentKey(key));
                          dispatch(setUserSelectedAgentKey(key));
                          setAgentMenuOpen(false);
                        }}
                      >
                        <View style={styles.agentMenuItemRow}>
                          <View style={styles.agentMenuTextWrap}>
                            <Text style={[styles.agentMenuItemText, { color: selected ? theme.primaryDeep : theme.text }]}>{name}</Text>
                            <Text style={[styles.agentMenuItemSubText, { color: theme.textMute }]} numberOfLines={1}>
                              {key || '未配置 key'}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {isChatDomain ? (
              <ChatAssistantScreen
                theme={theme}
                backendUrl={backendUrl}
                contentWidth={window.width}
                onRefreshChats={refreshChats}
                keyboardHeight={shellKeyboardHeight}
                refreshSignal={chatRefreshSignal}
                authAccessToken={authAccessToken}
                authAccessExpireAtMs={authAccessExpireAtMs}
                authTokenSignal={authTokenSignal}
                onWebViewAuthRefreshRequest={handleWebViewAuthRefreshRequest}
              />
            ) : null}

            {isTerminalDomain ? (
              <TerminalScreen
                theme={theme}
                authAccessToken={authAccessToken}
                authAccessExpireAtMs={authAccessExpireAtMs}
                authTokenSignal={authTokenSignal}
                onWebViewAuthRefreshRequest={handleWebViewAuthRefreshRequest}
              />
            ) : null}
            {isAgentsDomain ? <AgentsScreen theme={theme} /> : null}
            {isUserDomain ? <UserSettingsScreen theme={theme} onSettingsApplied={() => refreshAll(true)} /> : null}
          </KeyboardAvoidingView>
        </Animated.View>

        <View pointerEvents="none" style={[styles.homeVersionWrap, { bottom: insets.bottom + 8 }]}>
          <Text style={[styles.homeVersionText, { color: theme.textMute }]} testID="home-version-label">
            {appVersionLabel}
          </Text>
        </View>

        <View pointerEvents={drawerOpen ? 'auto' : 'none'} style={StyleSheet.absoluteFill}>
          <Animated.View style={[styles.drawerOverlay, { opacity: drawerAnim }]}> 
            <Pressable style={StyleSheet.absoluteFill} onPress={() => dispatch(setDrawerOpen(false))} />
          </Animated.View>

          <Animated.View
            style={[
              styles.drawerPanel,
              {
                width: drawerWidth,
                paddingTop: insets.top + 8,
                transform: [{ translateX: drawerTranslateX }],
                backgroundColor: theme.surface
              }
            ]}
            nativeID="shell-drawer-panel"
            testID="shell-drawer-panel"
          >
            <View style={styles.drawerHead}>
              <View style={styles.drawerHeadLeft}>
                <Text style={[styles.drawerTitle, { color: theme.text }]}>{DRAWER_TITLE[activeDomain]}</Text>
                {activeDomain === 'chat' ? (
                  <TouchableOpacity
                    activeOpacity={0.74}
                    style={styles.drawerHeadNewChatBtn}
                    testID="new-chat-btn"
                    onPress={() => {
                      dispatch(setChatId(''));
                      dispatch(setStatusText(''));
                      dispatch(setDrawerOpen(false));
                    }}
                  >
                    <Text style={[styles.drawerHeadNewChatText, { color: theme.primaryDeep }]}>+新建对话</Text>
                  </TouchableOpacity>
                ) : null}
                {activeDomain === 'terminal' ? (
                  <TouchableOpacity
                    activeOpacity={0.76}
                    style={styles.drawerHeadRefreshBtn}
                    testID="terminal-sessions-refresh-btn"
                    onPress={() => {
                      refreshTerminalSessions().catch(() => {});
                    }}
                  >
                    {terminalSessionsLoading ? (
                      <ActivityIndicator size="small" color={theme.primaryDeep} />
                    ) : (
                      <Text style={[styles.drawerHeadRefreshText, { color: theme.primaryDeep }]}>↻</Text>
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>
              <TouchableOpacity
                activeOpacity={0.72}
                style={[styles.drawerIconBtn, { backgroundColor: theme.surfaceStrong }]}
                testID="close-drawer-btn"
                onPress={() => dispatch(setDrawerOpen(false))}
              >
                <Text style={[styles.drawerIconText, { color: theme.textSoft }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.drawerContent}>
              {activeDomain === 'chat' ? (
                <>
                  <View style={styles.searchRow}>
                    <View style={[styles.chatSearchShell, { backgroundColor: theme.surfaceStrong, borderColor: theme.border }]}>
                      <TextInput
                        value={chatKeyword}
                        onChangeText={(text) => dispatch(setChatKeyword(text))}
                        placeholder="搜索"
                        placeholderTextColor={theme.textMute}
                        style={[styles.chatSearchInput, styles.chatSearchInputInner, { color: theme.text }]}
                        nativeID="chat-search-input"
                        testID="chat-search-input"
                      />
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.76}
                      style={styles.drawerRefreshBtn}
                      testID="chat-refresh-btn"
                      onPress={() => {
                        refreshChats().catch(() => {});
                      }}
                    >
                      {loadingChats ? (
                        <ActivityIndicator size="small" color={theme.primaryDeep} />
                      ) : (
                        <Text style={[styles.drawerRefreshText, { color: theme.primaryDeep }]}>刷新</Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  <ScrollView style={styles.chatListWrap} contentContainerStyle={styles.chatListContent}>
                    {filteredChats.length ? (
                      filteredChats.map((chat, index) => {
                        const active = chat.chatId === chatId;
                        const title = getChatTitle(chat) || chat.chatId || '未命名会话';
                        const agentName = getChatAgentName(chat);
                        const chatTime = formatChatListTime(chat);
                        const itemKey = chat.chatId || `${title}:${index}`;

                        return (
                          <TouchableOpacity
                            key={itemKey}
                            activeOpacity={0.74}
                            testID={`chat-list-item-${index}`}
                            style={[styles.chatItem, { backgroundColor: active ? theme.primarySoft : theme.surfaceStrong }]}
                            onPress={() => {
                              if (!chat.chatId) return;
                              dispatch(setChatId(chat.chatId));
                              dispatch(setDrawerOpen(false));
                            }}
                          >
                            <Text style={[styles.chatItemTitle, { color: theme.text }]} numberOfLines={1}>{title}</Text>
                            <View style={styles.chatHistoryMetaRow}>
                              <Text
                                style={[styles.chatHistoryMetaAgent, { color: theme.textMute }]}
                                numberOfLines={1}
                              >
                                {agentName}
                              </Text>
                              <Text style={[styles.chatHistoryMetaTime, { color: theme.textMute }]} numberOfLines={1}>
                                {chatTime}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })
                    ) : (
                      <View style={[styles.emptyHistoryCard, { backgroundColor: theme.surfaceStrong }]}> 
                        <Text style={[styles.emptyHistoryText, { color: theme.textMute }]}>{loadingChats ? '加载中...' : '暂无历史会话'}</Text>
                      </View>
                    )}
                  </ScrollView>
                </>
              ) : null}

              {activeDomain === 'terminal' ? (
                <>
                  <View style={styles.drawerActionRow}>
                    <TouchableOpacity
                      activeOpacity={0.74}
                      style={[styles.drawerActionBtn, { backgroundColor: theme.surfaceStrong }]}
                      testID="terminal-sessions-create-btn"
                      onPress={() => {
                        openTerminalCreateSessionModal();
                      }}
                    >
                      <Text style={[styles.drawerActionText, { color: theme.textSoft }]}>+ 新会话</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView style={styles.chatListWrap} contentContainerStyle={styles.chatListContent}>
                    {terminalSessions.length ? (
                      terminalSessions.map((session, index) => {
                        const active = session.sessionId === activeTerminalSessionId;
                        const title = session.title || session.sessionId;
                        const parts: string[] = [];
                        if (session.sessionType) parts.push(session.sessionType);
                        if (session.toolId) parts.push(session.toolId);
                        parts.push(session.sessionId);
                        const meta = parts.join(' · ');
                        return (
                          <TouchableOpacity
                            key={session.sessionId}
                            activeOpacity={0.74}
                            testID={`terminal-session-item-${index}`}
                            style={[styles.chatItem, { backgroundColor: active ? theme.primarySoft : theme.surfaceStrong }]}
                            onPress={() => {
                              dispatch(setActiveSessionId(session.sessionId));
                              dispatch(reloadPty());
                              dispatch(setDrawerOpen(false));
                            }}
                          >
                            <Text style={[styles.chatItemTitle, { color: theme.text }]} numberOfLines={1}>
                              {title}
                            </Text>
                            <Text style={[styles.chatItemMeta, { color: theme.textMute }]} numberOfLines={1}>
                              {meta}
                            </Text>
                          </TouchableOpacity>
                        );
                      })
                    ) : (
                      <View style={[styles.emptyHistoryCard, { backgroundColor: theme.surfaceStrong, marginTop: 8 }]}>
                        <Text style={[styles.emptyHistoryText, { color: theme.textMute }]}>
                          {terminalSessionsLoading ? '加载中...' : terminalSessionsError ? terminalSessionsError : '暂无终端会话'}
                        </Text>
                      </View>
                    )}
                  </ScrollView>
                </>
              ) : null}

              {activeDomain === 'agents' ? (
                <>
                  <Text style={[styles.drawerSectionTitle, { color: theme.textSoft }]}>智能体列表</Text>
                  <ScrollView style={styles.chatListWrap} contentContainerStyle={styles.chatListContent}>
                    {(agents.length ? agents : [{ key: '', name: '暂无 Agent' }]).map((agent, index) => {
                      const key = getAgentKey(agent);
                      const name = getAgentName(agent) || key || `Agent ${index + 1}`;
                      const selected = key && key === selectedAgentKey;
                      return (
                        <TouchableOpacity
                          key={key || `${name}-${index}`}
                          disabled={!key}
                          activeOpacity={0.78}
                          style={[
                            styles.chatItem,
                            {
                              backgroundColor: selected ? theme.primarySoft : theme.surfaceStrong
                            }
                          ]}
                          onPress={() => {
                            if (!key) return;
                            dispatch(setAgentsSelectedAgentKey(key));
                            dispatch(setUserSelectedAgentKey(key));
                          }}
                        >
                          <Text style={[styles.chatItemTitle, { color: selected ? theme.primaryDeep : theme.text }]} numberOfLines={1}>
                            {name}
                          </Text>
                          <Text style={[styles.chatItemMeta, { color: theme.textMute }]} numberOfLines={1}>
                            {key || '未配置 key'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              ) : null}

              {activeDomain === 'user' ? (
                <View style={styles.nonChatHintWrap}>
                  <Text style={[styles.nonChatHint, { color: theme.textSoft }]}>配置项请在主内容区编辑。</Text>
                </View>
              ) : null}
            </View>

            <View style={[styles.drawerBottom, { borderTopColor: theme.border }]}>
              <View style={styles.profileDomainRow}>
                <View style={[styles.profileAvatar, { backgroundColor: theme.primary }]}>
                  <Text style={styles.profileAvatarText}>{profileInitial}</Text>
                </View>
                <View style={styles.profileMeta}>
                  <Text style={[styles.profileNameText, { color: theme.text }]} numberOfLines={1}>
                    {profileName}
                  </Text>
                  <Text style={[styles.profileDeviceText, { color: theme.textMute }]} numberOfLines={1}>
                    {profileDeviceLabel}
                  </Text>
                </View>
                <DomainSwitcher
                  value={activeDomain}
                  onChange={(mode: DomainMode) => {
                    setAgentMenuOpen(false);
                    setInboxOpen(false);
                    setPublishOpen(false);
                    dispatch(setActiveDomain(mode));
                    dispatch(setDrawerOpen(false));
                  }}
                  theme={theme}
                  compact
                />
              </View>

              <View style={styles.drawerStatusRow}>{agentsLoading ? <ActivityIndicator size="small" color={theme.primary} /> : null}</View>
            </View>
          </Animated.View>
        </View>
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
  mainShell: {
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
  bootText: {
    fontSize: 14
  },
  topNavCompact: {
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
  menuIconSvg: {
    width: 20,
    height: 20
  },
  inboxIconSvg: {
    width: 22,
    height: 22
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
  assistantTopTextWrap: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
    alignItems: 'center',
    maxWidth: '82%'
  },
  assistantTopTitle: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center'
  },
  assistantTopSingleTitle: {
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
  assistantTopArrow: {
    fontSize: 18,
    fontWeight: '600'
  },
  inboxLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10
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
    zIndex: 11
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
  loginVersionText: {
    fontSize: 11,
    textAlign: 'center'
  },
  homeVersionWrap: {
    position: 'absolute',
    right: 12
  },
  homeVersionText: {
    fontSize: 11,
    fontWeight: '500',
    opacity: 0.8
  },
  agentMenuCard: {
    marginHorizontal: 14,
    marginTop: 0,
    marginBottom: 8,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    height: 246,
    overflow: 'hidden'
  },
  agentMenuList: {
    flex: 1
  },
  agentMenuListContent: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 5
  },
  agentMenuItem: {
    borderRadius: 12,
    minHeight: 42,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  agentMenuItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  agentMenuTextWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center'
  },
  agentMenuItemText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center'
  },
  agentMenuItemSubText: {
    marginTop: 2,
    fontSize: 11,
    textAlign: 'center'
  },
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.22)'
  },
  drawerPanel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    paddingHorizontal: 12,
    gap: 10
  },
  drawerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  drawerHeadLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: '600'
  },
  drawerHeadNewChatBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  drawerHeadNewChatText: {
    fontSize: 14,
    fontWeight: '600'
  },
  drawerHeadRefreshBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  drawerHeadRefreshText: {
    fontSize: 14,
    fontWeight: '600'
  },
  drawerIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  drawerIconText: {
    fontSize: 13,
    fontWeight: '600'
  },
  drawerContent: {
    flex: 1
  },
  drawerSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8
  },
  drawerActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10
  },
  drawerActionBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    alignItems: 'center'
  },
  drawerActionBtnStrong: {
    borderWidth: 1,
    minHeight: 40
  },
  drawerActionText: {
    fontSize: 12,
    fontWeight: '600'
  },
  drawerActionTextStrong: {
    fontSize: 13
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10
  },
  chatSearchShell: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center'
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
  chatSearchInputInner: {
    marginBottom: 0
  },
  drawerRefreshBtn: {
    minWidth: 44,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2
  },
  drawerRefreshText: {
    fontSize: 12,
    fontWeight: '600'
  },
  chatListWrap: {
    flex: 1
  },
  chatListContent: {
    paddingBottom: 12,
    gap: 8
  },
  chatItem: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  chatItemTitle: {
    fontSize: 13,
    fontWeight: '600'
  },
  chatItemMeta: {
    marginTop: 4,
    fontSize: 11
  },
  chatHistoryMetaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  chatHistoryMetaAgent: {
    flex: 1,
    minWidth: 0,
    fontSize: 11
  },
  chatHistoryMetaTime: {
    fontSize: 11,
    textAlign: 'right'
  },
  emptyHistoryCard: {
    borderRadius: 10,
    paddingVertical: 22,
    alignItems: 'center'
  },
  emptyHistoryText: {
    fontSize: 12
  },
  nonChatHintWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16
  },
  nonChatHint: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20
  },
  drawerBottom: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8
  },
  profileDomainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40
  },
  profileAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileAvatarText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600'
  },
  profileMeta: {
    flex: 1,
    minWidth: 0
  },
  profileNameText: {
    fontSize: 13,
    fontWeight: '600'
  },
  profileDeviceText: {
    marginTop: 2,
    fontSize: 11
  },
  drawerStatusRow: {
    minHeight: 16,
    alignItems: 'flex-end',
    justifyContent: 'center'
  }
});
