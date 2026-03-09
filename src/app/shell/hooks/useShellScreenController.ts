import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Animated, Easing, Keyboard, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { showToast } from '../../ui/uiSlice';
import { InboxMessage, WebSocketMessage } from '../../../core/types/common';
import { THEMES } from '../../../core/constants/theme';
import {
  normalizeEndpointInput,
  normalizePtyUrlInput,
  toBackendBaseUrl,
  toDefaultPtyWebUrl
} from '../../../core/network/endpoint';
import { patchSettings } from '../../../core/storage/settingsStorage';
import {
  closeChatDetailDrawer,
  resetChatDetailDrawerPreview,
  setChatAgentsSidebarOpen,
  setChatSearchQuery as setShellChatSearchQuery
} from '../shellSlice';
import {
  applyEndpointDraft,
  setEndpointDraft,
  setPtyUrlDraft,
  setSelectedAgentKey as setUserSelectedAgentKey
} from '../../../modules/user/state/userSlice';
import { setAgents, setAgentsError, setAgentsLoading } from '../../../modules/agents/state/agentsSlice';
import { setChatId, setChats, setLoadingChats, setTeams } from '../../../modules/chat/state/chatSlice';
import {
  reloadPty,
  requestOpenNewSessionModal,
  setActiveSessionId
} from '../../../modules/terminal/state/terminalSlice';
import { selectCurrentAgentChats } from '../../../modules/chat/state/chatSelectors';
import { ChatSearchAgentItem } from '../../../modules/chat/components/ChatSearchPane';
import { useLazyGetAgentsQuery } from '../../../modules/agents/api/agentsApi';
import { useLazyGetTeamsQuery } from '../../../modules/chat/api/chatApi';
import { useLazyListTerminalSessionsQuery } from '../../../modules/terminal/api/terminalApi';
import { fetchAuthedJson, formatError, markChatReadApi } from '../../../core/network/apiClient';
import {
  getAgentKey,
  getAgentName,
  getAgentRole,
  getChatAgentKey,
  getChatAgentName,
  getChatTimestamp,
  getChatTitle
} from '../../../shared/utils/format';
import { getAppVersionLabel } from '../../../shared/utils/appVersion';
import { TerminalSessionItem } from '../../../modules/terminal/types/terminal';
import { buildPtyWebUrlWithSessionId } from '../../../modules/terminal/utils/sessionUrl';
import {
  ensureFreshAccessToken,
  getCurrentSession,
  getAccessToken,
  getDefaultDeviceName,
  loginWithMasterPassword,
  logoutCurrentDevice,
  restoreSession,
  subscribeAuthSession
} from '../../../core/auth/appAuth';
import { WebViewAuthRefreshCoordinator, WebViewAuthRefreshOutcome } from '../../../core/auth/webViewAuthBridge';
import { initChatCacheDb, listCachedChats, markChatReadLocal } from '../../../modules/chat/services/chatCacheDb';
import { syncChatsIncremental } from '../../../modules/chat/services/chatSyncService';
import { shouldApplyChatSyncResult } from '../../../modules/chat/state/chatSyncPolicy';

const PREFRESH_MIN_VALIDITY_MS = 120_000;
const PREFRESH_JITTER_MS = 8_000;
const ACTIVE_REFRESH_DEBOUNCE_MS = 20_000;
const FOREGROUND_REFRESH_INTERVAL_MS = 60_000;

