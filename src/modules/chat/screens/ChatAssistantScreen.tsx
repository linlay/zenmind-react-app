// @ts-nocheck
import * as Clipboard from 'expo-clipboard';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import { fetchViewportHtml, formatError } from '../../../core/network/apiClient';
import { AppTheme } from '../../../core/constants/theme';
import { createRequestId, getAgentKey } from '../../../shared/utils/format';
import { createFireworksShow } from '../../../shared/animations/fireworks';
import { setChatId, setStatusText } from '../state/chatSlice';
import { toggleTheme, setThemeMode } from '../../../modules/user/state/userSlice';
import {
  useLazyGetChatQuery,
  useSubmitFrontendToolMutation
} from '../api/chatApi';
import { consumeJsonSseXhr } from '../services/chatStreamClient';
import {
  getPlanProgress,
  isStreamActivityType,
  normalizeEventType,
  parseStructuredArgs
} from '../services/eventNormalizer';
import { buildCollapsedPlanText, cleanPlanTaskDescription } from '../utils/planUi';
import {
  ChatEvent,
  ChatState,
  FrontendToolState,
  TimelineEntry
} from '../types/chat';
import {
  ChatEffect,
  createEmptyChatState,
  createRuntimeMaps,
  reduceChatEvent
} from '../services/eventReducer';
import { TimelineEntryRow } from '../components/TimelineEntryRow';
import { Composer } from '../components/Composer';

const REASONING_COLLAPSE_MS = 1500;
const STREAM_IDLE_MS = 2500;
const PLAN_COLLAPSE_MS = 1500;
const AUTO_SCROLL_THRESHOLD = 36;

interface ChatAssistantScreenProps {
  theme: AppTheme;
  backendUrl: string;
  contentWidth: number;
  onRefreshChats: (silent?: boolean) => Promise<void>;
  keyboardHeight: number;
}