export function useShellScreenController() {
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();

  const { chatSearchQuery, chatAgentsSidebarOpen, chatDetailDrawerOpen, chatDetailDrawerPreviewProgress } =
    useAppSelector((state) => state.shell);
  const { booting, themeMode, endpointDraft, endpointInput, ptyUrlInput, selectedAgentKey, activeDomain } =
    useAppSelector((state) => state.user);
  const chatId = useAppSelector((state) => state.chat.chatId);
  const chats = useAppSelector((state) => state.chat.chats);
  const loadingChats = useAppSelector((state) => state.chat.loadingChats);
  const agents = useAppSelector((state) => state.agents.agents);
  const currentAgentChats = useAppSelector(selectCurrentAgentChats);
  const activeTerminalSessionId = useAppSelector((state) => state.terminal.activeSessionId);

  const [inboxOpen, setInboxOpen] = useState(false);
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
  const [terminalCurrentWebViewUrl, setTerminalCurrentWebViewUrl] = useState('');
  const [terminalListResetSignal, setTerminalListResetSignal] = useState(0);
  const [chatPlusMenuOpen, setChatPlusMenuOpen] = useState(false);

  const [triggerAgents] = useLazyGetAgentsQuery();
  const [triggerTeams] = useLazyGetTeamsQuery();
  const [triggerTerminalSessions] = useLazyListTerminalSessionsQuery();

  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRetryRef = useRef(0);
  const wsAccessTokenRef = useRef('');
  const appStateRef = useRef(AppState.currentState);
  const lastActiveRefreshAtRef = useRef(0);
  const authRefreshCoordinatorRef = useRef<WebViewAuthRefreshCoordinator | null>(null);
  const chatSyncInFlightRef = useRef(false);

  const inboxAnim = useRef(new Animated.Value(0)).current;
  const theme = THEMES[themeMode] || THEMES.light;
  const backendUrl = useMemo(() => toBackendBaseUrl(endpointInput), [endpointInput]);
  const ptyWebUrl = useMemo(() => normalizePtyUrlInput(ptyUrlInput, endpointInput), [endpointInput, ptyUrlInput]);
  const normalizedLoginEndpointDraft = useMemo(() => normalizeEndpointInput(endpointDraft), [endpointDraft]);
  const canSubmitLogin = Boolean(normalizedLoginEndpointDraft) && !authChecking;

  const notify = useCallback(
    (message: string, tone: 'neutral' | 'danger' | 'warn' | 'success' = 'neutral') => {
      dispatch(showToast({ message, tone }));
    },
    [dispatch]
  );

  useEffect(() => {
    initChatCacheDb().catch(() => { });
  }, []);

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

  /**
   * 从会话对象同步鉴权状态到组件 state
   * 更新 accessToken、过期时间、用户名、设备名，并触发 authTokenSignal 信号
   */
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

  /**
   * 刷新智能体列表
   * @param base - 后端 URL，默认使用当前 backendUrl
   * @param silent - 是否静默刷新（不显示 loading 状态）
   * 如果当前选中的 agent 不在新列表中，自动切换到第一个 agent
   */
  const refreshAgents = useCallback(
    async (silent = false) => {
      if (!silent) dispatch(setAgentsLoading(true));
      try {
        const list = await triggerAgents().unwrap();
        dispatch(setAgents(list));
        dispatch(setAgentsError(''));

        const current = selectedAgentKey;
        if (current && list.some((agent) => getAgentKey(agent) === current)) {
          return;
        }

        const fallback = getAgentKey(list[0]) || '';
        dispatch(setUserSelectedAgentKey(fallback));
      } catch (error) {
        dispatch(setAgentsError(formatError(error)));
        notify(`Agent 加载失败：${formatError(error)}`, 'danger');
      } finally {
        if (!silent) dispatch(setAgentsLoading(false));
      }
    },
    [dispatch, notify, selectedAgentKey, triggerAgents]
  );

  /**
   * 从本地缓存加载聊天列表
   * 用于快速展示已缓存的聊天数据，在网络同步完成前提供即时反馈
   */
  const loadChatsFromCache = useCallback(async () => {
    const list = await listCachedChats();
    dispatch(setChats(list));
    return list;
  }, [dispatch]);

  /**
   * 立即执行聊天列表增量同步
   * @param base - 后端 URL，默认使用当前 backendUrl
   * @param options - 配置选项
   *   - notifyError: 是否在失败时显示错误提示
   *   - bumpActiveChatRefresh: 如果当前活跃聊天有更新，是否触发刷新信号
   * @returns 返回已更新的 chatId 列表
   * 使用单飞机制防止并发同步
   */
  const syncChatsNow = useCallback(
    async (
      base = backendUrl,
      options?: {
        notifyError?: boolean;
        bumpActiveChatRefresh?: boolean;
      }
    ) => {
      if (!base || chatSyncInFlightRef.current) {
        return [];
      }

      chatSyncInFlightRef.current = true;
      try {
        const result = await syncChatsIncremental(base);

        if (shouldApplyChatSyncResult(result.updatedChatIds)) {
          dispatch(setChats(result.chats));
        }

        if (options?.bumpActiveChatRefresh) {
          const activeChatId = String(chatId || '').trim();
          if (activeChatId && result.updatedChatIds.some((item) => item === activeChatId)) {
            setChatRefreshSignal((prev) => prev + 1);
          }
        }

        return result.updatedChatIds;
      } catch (error) {
        if (options?.notifyError) {
          notify(`会话增量同步失败：${formatError(error)}`, 'danger');
        }
        return [];
      } finally {
        chatSyncInFlightRef.current = false;
      }
    },
    [backendUrl, chatId, notify]
  );

  /**
   * 刷新聊天列表（先从缓存加载，再增量同步）
   * @param silent - 是否静默刷新（不显示 loading 状态）
   * @param base - 后端 URL，默认使用当前 backendUrl
   */
  const refreshChats = useCallback(
    async (silent = false, base = backendUrl) => {
      if (!silent) dispatch(setLoadingChats(true));
      try {
        await loadChatsFromCache();
        const refreshTeams = async () => {
          if (!base) {
            dispatch(setTeams([]));
            return;
          }
          try {
            const list = await triggerTeams().unwrap();
            dispatch(setTeams(Array.isArray(list) ? list : []));
          } catch {
            dispatch(setTeams([]));
          }
        };

        await Promise.all([
          syncChatsNow(base, {
            notifyError: !silent,
            bumpActiveChatRefresh: true
          }),
          refreshTeams()
        ]);
      } catch (error) {
        notify(`会话列表加载失败：${formatError(error)}`, 'danger');
      } finally {
        if (!silent) dispatch(setLoadingChats(false));
      }
    },
    [backendUrl, dispatch, loadChatsFromCache, notify, syncChatsNow, triggerTeams]
  );

  /**
   * 刷新终端会话列表
   * @param silent - 是否静默刷新（不显示 loading 状态）
   * 如果当前活跃的会话不在新列表中，自动清空选中状态并返回列表视图
   */
  const refreshTerminalSessions = useCallback(
    async (silent = false) => {
      if (!silent) {
        setTerminalSessionsLoading(true);
      }
      try {
        const sessions = await triggerTerminalSessions({
          ptyWebUrl
        }).unwrap();
        setTerminalSessions(Array.isArray(sessions) ? sessions : []);
        setTerminalSessionsError('');
        if (activeTerminalSessionId && !sessions.some((item) => item.sessionId === activeTerminalSessionId)) {
          dispatch(setActiveSessionId(''));
          setTerminalListResetSignal((prev) => prev + 1);
        }
      } catch (error) {
        const message = formatError(error);
        setTerminalSessionsError(message);
        notify(`终端会话加载失败：${message}`, 'danger');
      } finally {
        if (!silent) {
          setTerminalSessionsLoading(false);
        }
      }
    },
    [activeTerminalSessionId, dispatch, notify, ptyWebUrl, triggerTerminalSessions]
  );

  /**
   * 打开终端新建会话模态框
   * 触发 Redux 动作请求打开模态框，重载 PTY，并切换到终端详情面板
   */
  const openTerminalCreateSessionModal = useCallback(() => {
    dispatch(requestOpenNewSessionModal(Date.now()));
    dispatch(reloadPty());
  }, [dispatch]);

  /**
   * 刷新所有数据（智能体列表 + 聊天列表）
   * @param silent - 是否静默刷新（不显示 loading 状态）
   * @param base - 后端 URL，默认使用当前 backendUrl
   */
  const refreshAll = useCallback(
    async (silent = false, base = backendUrl) => {
      void base;
      await Promise.all([refreshAgents(silent), refreshChats(silent)]);
    },
    [backendUrl, refreshAgents, refreshChats]
  );

  /**
   * 刷新收件箱消息和未读数
   * @param silent - 是否静默刷新（不显示 loading 状态）
   * @param base - 后端 URL，默认使用当前 backendUrl
   */
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
        notify(`消息盒子加载失败：${formatError(error)}`, 'danger');
      } finally {
        if (!silent) {
          setInboxLoading(false);
        }
      }
    },
    [backendUrl, notify]
  );

  /**
   * 标记单条收件箱消息为已读
   * @param messageId - 消息 ID
   * 标记成功后刷新收件箱数据
   */
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
        notify(`消息已读失败：${formatError(error)}`, 'danger');
      }
    },
    [backendUrl, notify, refreshInbox]
  );

  /**
   * 标记所有收件箱消息为已读
   */
  const markAllInboxRead = useCallback(async () => {
    try {
      await fetchAuthedJson<unknown>(backendUrl, '/api/app/inbox/read-all', {
        method: 'POST'
      });
      await refreshInbox(true);
    } catch (error) {
      notify(`全部已读失败：${formatError(error)}`, 'danger');
    }
  }, [backendUrl, notify, refreshInbox]);

  /**
   * 标记聊天为已查看
   * @param viewedChatIdInput - 聊天 ID
   * 先更新本地缓存，再调用后端 API 持久化
   * 本地缓存失败会被忽略，后端失败仅在 DEV 模式下打印警告
   */
  const markChatViewed = useCallback(
    async (viewedChatIdInput: string) => {
      const viewedChatId = String(viewedChatIdInput || '').trim();
      if (!viewedChatId) {
        return;
      }

      try {
        await markChatReadLocal(viewedChatId, {
          readStatus: 1,
          readAt: Date.now()
        });
        await loadChatsFromCache();
      } catch {
        // ignore local cache write failures
      }

      if (!backendUrl) {
        return;
      }

      try {
        const result = await markChatReadApi(backendUrl, viewedChatId);
        await markChatReadLocal(viewedChatId, {
          readStatus: Number(result?.readStatus),
          readAt: result?.readAt
        });
        await loadChatsFromCache();
      } catch (error) {
        if (__DEV__) {
          console.warn(`[chat.read] failed: ${viewedChatId}`, error);
        }
      }
    },
    [backendUrl, loadChatsFromCache]
  );

  /**
   * 清理 WebSocket 连接
   * 清除重连定时器，移除所有事件监听器，关闭连接，清空 token 缓存
   */
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

  /**
   * 处理 WebSocket 推送消息
   * @param raw - 原始 WebSocket 消息字符串（JSON 格式）
   * 支持三种消息类型：
   *   - inbox.new: 新收件箱消息
   *   - inbox.sync: 同步未读数
   *   - chat.new_content: 聊天有新内容
   */
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
          refreshInbox(true).catch(() => { });
        }
        return;
      }

      if (type === 'inbox.sync') {
        if (typeof payload.unreadCount === 'number') {
          setInboxUnreadCount(payload.unreadCount);
        } else {
          refreshInbox(true).catch(() => { });
        }
        return;
      }

      if (type === 'chat.new_content') {
        syncChatsNow(backendUrl, {
          notifyError: false,
          bumpActiveChatRefresh: true
        }).catch(() => { });
      }
    },
    [backendUrl, refreshInbox, syncChatsNow]
  );

  /**
   * 处理鉴权硬失败（登出、token 失效等）
   * @param statusMessage - 显示给用户的状态消息
   * 清理 WebSocket、重置鉴权状态、清空消息盒子
   */
  const handleHardAuthFailure = useCallback(
    (statusMessage = '登录状态失效，请重新登录') => {
      clearWs();
      setAuthReady(false);
      setInboxMessages([]);
      setInboxUnreadCount(0);
      setAuthError(statusMessage);
      setMasterPassword('');
      syncAuthStateFromSession(null);
      notify(statusMessage, 'warn');
    },
    [clearWs, notify, syncAuthStateFromSession]
  );

  /**
   * 用户登出
   * 调用后端登出 API（失败会被忽略），然后执行硬失败流程
   */
  const handleLogout = useCallback(async () => {
    try {
      await logoutCurrentDevice(backendUrl);
    } catch {
      // ignore logout API errors
    }
    handleHardAuthFailure('已登出');
  }, [backendUrl, handleHardAuthFailure]);

  /**
   * 前台保活：主动预刷新 token
   * 仅在鉴权就绪时执行
   * 使用 120s 最小有效期 + 8s 抖动，软失败模式（不抛错）
   * 刷新成功后同步鉴权状态
   */
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

  /**
   * WebView 鉴权刷新：强制刷新 token（硬刷新）
   * 用于 WebView 内 401 触发的刷新请求
   * 刷新成功后同步鉴权状态
   */
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

  /**
   * 处理 WebView 发起的鉴权刷新请求
   * 委托给 WebViewAuthRefreshCoordinator 统一处理（单飞机制）
   * @param _requestId - 请求 ID（未使用）
   * @param _source - 来源标识（未使用）
   * @returns 刷新结果（成功/失败 + token/错误信息）
   */
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

  /**
   * 连接 WebSocket 推送服务
   * 1. 清理旧连接
   * 2. 获取 access token（失败则触发硬失败）
   * 3. 建立 WebSocket 连接（wss:// 或 ws://，token 通过 query 参数传递）
   * 4. 注册事件监听器：
   *    - onopen: 重置重试计数
   *    - onmessage: 处理推送消息
   *    - onclose: 指数退避重连（最多 64s 延迟）
   * 5. 监听 token 更新，自动重连
   */
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
      const delayMs = Math.min(30_000, 1000 * 2 ** retryCount);
      wsRetryRef.current += 1;
      wsReconnectTimerRef.current = setTimeout(() => {
        connectWs().catch(() => { });
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
          connectWs().catch(() => { });
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
        runForegroundProactiveRefresh().catch(() => { });
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
      runForegroundProactiveRefresh().catch(() => { });
    }, FOREGROUND_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(timer);
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
      syncChatsNow(backendUrl, {
        notifyError: false,
        bumpActiveChatRefresh: true
      }).catch(() => { });
    }, 5000);

    return () => {
      clearInterval(timer);
    };
  }, [authReady, backendUrl, booting, syncChatsNow]);

  /**
   * 提交登录表单
   * 1. 验证端点和密码输入
   * 2. 更新端点和 PTY URL 配置到 Redux
   * 3. 调用登录 API
   * 4. 登录成功后：
   *    - 清空密码输入
   *    - 标记鉴权就绪
   *    - 同步鉴权状态
   *    - 刷新所有数据和收件箱
   * 5. 登录失败则重置鉴权状态
   */
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
  }, [deviceName, dispatch, endpointDraft, masterPassword, refreshAll, refreshInbox, syncAuthStateFromSession]);

  useEffect(() => {
    Animated.timing(inboxAnim, {
      toValue: inboxOpen ? 1 : 0,
      duration: inboxOpen ? 240 : 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [inboxAnim, inboxOpen]);

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

    runForegroundProactiveRefresh().catch(() => { });
    refreshAll(true).catch(() => { });
    refreshInbox(true).catch(() => { });
    connectWs().catch(() => { });

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
    }).catch(() => { });
  }, [activeDomain, booting, endpointInput, ptyUrlInput, selectedAgentKey, themeMode]);

  useEffect(() => {
    if (activeDomain !== 'chat' && activeDomain !== 'user') {
      setInboxOpen(false);
    }
  }, [activeDomain]);

  useEffect(() => {
    if (!inboxOpen || !authReady) {
      return;
    }
    refreshInbox(true).catch(() => { });
  }, [authReady, inboxOpen, refreshInbox]);

  useEffect(() => {
    if (!authReady) {
      setTerminalSessions([]);
      setTerminalSessionsLoading(false);
      setTerminalSessionsError('');
      setTerminalCurrentWebViewUrl('');
      dispatch(setActiveSessionId(''));
      setTerminalListResetSignal((prev) => prev + 1);
    }
  }, [authReady, dispatch]);

  useEffect(() => {
    if (booting || !authReady || activeDomain !== 'terminal') {
      return;
    }
    refreshTerminalSessions(true).catch(() => { });
  }, [activeDomain, authReady, booting, refreshTerminalSessions]);

  const activeAgent = useMemo(() => {
    const found = agents.find((agent) => getAgentKey(agent) === selectedAgentKey);
    return found || agents[0] || null;
  }, [agents, selectedAgentKey]);
  const activeAgentName = useMemo(() => getAgentName(activeAgent) || 'Agent', [activeAgent]);
  const activeAgentRole = useMemo(() => getAgentRole(activeAgent), [activeAgent]);
  const normalizedSearchKeyword = String(chatSearchQuery || '')
    .trim()
    .toLowerCase();

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
        const haystack = `${chat.chatName || ''} ${chat.title || ''} ${chat.chatId || ''} ${getChatAgentName(
          chat
        )} ${getChatAgentKey(chat)}`.toLowerCase();
        return haystack.includes(normalizedSearchKeyword);
      })
      .sort((a, b) => getChatTimestamp(b) - getChatTimestamp(a));
  }, [chats, normalizedSearchKeyword]);

  const appVersionLabel = useMemo(() => getAppVersionLabel(), []);

  /**
   * 关闭所有浮层面板
   * 包括：收件箱、聊天加号菜单、智能体侧边栏、聊天详情抽屉
   */
  const closeFloatingPanels = useCallback(() => {
    setInboxOpen(false);
    setChatPlusMenuOpen(false);
    dispatch(setChatAgentsSidebarOpen(false));
    dispatch(closeChatDetailDrawer());
    dispatch(resetChatDetailDrawerPreview());
  }, [dispatch]);

  /**
   * 打开智能体详情页
   * @param agentKey - 智能体 key
   *
   * 操作流程：
   * 1. 收起键盘
   * 2. 验证 agentKey
   * 3. 更新选中的智能体
   * 4. 关闭侧边栏和抽屉
   * 5. 推入智能体详情覆盖层
   */
  const openAgentProfile = useCallback(
    (agentKey: string) => {
      Keyboard.dismiss();
      const normalizedKey = String(agentKey || '').trim();
      if (!normalizedKey) {
        notify('智能体信息不可用', 'warn');
        return;
      }
      dispatch(setUserSelectedAgentKey(normalizedKey));
      dispatch(setChatAgentsSidebarOpen(false));
      dispatch(closeChatDetailDrawer());
      dispatch(resetChatDetailDrawerPreview());
    },
    [dispatch, notify]
  );

  /**
   * 切换到上一条/下一条当前智能体的对话（手势滑动调用）
   * @param direction - 方向：'prev' 上一条 / 'next' 下一条
   * @returns 切换结果 { ok: boolean, message?: string }
   *
   * 根据当前 chatId 在 currentAgentChats 中查找位置
   * prev: 索引 +1（时间倒序，越新的索引越小）
   * next: 索引 -1
   */
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

  /**
   * 打开终端详情页
   * @param sessionId - 终端会话 ID
   * 构建 PTY WebView URL，设置活跃会话 ID，重载 PTY，切换到详情面板
   */
  const openTerminalDetail = useCallback(
    (sessionId: string) => {
      const baseUrl = buildPtyWebUrlWithSessionId(ptyWebUrl, sessionId);
      setTerminalCurrentWebViewUrl(baseUrl);
      dispatch(setActiveSessionId(sessionId));
      dispatch(reloadPty());
    },
    [dispatch, ptyWebUrl]
  );

  /**
   * 处理终端 WebView URL 变化
   * @param url - 新的 URL
   * 更新终端 WebView 当前显示的 URL
   */
  const handleTerminalWebViewUrlChange = useCallback((url: string) => {
    const next = String(url || '').trim();
    if (!next) {
      return;
    }
    setTerminalCurrentWebViewUrl(next);
  }, []);

  return {
    dispatch,
    insets,
    window,
    theme,
    booting,
    authChecking,
    authReady,
    authError,
    endpointDraft,
    deviceName,
    masterPassword,
    canSubmitLogin,
    appVersionLabel,
    keyboardInset,
    inboxOpen,
    chatPlusMenuOpen,
    chatSearchQuery,
    chatAgentsSidebarOpen,
    chatDetailDrawerOpen,
    chatDetailDrawerPreviewProgress,
    inboxMessages,
    inboxUnreadCount,
    inboxLoading,
    loadingChats,
    searchAgentResults,
    searchChatResults,
    terminalSessions,
    terminalSessionsLoading,
    terminalSessionsError,
    terminalCurrentWebViewUrl,
    activeTerminalSessionId,
    activeDomain,
    selectedAgentKey,
    authAccessToken,
    authAccessExpireAtMs,
    authTokenSignal,
    authUsername,
    authDeviceName,
    currentAgentChats,
    chatId,
    agents,
    activeAgent,
    activeAgentName,
    activeAgentRole,
    backendUrl,
    chatRefreshSignal,
    inboxAnim,
    terminalListResetSignal,
    setDeviceName,
    setMasterPassword,
    setInboxOpen,
    setChatPlusMenuOpen,
    setAuthError,
    setChatSearchQuery: (value: string) => dispatch(setShellChatSearchQuery(value)),
    setEndpointDraftText: (value: string) => dispatch(setEndpointDraft(value)),
    submitLogin,
    refreshTerminalSessions,
    openTerminalCreateSessionModal,
    openTerminalDetail,
    handleTerminalWebViewUrlChange,
    closeFloatingPanels,
    openAgentProfile,
    handleRequestSwitchAgentChat,
    handleWebViewAuthRefreshRequest,
    markChatViewed,
    refreshChats,
    refreshAll,
    handleLogout,
    markAllInboxRead,
    markInboxRead
  };
}

export type ShellScreenController = ReturnType<typeof useShellScreenController>;