export function ChatAssistantScreen({ theme, backendUrl, contentWidth, onRefreshChats, keyboardHeight }: ChatAssistantScreenProps) {
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();

  const chatId = useAppSelector((state) => state.chat.chatId);
  const selectedAgentKey = useAppSelector((state) => state.agents.selectedAgentKey);
  const agents = useAppSelector((state) => state.agents.agents);
  const statusText = useAppSelector((state) => state.chat.statusText);

  const [chatState, setChatState] = useState<ChatState>(createEmptyChatState());
  const [composerText, setComposerText] = useState('');
  const [copyToast, setCopyToast] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [planExpanded, setPlanExpanded] = useState(false);

  const [fireworksVisible, setFireworksVisible] = useState(false);
  const [fireworkRockets, setFireworkRockets] = useState<Array<Record<string, unknown>>>([]);
  const [fireworkSparks, setFireworkSparks] = useState<Array<Record<string, unknown>>>([]);

  const [loadChat, loadChatState] = useLazyGetChatQuery();
  const [submitFrontendTool] = useSubmitFrontendToolMutation();

  const runtimeRef = useRef(createRuntimeMaps());
  const chatStateRef = useRef(chatState);
  const activeFrontendToolRef = useRef<FrontendToolState | null>(null);
  const listRef = useRef<FlatList<TimelineEntry>>(null);
  const frontendToolWebViewRef = useRef<WebView>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const streamIdleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const streamLastEventAtRef = useRef(0);
  const autoScrollEnabledRef = useRef(true);
  const skipNextHistoryLoadRef = useRef(false);
  const planCollapseTimerRef = useRef<NodeJS.Timeout | null>(null);

  const reasoningTimerRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const copyToastTimer = useRef<NodeJS.Timeout | null>(null);
  const fireworksTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fireworksAnim = useRef(new Animated.Value(0)).current;

  const setChatStateSafe = useCallback((updater: (prev: ChatState) => ChatState) => {
    setChatState((prev) => {
      const next = updater(prev);
      chatStateRef.current = next;
      activeFrontendToolRef.current = next.activeFrontendTool;
      return next;
    });
  }, []);

  const setAutoScrollMode = useCallback((enabled: boolean) => {
    autoScrollEnabledRef.current = enabled;
    setAutoScrollEnabled((prev) => (prev === enabled ? prev : enabled));
  }, []);

  const scrollToBottom = useCallback((animated = true) => {
    listRef.current?.scrollToEnd({ animated });
    setAutoScrollMode(true);
  }, [setAutoScrollMode]);

  const armPlanCollapseTimer = useCallback(() => {
    setPlanExpanded(true);
    if (planCollapseTimerRef.current) {
      clearTimeout(planCollapseTimerRef.current);
    }
    planCollapseTimerRef.current = setTimeout(() => {
      setPlanExpanded(false);
      planCollapseTimerRef.current = null;
    }, PLAN_COLLAPSE_MS);
  }, []);

  const clearStreamIdleTimer = useCallback(() => {
    if (streamIdleTimerRef.current) {
      clearTimeout(streamIdleTimerRef.current);
      streamIdleTimerRef.current = null;
    }
  }, []);

  const armStreamIdleTimer = useCallback(() => {
    clearStreamIdleTimer();
    streamIdleTimerRef.current = setTimeout(() => {
      streamIdleTimerRef.current = null;
      if (!abortControllerRef.current) {
        return;
      }
      const idleMs = Date.now() - streamLastEventAtRef.current;
      if (idleMs >= STREAM_IDLE_MS) {
        setChatStateSafe((prev) => ({ ...prev, streaming: false }));
      }
    }, STREAM_IDLE_MS + 40);
  }, [clearStreamIdleTimer, setChatStateSafe]);

  const markStreamAlive = useCallback(() => {
    streamLastEventAtRef.current = Date.now();
    setChatStateSafe((prev) => ({ ...prev, streaming: true }));
    armStreamIdleTimer();
  }, [armStreamIdleTimer, setChatStateSafe]);

  const clearReasoningTimers = useCallback(() => {
    reasoningTimerRef.current.forEach((timer) => clearTimeout(timer));
    reasoningTimerRef.current.clear();
  }, []);

  const scheduleReasoningCollapse = useCallback(
    (itemId: string) => {
      const old = reasoningTimerRef.current.get(itemId);
      if (old) clearTimeout(old);

      const timer = setTimeout(() => {
        setChatStateSafe((prev) => ({
          ...prev,
          timeline: prev.timeline.map((entry) =>
            entry.id === itemId && entry.kind === 'reasoning' ? { ...entry, collapsed: true } : entry
          )
        }));
        reasoningTimerRef.current.delete(itemId);
      }, REASONING_COLLAPSE_MS);

      reasoningTimerRef.current.set(itemId, timer);
    },
    [setChatStateSafe]
  );

  const launchFireworks = useCallback(
    (rawArgs?: unknown) => {
      const show = createFireworksShow(contentWidth, 760, rawArgs);

      if (fireworksTimerRef.current) {
        clearTimeout(fireworksTimerRef.current);
        fireworksTimerRef.current = null;
      }

      setFireworkRockets(show.rockets as Array<Record<string, unknown>>);
      setFireworkSparks(show.sparks as Array<Record<string, unknown>>);
      setFireworksVisible(true);

      fireworksAnim.stopAnimation();
      fireworksAnim.setValue(0);
      Animated.timing(fireworksAnim, {
        toValue: 1,
        duration: show.durationMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }).start(({ finished }) => {
        if (finished) {
          setFireworksVisible(false);
          setFireworkRockets([]);
          setFireworkSparks([]);
        }
      });

      fireworksTimerRef.current = setTimeout(() => {
        setFireworksVisible(false);
        setFireworkRockets([]);
        setFireworkSparks([]);
        fireworksTimerRef.current = null;
      }, show.durationMs + 120);
    },
    [contentWidth, fireworksAnim]
  );

  const executeAction = useCallback(
    async (actionName: string, args?: Record<string, unknown>) => {
      const name = String(actionName || '').trim().toLowerCase();
      if (!name) return;

      if (name === 'switch_theme') {
        const nextTheme = String(args?.theme || '').trim().toLowerCase();
        if (nextTheme === 'light' || nextTheme === 'dark') {
          dispatch(setThemeMode(nextTheme as 'light' | 'dark'));
        } else {
          dispatch(toggleTheme());
        }
        return;
      }

      if (name === 'launch_fireworks') {
        launchFireworks(args);
        return;
      }

      if (name === 'show_modal') {
        setChatStateSafe((prev) => ({
          ...prev,
          actionModal: {
            visible: true,
            title: String(args?.title || '提示'),
            content: String(args?.content || ''),
            closeText: String(args?.closeText || '关闭')
          }
        }));
      }
    },
    [dispatch, launchFireworks, setChatStateSafe]
  );

  const activateFrontendToolFromEffect = useCallback(
    async (payload: Record<string, unknown> | undefined) => {
      if (!payload) return;

      const toolId = String(payload.toolId || '');
      const toolKey = String(payload.toolKey || '');
      const toolType = String(payload.toolType || '').toLowerCase();
      if (!toolId || !toolKey || !toolType) {
        return;
      }

      setChatStateSafe((prev) => ({
        ...prev,
        activeFrontendTool: {
          runId: String(payload.runId || ''),
          toolId,
          toolKey,
          toolType,
          toolName: String(payload.toolName || toolKey),
          toolTimeout: (payload.toolTimeout as number | null | undefined) ?? null,
          toolParams: (payload.toolParams as Record<string, unknown> | undefined) || null,
          viewportHtml: null,
          loading: true,
          loadError: ''
        }
      }));

      try {
        const html = await fetchViewportHtml(backendUrl, toolKey);
        const current = activeFrontendToolRef.current;
        if (!current || current.toolId !== toolId) return;

        setChatStateSafe((prev) =>
          prev.activeFrontendTool && prev.activeFrontendTool.toolId === toolId
            ? {
                ...prev,
                activeFrontendTool: {
                  ...prev.activeFrontendTool,
                  viewportHtml: html,
                  loading: false
                }
              }
            : prev
        );
      } catch (error) {
        const current = activeFrontendToolRef.current;
        if (!current || current.toolId !== toolId) return;

        setChatStateSafe((prev) =>
          prev.activeFrontendTool && prev.activeFrontendTool.toolId === toolId
            ? {
                ...prev,
                activeFrontendTool: {
                  ...prev.activeFrontendTool,
                  loading: false,
                  loadError: (error as Error)?.message || 'Failed to load viewport'
                }
              }
            : prev
        );
      }
    },
    [backendUrl, setChatStateSafe]
  );

  const handleEffects = useCallback(
    (effects: ChatEffect[], source: 'live' | 'history') => {
      effects.forEach((effect) => {
        if (effect.type === 'set_chat_id') {
          const nextChatId = String(effect.payload?.chatId || '');
          if (nextChatId) {
            if (source === 'live') {
              skipNextHistoryLoadRef.current = true;
            }
            dispatch(setChatId(nextChatId));
          }
          return;
        }

        if (effect.type === 'execute_action') {
          executeAction(String(effect.payload?.actionName || ''), effect.payload?.args as Record<string, unknown> | undefined).catch(() => {});
          return;
        }

        if (effect.type === 'stream_end') {
          clearStreamIdleTimer();
          return;
        }

        if (effect.type === 'activate_frontend_tool') {
          activateFrontendToolFromEffect(effect.payload).catch(() => {});
        }
      });
    },
    [activateFrontendToolFromEffect, clearStreamIdleTimer, dispatch, executeAction]
  );

  const applyEvent = useCallback(
    (event: ChatEvent, source: 'live' | 'history') => {
      const type = normalizeEventType((event as Record<string, unknown>)?.type);
      if (source === 'live' && isStreamActivityType(type)) {
        markStreamAlive();
      }
      if (source === 'live' && type === 'plan.update') {
        armPlanCollapseTimer();
      }

      const { next, effects } = reduceChatEvent(chatStateRef.current, event, source, runtimeRef.current);
      setChatStateSafe(() => next);
      handleEffects(effects, source);

      if (type === 'reasoning.end') {
        const reasoningId = String(
          (event as Record<string, unknown>).reasoningId ||
          (event as Record<string, unknown>).runId ||
          (event as Record<string, unknown>).contentId || ''
        );
        if (reasoningId) {
          const itemId = runtimeRef.current.reasoningIdMap.get(reasoningId);
          if (itemId) scheduleReasoningCollapse(itemId);
        }
      }
    },
    [armPlanCollapseTimer, handleEffects, markStreamAlive, scheduleReasoningCollapse, setChatStateSafe]
  );

  const resetTimeline = useCallback(() => {
    runtimeRef.current = createRuntimeMaps();
    setChatStateSafe(() => createEmptyChatState());
    clearReasoningTimers();
    setPlanExpanded(false);
    if (planCollapseTimerRef.current) {
      clearTimeout(planCollapseTimerRef.current);
      planCollapseTimerRef.current = null;
    }
    setAutoScrollMode(true);

    if (fireworksTimerRef.current) {
      clearTimeout(fireworksTimerRef.current);
      fireworksTimerRef.current = null;
    }
    setFireworksVisible(false);
    setFireworkRockets([]);
    setFireworkSparks([]);
  }, [clearReasoningTimers, setAutoScrollMode, setChatStateSafe]);

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    clearStreamIdleTimer();
    streamLastEventAtRef.current = 0;
    setChatStateSafe((prev) => ({ ...prev, streaming: false }));
  }, [clearStreamIdleTimer, setChatStateSafe]);

  const sendMessage = useCallback(async () => {
    if (activeFrontendToolRef.current) {
      dispatch(setStatusText('请先完成当前前端工具操作'));
      return;
    }

    const message = String(composerText || '').trim();
    if (!message) return;

    if (chatStateRef.current.streaming) {
      dispatch(setStatusText('已有进行中的回答，请先停止'));
      return;
    }

    const agentKey = selectedAgentKey || getAgentKey(agents[0]);
    if (!agentKey) {
      dispatch(setStatusText('请先选择 Agent'));
      return;
    }

    const requestId = createRequestId('mobile');
    setComposerText('');
    setAutoScrollMode(true);

    applyEvent(
      {
        type: 'request.query',
        requestId,
        message,
        timestamp: Date.now(),
        chatId
      },
      'live'
    );

    const controller = new AbortController();
    abortControllerRef.current = controller;
    markStreamAlive();

    try {
      await consumeJsonSseXhr(
        `${backendUrl}/api/query`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId,
            chatId: chatId || undefined,
            message,
            agentKey,
            role: 'user',
            stream: true
          })
        },
        (event) => applyEvent(event, 'live'),
        controller.signal
      );

      await onRefreshChats(true);
    } catch (error) {
      if (!controller.signal.aborted) {
        setChatStateSafe((prev) => ({
          ...prev,
          timeline: [
            ...prev.timeline,
            {
              id: `system:${Date.now()}`,
              kind: 'message',
              role: 'system',
              text: formatError(error),
              ts: Date.now()
            }
          ]
        }));
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      clearStreamIdleTimer();
      setChatStateSafe((prev) => ({ ...prev, streaming: false }));
    }
  }, [
    agents,
    applyEvent,
    backendUrl,
    chatId,
    clearStreamIdleTimer,
    composerText,
    dispatch,
    markStreamAlive,
    onRefreshChats,
    selectedAgentKey,
    setAutoScrollMode,
    setChatStateSafe
  ]);

  const submitActiveFrontendTool = useCallback(
    async (params: Record<string, unknown>) => {
      const active = activeFrontendToolRef.current;
      if (!active) {
        dispatch(setStatusText('当前没有等待提交的前端工具'));
        return;
      }

      try {
        const data = await submitFrontendTool({
          baseUrl: backendUrl,
          runId: active.runId,
          toolId: active.toolId,
          params: params && typeof params === 'object' ? params : {}
        }).unwrap();

        if (data?.accepted) {
          setChatStateSafe((prev) => ({ ...prev, activeFrontendTool: null }));
        } else {
          const detail = String(data?.detail || data?.status || 'unmatched');
          dispatch(setStatusText(`提交未被接受：${detail}`));
        }
      } catch (error) {
        dispatch(setStatusText(`提交失败：${(error as Error)?.message || 'unknown error'}`));
      }
    },
    [backendUrl, dispatch, setChatStateSafe, submitFrontendTool]
  );

  const handleFrontendToolMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const data = typeof event.nativeEvent.data === 'string'
          ? JSON.parse(event.nativeEvent.data)
          : event.nativeEvent.data;

        if (!data || typeof data !== 'object') {
          return;
        }

        if ((data as Record<string, unknown>).type === 'agw_frontend_submit') {
          const params =
            (data as Record<string, unknown>).params && typeof (data as Record<string, unknown>).params === 'object'
              ? ((data as Record<string, unknown>).params as Record<string, unknown>)
              : {};
          submitActiveFrontendTool(params).catch(() => {});
        }
      } catch {
        // Ignore parse errors.
      }
    },
    [submitActiveFrontendTool]
  );

  const handleFrontendToolWebViewLoad = useCallback(() => {
    const active = activeFrontendToolRef.current;
    if (!active || !frontendToolWebViewRef.current) return;

    const initPayload = {
      type: 'agw_tool_init',
      data: {
        runId: active.runId,
        toolId: active.toolId,
        toolKey: active.toolKey,
        toolType: active.toolType,
        toolTimeout: active.toolTimeout,
        params: active.toolParams && typeof active.toolParams === 'object' ? active.toolParams : {}
      }
    };
    const initScript = `
      try {
        window.postMessage(${JSON.stringify(initPayload)}, '*');
      } catch(e) {}
      true;
    `;
    frontendToolWebViewRef.current.injectJavaScript(initScript);
  }, []);

  const handleToggleToolExpanded = useCallback((id: string) => {
    setChatStateSafe((prev) => ({
      ...prev,
      expandedTools: {
        ...prev.expandedTools,
        [id]: !prev.expandedTools[id]
      }
    }));
  }, [setChatStateSafe]);

  const handleToggleReasoning = useCallback((id: string) => {
    setChatStateSafe((prev) => ({
      ...prev,
      timeline: prev.timeline.map((entry) =>
        entry.id === id && entry.kind === 'reasoning' ? { ...entry, collapsed: !entry.collapsed } : entry
      )
    }));
  }, [setChatStateSafe]);

  const handleCopyText = useCallback(async (text: string) => {
    if (!text) return;
    try {
      await Clipboard.setStringAsync(String(text));
      if (copyToastTimer.current) clearTimeout(copyToastTimer.current);
      setCopyToast(true);
      copyToastTimer.current = setTimeout(() => setCopyToast(false), 1200);
    } catch {
      // noop
    }
  }, []);

  const tailSignature = useMemo(() => {
    const timeline = chatState.timeline;
    if (!timeline.length) return 'empty';
    const last = timeline[timeline.length - 1] as Record<string, unknown>;
    const body = `${String(last.text || '')}${String(last.argsText || '')}${String(last.resultText || '')}${String(last.state || '')}${String(last.collapsed || '')}`;
    return `${String(last.id)}:${body.length}`;
  }, [chatState.timeline]);

  const planProgress = useMemo(() => getPlanProgress(chatState.planState.tasks), [chatState.planState.tasks]);
  const cleanedPlanTasks = useMemo(
    () =>
      chatState.planState.tasks.map((task) => ({
        ...task,
        cleanedDescription: cleanPlanTaskDescription(task) || '未命名任务'
      })),
    [chatState.planState.tasks]
  );
  const collapsedPlanText = useMemo(() => buildCollapsedPlanText(chatState.planState.tasks), [chatState.planState.tasks]);

  useEffect(() => {
    if (!autoScrollEnabledRef.current) {
      return undefined;
    }

    const timer = setTimeout(() => {
      scrollToBottom(true);
    }, 24);

    return () => clearTimeout(timer);
  }, [scrollToBottom, tailSignature]);

  useEffect(() => {
    if (chatState.planState.tasks.length) return;
    setPlanExpanded(false);
  }, [chatState.planState.tasks.length]);

  useEffect(() => {
    if (skipNextHistoryLoadRef.current) {
      skipNextHistoryLoadRef.current = false;
      return;
    }

    if (!chatId) {
      stopStreaming();
      resetTimeline();
      return;
    }

    let cancelled = false;

    stopStreaming();
    resetTimeline();

    loadChat({ baseUrl: backendUrl, chatId })
      .unwrap()
      .then((data) => {
        if (cancelled) return;
        const events = Array.isArray(data?.events) ? data.events : [];
        events.forEach((event) => applyEvent(event, 'history'));
      })
      .catch((error) => {
        if (cancelled) return;
        dispatch(setStatusText(`会话载入失败：${formatError(error)}`));
      });

    return () => {
      cancelled = true;
    };
  }, [applyEvent, backendUrl, chatId, dispatch, loadChat, resetTimeline, stopStreaming]);

  useEffect(() => {
    return () => {
      stopStreaming();
      clearReasoningTimers();
      clearStreamIdleTimer();
      if (planCollapseTimerRef.current) {
        clearTimeout(planCollapseTimerRef.current);
        planCollapseTimerRef.current = null;
      }

      if (copyToastTimer.current) {
        clearTimeout(copyToastTimer.current);
        copyToastTimer.current = null;
      }
      if (fireworksTimerRef.current) {
        clearTimeout(fireworksTimerRef.current);
        fireworksTimerRef.current = null;
      }
    };
  }, [clearReasoningTimers, clearStreamIdleTimer, stopStreaming]);


  return (
    <View style={styles.container}>
      {(statusText || loadChatState.isFetching) ? (
        <View style={styles.liveStatusLine}>
          <Text style={[styles.liveStatusText, { color: theme.textSoft }]} numberOfLines={1}>{statusText}</Text>
          {loadChatState.isFetching ? <ActivityIndicator size="small" color={theme.primary} /> : null}
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        data={chatState.timeline}
        extraData={chatState.expandedTools}
        keyExtractor={(item) => item.id}
        style={styles.timelineList}
        contentContainerStyle={[styles.timelineContent, chatState.timeline.length === 0 ? styles.timelineContentEmpty : null]}
        onScroll={(event) => {
          const native = event.nativeEvent;
          const viewportBottom = native.contentOffset.y + native.layoutMeasurement.height;
          const distance = native.contentSize.height - viewportBottom;
          const atBottom = distance < AUTO_SCROLL_THRESHOLD;
          setAutoScrollMode(atBottom);
        }}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <TimelineEntryRow
            item={item}
            theme={theme}
            contentWidth={contentWidth}
            backendUrl={backendUrl}
            onToggleTool={handleToggleToolExpanded}
            toolExpanded={Boolean(chatState.expandedTools[item.id])}
            onToggleReasoning={handleToggleReasoning}
            onCopyText={handleCopyText}
          />
        )}
        ListEmptyComponent={
          <View style={[styles.emptyPanel, { backgroundColor: theme.surfaceStrong }]}> 
            <Text style={[styles.emptyTitle, { color: theme.text }]}>开始一个完整对话</Text>
            <Text style={[styles.emptySubTitle, { color: theme.textSoft }]}>左上角打开历史会话，或直接发送消息开始。</Text>
          </View>
        }
      />

      <View style={[styles.composerOuter, { paddingBottom: keyboardHeight > 0 ? (Platform.OS === 'ios' ? 0 : 10) : Math.max(insets.bottom, 10) }]}>
        {!autoScrollEnabled && chatState.timeline.length ? (
          <View style={styles.scrollToBottomWrap}>
            <TouchableOpacity
              activeOpacity={0.86}
              onPress={() => scrollToBottom(true)}
              style={[styles.scrollToBottomBtn, { backgroundColor: theme.surfaceStrong, borderColor: theme.border }]}
            >
              <Text style={[styles.scrollToBottomText, { color: theme.text }]}>↓</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {chatState.planState.tasks.length ? (
          <View style={[styles.planFloatWrap, { shadowColor: theme.shadow }]}>
            <TouchableOpacity
              activeOpacity={0.84}
              onPress={() => {
                if (planCollapseTimerRef.current) {
                  clearTimeout(planCollapseTimerRef.current);
                  planCollapseTimerRef.current = null;
                }
                setPlanExpanded((prev) => !prev);
              }}
              style={[styles.planCard, { backgroundColor: theme.surfaceStrong, borderColor: theme.border }]}
            >
              {planExpanded ? (
              <View>
                <View style={styles.planHead}>
                  <Text style={[styles.planTitle, { color: theme.text }]}>
                    {collapsedPlanText || `${planProgress.current}/${planProgress.total}`}
                  </Text>
                </View>
                <View style={styles.planTaskList}>
                  {cleanedPlanTasks.map((task) => {
                    const tone = task.status === 'done' ? theme.ok : task.status === 'failed' ? theme.danger : task.status === 'running' ? theme.warn : theme.textMute;
                    return (
                      <View key={task.taskId} style={styles.planTaskRow}>
                        <View style={[styles.planTaskDot, { backgroundColor: `${tone}` }]} />
                        <Text style={[styles.planTaskText, { color: theme.textSoft }]} numberOfLines={2}>
                          {task.cleanedDescription}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : (
              <View style={styles.planCollapsedWrap}>
                <Text style={[styles.planCollapsedLabel, { color: theme.textMute }]}>plan</Text>
                <Text style={[styles.planCollapsedText, { color: theme.text }]} numberOfLines={1}>
                  {`${planProgress.current}/${planProgress.total}` + (cleanedPlanTasks.length ? ` · ${cleanedPlanTasks[cleanedPlanTasks.length - 1].cleanedDescription}` : '')}
                </Text>
              </View>
            )}
            </TouchableOpacity>
          </View>
        ) : null}

        <Composer
          theme={theme}
          composerText={composerText}
          focused={composerFocused}
          onChangeText={setComposerText}
          onFocus={() => setComposerFocused(true)}
          onBlur={() => setComposerFocused(false)}
          onSend={sendMessage}
          onStop={stopStreaming}
          streaming={chatState.streaming}
          activeFrontendTool={chatState.activeFrontendTool}
          frontendToolWebViewRef={frontendToolWebViewRef}
          onFrontendToolMessage={handleFrontendToolMessage}
          onFrontendToolLoad={handleFrontendToolWebViewLoad}
        />
      </View>

      {copyToast ? (
        <View style={styles.copyToast} pointerEvents="none">
          <Text style={styles.copyToastText}>已复制</Text>
        </View>
      ) : null}

      {fireworksVisible ? (
        <View pointerEvents="none" style={styles.fireworksLayer}>
          {fireworkRockets.map((rocket) => (
            <Fragment key={String(rocket.id)}>
              <Animated.View
                style={[
                  styles.fireworkRocket,
                  {
                    left: Number(rocket.x),
                    top: Number(rocket.y),
                    width: Number(rocket.size),
                    height: Number(rocket.size),
                    borderRadius: Number(rocket.size) / 2,
                    backgroundColor: String(rocket.color),
                    shadowColor: String(rocket.color),
                    opacity: fireworksAnim.interpolate({
                      inputRange: [0, Number(rocket.startT), Number(rocket.endT), Math.min(0.995, Number(rocket.endT) + 0.03), 1],
                      outputRange: [0, 0, 0.96, 0, 0],
                      extrapolate: 'clamp'
                    }),
                    transform: [
                      {
                        translateX: fireworksAnim.interpolate({
                          inputRange: [0, Number(rocket.startT), Number(rocket.midT), Number(rocket.endT), 1],
                          outputRange: [0, 0, Number(rocket.midDx), Number(rocket.dx), Number(rocket.dx)],
                          extrapolate: 'clamp'
                        })
                      },
                      {
                        translateY: fireworksAnim.interpolate({
                          inputRange: [0, Number(rocket.startT), Number(rocket.midT), Number(rocket.endT), 1],
                          outputRange: [0, 0, Number(rocket.midDy), Number(rocket.dy), Number(rocket.dy)],
                          extrapolate: 'clamp'
                        })
                      }
                    ]
                  }
                ]}
              />
            </Fragment>
          ))}

          {fireworkSparks.map((spark) => (
            <Animated.View
              key={String(spark.id)}
              style={[
                styles.fireworkSpark,
                {
                  left: Number(spark.x),
                  top: Number(spark.y),
                  width: Number(spark.size),
                  height: Number(spark.size),
                  borderRadius: Number(spark.size) / 2,
                  backgroundColor: String(spark.color),
                  shadowColor: String(spark.color),
                  opacity: fireworksAnim.interpolate({
                    inputRange: [0, Number(spark.startT), Number(spark.peakT), Number(spark.fadeT), Number(spark.endT), 1],
                    outputRange: [0, 0, 1, 0.7, 0, 0],
                    extrapolate: 'clamp'
                  }),
                  transform: [
                    {
                      translateX: fireworksAnim.interpolate({
                        inputRange: [0, Number(spark.startT), Number(spark.midT), Number(spark.endT), 1],
                        outputRange: [0, 0, Number(spark.midDx), Number(spark.dx), Number(spark.dx)],
                        extrapolate: 'clamp'
                      })
                    },
                    {
                      translateY: fireworksAnim.interpolate({
                        inputRange: [0, Number(spark.startT), Number(spark.midT), Number(spark.endT), 1],
                        outputRange: [0, 0, Number(spark.midDy), Number(spark.dy), Number(spark.dy)],
                        extrapolate: 'clamp'
                      })
                    }
                  ]
                }
              ]}
            />
          ))}
        </View>
      ) : null}

      <Modal
        transparent
        visible={chatState.actionModal.visible}
        animationType="fade"
        onRequestClose={() => setChatStateSafe((prev) => ({ ...prev, actionModal: { ...prev.actionModal, visible: false } }))}
      >
        <View style={[styles.actionModalOverlay, { backgroundColor: theme.overlay }]}> 
          <View style={[styles.actionModalCard, { backgroundColor: theme.surfaceStrong }]}> 
            <Text style={[styles.actionModalTitle, { color: theme.text }]}>{chatState.actionModal.title || '提示'}</Text>
            <Text style={[styles.actionModalContent, { color: theme.textSoft }]}>{chatState.actionModal.content || ' '}</Text>
            <TouchableOpacity
              activeOpacity={0.82}
              style={[styles.actionModalBtn, { backgroundColor: theme.primarySoft }]}
              onPress={() => setChatStateSafe((prev) => ({ ...prev, actionModal: { ...prev.actionModal, visible: false } }))}
            >
              <Text style={[styles.actionModalBtnText, { color: theme.primaryDeep }]}>{chatState.actionModal.closeText || '关闭'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  liveStatusLine: {
    marginHorizontal: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  liveStatusText: {
    flex: 1,
    fontSize: 12
  },
  timelineList: {
    flex: 1
  },
  timelineContent: {
    paddingTop: 8,
    paddingBottom: 4
  },
  timelineContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center'
  },
  emptyPanel: {
    marginHorizontal: 14,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 20
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700'
  },
  emptySubTitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18
  },
  composerOuter: {
    paddingTop: 4
  },
  scrollToBottomWrap: {
    alignItems: 'center',
    marginBottom: 8
  },
  scrollToBottomBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3
  },
  scrollToBottomText: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: -2
  },
  planFloatWrap: {
    marginHorizontal: 14,
    marginBottom: -6,
    zIndex: 3,
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2
  },
  planCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  planHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  planTitle: {
    fontWeight: '700',
    fontSize: 14
  },
  planTaskList: {
    gap: 8
  },
  planTaskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8
  },
  planTaskDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4
  },
  planTaskText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18
  },
  planCollapsedWrap: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  planCollapsedLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginRight: 8
  },
  planCollapsedText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600'
  },
  copyToast: {
    position: 'absolute',
    bottom: 120,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.76)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  copyToastText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600'
  },
  fireworksLayer: {
    ...StyleSheet.absoluteFillObject
  },
  fireworkRocket: {
    position: 'absolute',
    shadowOpacity: 0.42,
    shadowRadius: 8
  },
  fireworkSpark: {
    position: 'absolute',
    shadowOpacity: 0.3,
    shadowRadius: 6
  },
  actionModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20
  },
  actionModalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    padding: 16
  },
  actionModalTitle: {
    fontSize: 16,
    fontWeight: '700'
  },
  actionModalContent: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20
  },
  actionModalBtn: {
    marginTop: 14,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center'
  },
  actionModalBtnText: {
    fontSize: 14,
    fontWeight: '700'
  }
});
