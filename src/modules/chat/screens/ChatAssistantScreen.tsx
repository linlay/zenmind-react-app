// @ts-nocheck
import * as Clipboard from 'expo-clipboard';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  FlatList,
  Modal,
  PanResponder,
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
import { getAccessToken } from '../../../core/auth/appAuth';
import {
  buildWebViewPostMessageScript,
  createWebViewAuthRefreshResultMessage,
  createWebViewAuthTokenMessage,
  WebViewAuthRefreshOutcome
} from '../../../core/auth/webViewAuthBridge';
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
import { cleanPlanTaskDescription } from '../utils/planUi';
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
import { parseFrontendToolBridgeMessage } from '../services/frontendToolBridge';
import { TimelineEntryRow } from '../components/TimelineEntryRow';
import { Composer } from '../components/Composer';

const REASONING_COLLAPSE_MS = 1500;
const STREAM_IDLE_MS = 2500;
const PLAN_COLLAPSE_MS = 1500;
const AUTO_SCROLL_THRESHOLD = 36;
const SSE_MALFORMED_STATUS_PREFIX = 'SSE 数据帧异常：';
const SSE_MALFORMED_STATUS_TTL_MS = 3000;
const TOOL_INIT_FAST_RETRY_DELAYS_MS = [0, 150, 500, 1200];
const TOOL_INIT_HEARTBEAT_MS = 2000;
const TOOL_INIT_HINT_MIN_ATTEMPT = 4;
const TOOL_INIT_HINT_THROTTLE_MS = 3000;
const GESTURE_SWITCH_THRESHOLD = 72;
const GESTURE_HORIZONTAL_RATIO_THRESHOLD = 1.15;
const GESTURE_RATIO_THRESHOLD = 1.25;
const GESTURE_COOLDOWN_MS = 450;
const GESTURE_CREATE_CHAT_REVEAL_THRESHOLD = 18;
const GESTURE_CREATE_CHAT_COMMIT_THRESHOLD = 112;
const GESTURE_CREATE_CHAT_VISUAL_MAX = 148;
const GESTURE_CREATE_CHAT_LEFT_EDGE_GUARD_PX = 32;
const GESTURE_SHOW_DRAWER_ACTIVATE_THRESHOLD = 10;
const GESTURE_SHOW_DRAWER_COMMIT_DISTANCE = 96;
const GESTURE_SHOW_DRAWER_COMMIT_VELOCITY = -0.58;
const GESTURE_SHOW_DRAWER_DISTANCE_MAX = 156;
const GESTURE_SWITCH_REVEAL_THRESHOLD = 18;
const GESTURE_SWITCH_VISUAL_MAX = 132;
const LIST_EDGE_TOP_THRESHOLD = 12;
const LIST_EDGE_BOTTOM_THRESHOLD = 12;
const NATIVE_CONFIRM_DIALOG_TOOL_KEY = 'confirm_dialog';
const FRONTEND_TOOL_OVERLAY_OPEN_MS = 220;
const FRONTEND_TOOL_OVERLAY_CLOSE_MS = 170;
const EDGE_TOAST_TTL_MS = 2000;
const PUSH_DRAWER_WIDTH_RATIO = 0.76;
const PUSH_DRAWER_PREVIEW_RATIO = 0.2;

function isNativeConfirmDialogTool(toolType: string, toolKey: string): boolean {
  return String(toolType || '').toLowerCase() === 'html' && String(toolKey || '') === NATIVE_CONFIRM_DIALOG_TOOL_KEY;
}

function calcGestureRevealProgress(distance: number, revealThreshold: number, visualMax: number): number {
  if (distance <= revealThreshold) {
    return 0;
  }
  const range = visualMax - revealThreshold;
  if (range <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, (distance - revealThreshold) / range));
}

function calcGestureLinearProgress(distance: number, startDistance: number, fullDistance: number): number {
  const normalizedDistance = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  const start = Math.max(0, Number.isFinite(startDistance) ? startDistance : 0);
  const full = Math.max(start, Number.isFinite(fullDistance) ? fullDistance : start);
  if (full <= start) {
    return normalizedDistance >= full ? 1 : 0;
  }
  if (normalizedDistance <= start) {
    return 0;
  }
  if (normalizedDistance >= full) {
    return 1;
  }
  return (normalizedDistance - start) / (full - start);
}

function resolveListEdgeState(offsetY: number, viewportHeight: number, contentHeight: number): {
  atTop: boolean;
  atBottom: boolean;
  maxOffset: number;
} {
  const normalizedOffset = Number.isFinite(offsetY) ? offsetY : 0;
  const normalizedViewport = Math.max(0, Number.isFinite(viewportHeight) ? viewportHeight : 0);
  const normalizedContent = Math.max(0, Number.isFinite(contentHeight) ? contentHeight : 0);
  const maxOffset = Math.max(normalizedContent - normalizedViewport, 0);
  return {
    atTop: normalizedOffset <= LIST_EDGE_TOP_THRESHOLD,
    atBottom: normalizedOffset >= maxOffset - LIST_EDGE_BOTTOM_THRESHOLD,
    maxOffset
  };
}

interface ChatAssistantScreenProps {
  theme: AppTheme;
  backendUrl: string;
  contentWidth: number;
  onRefreshChats: (silent?: boolean) => Promise<void>;
  keyboardHeight: number;
  refreshSignal?: number;
  authAccessToken?: string;
  authAccessExpireAtMs?: number;
  authTokenSignal?: number;
  onWebViewAuthRefreshRequest?: (requestId: string, source: string) => Promise<WebViewAuthRefreshOutcome>;
  onRequestSwitchAgentChat?: (direction: 'prev' | 'next') => { ok: boolean; message?: string };
  onRequestCreateAgentChatBySwipe?: () => { ok: boolean; message?: string };
  onRequestPreviewChatDetailDrawer?: (progress: number) => void;
  onRequestShowChatDetailDrawer?: () => void;
  chatDetailDrawerOpen?: boolean;
}

type EdgeToastState = {
  message: string;
  placement: 'top' | 'bottom';
};

export function ChatAssistantScreen({
  theme,
  backendUrl,
  contentWidth,
  onRefreshChats,
  keyboardHeight,
  refreshSignal = 0,
  authAccessToken = '',
  authAccessExpireAtMs,
  authTokenSignal = 0,
  onWebViewAuthRefreshRequest,
  onRequestSwitchAgentChat,
  onRequestCreateAgentChatBySwipe,
  onRequestPreviewChatDetailDrawer,
  onRequestShowChatDetailDrawer,
  chatDetailDrawerOpen = false
}: ChatAssistantScreenProps) {
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();

  const chatId = useAppSelector((state) => state.chat.chatId);
  const selectedAgentKey = useAppSelector((state) => state.agents.selectedAgentKey);
  const agents = useAppSelector((state) => state.agents.agents);
  const statusText = useAppSelector((state) => state.chat.statusText);

  const [chatState, setChatState] = useState<ChatState>(createEmptyChatState());
  const [composerText, setComposerText] = useState('');
  const [copyToast, setCopyToast] = useState(false);
  const [edgeToast, setEdgeToast] = useState<EdgeToastState | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [isTimelineScrollable, setIsTimelineScrollable] = useState(false);
  const [planExpanded, setPlanExpanded] = useState(false);
  const [chatImageToken, setChatImageToken] = useState('');
  const [createChatSwipeDistance, setCreateChatSwipeDistance] = useState(0);
  const [showDrawerSwipeDistance, setShowDrawerSwipeDistance] = useState(0);
  const [switchPrevSwipeDistance, setSwitchPrevSwipeDistance] = useState(0);
  const [switchNextSwipeDistance, setSwitchNextSwipeDistance] = useState(0);
  const [frontendToolOverlayMounted, setFrontendToolOverlayMounted] = useState(false);

  const [fireworksVisible, setFireworksVisible] = useState(false);
  const [fireworkRockets, setFireworkRockets] = useState<Array<Record<string, unknown>>>([]);
  const [fireworkSparks, setFireworkSparks] = useState<Array<Record<string, unknown>>>([]);

  const [loadChat] = useLazyGetChatQuery();
  const [submitFrontendTool] = useSubmitFrontendToolMutation();

  const runtimeRef = useRef(createRuntimeMaps());
  const chatStateRef = useRef(chatState);
  const activeFrontendToolRef = useRef<FrontendToolState | null>(null);
  const frontendToolLoadedRef = useRef(false);
  const listRef = useRef<FlatList<TimelineEntry>>(null);
  const frontendToolWebViewRef = useRef<WebView>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const streamIdleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const streamLastEventAtRef = useRef(0);
  const autoScrollEnabledRef = useRef(true);
  const chatIdRef = useRef(chatId);
  const chatImageTokenRef = useRef('');
  const imageTokenErrorNotifiedRef = useRef(false);
  const skipHistoryLoadChatIdRef = useRef<string | null>(null);
  const planCollapseTimerRef = useRef<NodeJS.Timeout | null>(null);

  const reasoningTimerRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const copyToastTimer = useRef<NodeJS.Timeout | null>(null);
  const edgeToastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fireworksTimerRef = useRef<NodeJS.Timeout | null>(null);
  const malformedStatusClearTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fireworksAnim = useRef(new Animated.Value(0)).current;
  const frontendToolOverlayAnim = useRef(new Animated.Value(0)).current;
  const malformedNoticeAtRef = useRef(0);
  const chunkGapNotifiedToolIdsRef = useRef<Set<string>>(new Set());
  const toolInitRetryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const toolInitHeartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const toolInitSessionKeyRef = useRef('');
  const toolInitFastRetryIndexRef = useRef(0);
  const toolInitFastRetryStartedRef = useRef(false);
  const toolInitHintSessionKeyRef = useRef('');
  const toolInitHintAtRef = useRef(0);
  const scrollableStabilizationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const listAtTopRef = useRef(true);
  const listAtBottomRef = useRef(false);
  const listViewportHeightRef = useRef(0);
  const listContentHeightRef = useRef(0);
  const listOffsetYRef = useRef(0);
  const gestureCooldownUntilRef = useRef(0);
  const createChatSwipeDistanceRef = useRef(0);
  const showDrawerSwipeDistanceRef = useRef(0);
  const switchPrevSwipeDistanceRef = useRef(0);
  const switchNextSwipeDistanceRef = useRef(0);
  const shouldScrollTopAfterHistoryLoadRef = useRef(false);
  const navSwitchGestureLockedRef = useRef(false);
  const contentPushAnim = useRef(new Animated.Value(0)).current;
  const contentPushPrevDrawerOpenRef = useRef(false);

  const setChatStateSafe = useCallback((updater: (prev: ChatState) => ChatState) => {
    setChatState((prev) => {
      const next = updater(prev);
      chatStateRef.current = next;
      activeFrontendToolRef.current = next.activeFrontendTool;
      return next;
    });
  }, []);

  const setChatImageTokenSafe = useCallback((nextToken: string) => {
    const normalized = String(nextToken || '').trim();
    chatImageTokenRef.current = normalized;
    setChatImageToken((prev) => (prev === normalized ? prev : normalized));
    imageTokenErrorNotifiedRef.current = false;
  }, []);

  const stringifyToolParams = useCallback((params: Record<string, unknown> | null | undefined) => {
    if (!params || typeof params !== 'object') {
      return '';
    }
    try {
      return JSON.stringify(params);
    } catch {
      return '__unserializable_params__';
    }
  }, []);

  const resolveToolInitSessionKey = useCallback(
    (tool: FrontendToolState | null) => {
      if (!tool) {
        return '';
      }
      return `${tool.toolId}:${stringifyToolParams(tool.toolParams as Record<string, unknown> | null | undefined)}`;
    },
    [stringifyToolParams]
  );

  const clearToolInitTimers = useCallback((resetSession = false) => {
    if (toolInitRetryTimerRef.current) {
      clearTimeout(toolInitRetryTimerRef.current);
      toolInitRetryTimerRef.current = null;
    }
    if (toolInitHeartbeatTimerRef.current) {
      clearInterval(toolInitHeartbeatTimerRef.current);
      toolInitHeartbeatTimerRef.current = null;
    }
    toolInitFastRetryIndexRef.current = 0;
    toolInitFastRetryStartedRef.current = false;
    if (resetSession) {
      toolInitSessionKeyRef.current = '';
      toolInitHintSessionKeyRef.current = '';
      toolInitHintAtRef.current = 0;
    }
  }, []);

  const setAutoScrollMode = useCallback((enabled: boolean) => {
    autoScrollEnabledRef.current = enabled;
    setAutoScrollEnabled((prev) => (prev === enabled ? prev : enabled));
  }, []);

  const setCreateChatSwipeDistanceSafe = useCallback((distance: number) => {
    const normalized = Math.max(0, Math.min(Math.round(distance), GESTURE_CREATE_CHAT_VISUAL_MAX));
    createChatSwipeDistanceRef.current = normalized;
    setCreateChatSwipeDistance((prev) => (prev === normalized ? prev : normalized));
  }, []);

  const setShowDrawerSwipeDistanceSafe = useCallback((distance: number) => {
    const normalized = Math.max(0, Math.min(Math.round(distance), GESTURE_SHOW_DRAWER_DISTANCE_MAX));
    showDrawerSwipeDistanceRef.current = normalized;
    setShowDrawerSwipeDistance((prev) => (prev === normalized ? prev : normalized));
  }, []);

  const setSwitchPrevSwipeDistanceSafe = useCallback((distance: number) => {
    const normalized = Math.max(0, Math.min(Math.round(distance), GESTURE_SWITCH_VISUAL_MAX));
    switchPrevSwipeDistanceRef.current = normalized;
    setSwitchPrevSwipeDistance((prev) => (prev === normalized ? prev : normalized));
  }, []);

  const setSwitchNextSwipeDistanceSafe = useCallback((distance: number) => {
    const normalized = Math.max(0, Math.min(Math.round(distance), GESTURE_SWITCH_VISUAL_MAX));
    switchNextSwipeDistanceRef.current = normalized;
    setSwitchNextSwipeDistance((prev) => (prev === normalized ? prev : normalized));
  }, []);

  const resetNavGestureVisuals = useCallback(() => {
    setCreateChatSwipeDistanceSafe(0);
    setShowDrawerSwipeDistanceSafe(0);
    setSwitchPrevSwipeDistanceSafe(0);
    setSwitchNextSwipeDistanceSafe(0);
  }, [setCreateChatSwipeDistanceSafe, setShowDrawerSwipeDistanceSafe, setSwitchNextSwipeDistanceSafe, setSwitchPrevSwipeDistanceSafe]);

  const scrollToBottom = useCallback((animated = true) => {
    listRef.current?.scrollToEnd({ animated });
    setAutoScrollMode(true);
  }, [setAutoScrollMode]);

  const showEdgeToast = useCallback((message: string, placement: EdgeToastState['placement']) => {
    if (edgeToastTimerRef.current) {
      clearTimeout(edgeToastTimerRef.current);
      edgeToastTimerRef.current = null;
    }
    setEdgeToast({ message, placement });
    edgeToastTimerRef.current = setTimeout(() => {
      edgeToastTimerRef.current = null;
      setEdgeToast(null);
    }, EDGE_TOAST_TTL_MS);
  }, []);

  const syncListMetrics = useCallback(
    (offsetY: number, viewportHeight: number, contentHeight: number, options?: { fromScroll?: boolean }) => {
      const prevEdge = resolveListEdgeState(listOffsetYRef.current, listViewportHeightRef.current, listContentHeightRef.current);
      const normalizedOffset = Number.isFinite(offsetY) ? offsetY : 0;
      const normalizedViewport = Math.max(0, Number.isFinite(viewportHeight) ? viewportHeight : 0);
      const normalizedContent = Math.max(0, Number.isFinite(contentHeight) ? contentHeight : 0);

      listOffsetYRef.current = normalizedOffset;
      listViewportHeightRef.current = normalizedViewport;
      listContentHeightRef.current = normalizedContent;

      if (normalizedViewport <= 0) {
        const edgeWithUnknownViewport = resolveListEdgeState(normalizedOffset, normalizedViewport, normalizedContent);
        listAtTopRef.current = edgeWithUnknownViewport.atTop;
        listAtBottomRef.current = edgeWithUnknownViewport.atBottom;
        setIsTimelineScrollable(false);
        setAutoScrollMode(true);
        return;
      }

      const nextEdge = resolveListEdgeState(normalizedOffset, normalizedViewport, normalizedContent);
      listAtTopRef.current = nextEdge.atTop;
      listAtBottomRef.current = nextEdge.atBottom;

      const scrollable = normalizedContent > normalizedViewport;
      if (scrollable) {
        if (!scrollableStabilizationTimerRef.current) {
          scrollableStabilizationTimerRef.current = setTimeout(() => {
            scrollableStabilizationTimerRef.current = null;
            setIsTimelineScrollable(true);
          }, 80);
        }
      } else {
        if (scrollableStabilizationTimerRef.current) {
          clearTimeout(scrollableStabilizationTimerRef.current);
          scrollableStabilizationTimerRef.current = null;
        }
        setIsTimelineScrollable(false);
      }

      if (!scrollable) {
        setAutoScrollMode(true);
      } else {
        const viewportBottom = normalizedOffset + normalizedViewport;
        const distance = normalizedContent - viewportBottom;
        const atBottom = distance < AUTO_SCROLL_THRESHOLD;
        setAutoScrollMode(atBottom);
      }

      if (options?.fromScroll && scrollable) {
        if (!prevEdge.atTop && nextEdge.atTop) {
          showEdgeToast('已到对话顶部', 'top');
        }
        if (!prevEdge.atBottom && nextEdge.atBottom) {
          showEdgeToast('已到对话底部', 'bottom');
        }
      }
    },
    [setAutoScrollMode, showEdgeToast]
  );

  const getCurrentListEdgeState = useCallback(() => {
    return resolveListEdgeState(listOffsetYRef.current, listViewportHeightRef.current, listContentHeightRef.current);
  }, []);

  const scrollToTopAndDisableAutoScroll = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    syncListMetrics(0, listViewportHeightRef.current, listContentHeightRef.current);
  }, [syncListMetrics]);

  const canStartCreateChatFromGesture = useCallback(
    (event: unknown) => {
      const nativeEvent = (event as { nativeEvent?: Record<string, unknown> } | null)?.nativeEvent;
      const locationX = Number(nativeEvent?.locationX);
      const pageX = Number(nativeEvent?.pageX);
      const startX = Number.isFinite(locationX) ? locationX : pageX;
      if (!Number.isFinite(startX)) {
        return true;
      }
      return startX >= GESTURE_CREATE_CHAT_LEFT_EDGE_GUARD_PX;
    },
    []
  );

  const shouldSetTimelinePanResponder = useCallback(
    (event: unknown, gestureState: { dx: number; dy: number }) => {
      if (Date.now() < gestureCooldownUntilRef.current) {
        return false;
      }
      const absDx = Math.abs(gestureState.dx);
      const absDy = Math.abs(gestureState.dy);
      const horizontalDominant = absDx > absDy * GESTURE_HORIZONTAL_RATIO_THRESHOLD;
      const verticalDominant = absDy > absDx * GESTURE_RATIO_THRESHOLD;
      const edge = getCurrentListEdgeState();

      const canCreateChat =
        Boolean(onRequestCreateAgentChatBySwipe) &&
        horizontalDominant &&
        gestureState.dx >= 16 &&
        canStartCreateChatFromGesture(event);
      const canShowDrawer =
        Boolean(onRequestShowChatDetailDrawer) &&
        horizontalDominant &&
        gestureState.dx <= -GESTURE_SHOW_DRAWER_ACTIVATE_THRESHOLD;
      const canSwitchToPrev = Boolean(onRequestSwitchAgentChat) && edge.atTop && verticalDominant && gestureState.dy >= 16;
      const canSwitchToNext = Boolean(onRequestSwitchAgentChat) && edge.atBottom && verticalDominant && gestureState.dy <= -16;
      return canCreateChat || canShowDrawer || canSwitchToPrev || canSwitchToNext;
    },
    [canStartCreateChatFromGesture, getCurrentListEdgeState, onRequestCreateAgentChatBySwipe, onRequestShowChatDetailDrawer, onRequestSwitchAgentChat]
  );

  const runNavGestureAction = useCallback(
    (runner: (() => { ok: boolean; message?: string } | undefined) | undefined) => {
      resetNavGestureVisuals();
      if (!runner) {
        return;
      }
      if (Date.now() < gestureCooldownUntilRef.current) {
        return;
      }
      if (chatStateRef.current.streaming) {
        dispatch(setStatusText('当前正在回复，暂不能切换对话'));
        return;
      }
      if (activeFrontendToolRef.current) {
        dispatch(setStatusText('请先完成当前工具交互后再切换对话'));
        return;
      }

      gestureCooldownUntilRef.current = Date.now() + GESTURE_COOLDOWN_MS;
      const outcome = runner();
      if (outcome?.message) {
        dispatch(setStatusText(outcome.message));
      }
    },
    [dispatch, resetNavGestureVisuals]
  );

  const timelineGestureResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: shouldSetTimelinePanResponder,
        onMoveShouldSetPanResponderCapture: shouldSetTimelinePanResponder,
        onPanResponderGrant: () => {
          navSwitchGestureLockedRef.current = false;
          resetNavGestureVisuals();
        },
        onPanResponderTerminationRequest: () => {
          return !navSwitchGestureLockedRef.current;
        },
        onPanResponderMove: (event, gestureState) => {
          const absDx = Math.abs(gestureState.dx);
          const absDy = Math.abs(gestureState.dy);
          const horizontalDominant = absDx > absDy * GESTURE_HORIZONTAL_RATIO_THRESHOLD;
          const verticalDominant = absDy > absDx * GESTURE_RATIO_THRESHOLD;
          const edge = getCurrentListEdgeState();
          const switchPrevReady = verticalDominant && edge.atTop && gestureState.dy >= GESTURE_SWITCH_REVEAL_THRESHOLD;
          const switchNextReady = verticalDominant && edge.atBottom && gestureState.dy <= -GESTURE_SWITCH_REVEAL_THRESHOLD;

          if (
            horizontalDominant &&
            gestureState.dx >= GESTURE_CREATE_CHAT_REVEAL_THRESHOLD &&
            canStartCreateChatFromGesture(event)
          ) {
            setCreateChatSwipeDistanceSafe(Math.abs(gestureState.dx));
          } else if (createChatSwipeDistanceRef.current > 0) {
            setCreateChatSwipeDistanceSafe(0);
          }

          if (
            horizontalDominant &&
            gestureState.dx <= -GESTURE_SHOW_DRAWER_ACTIVATE_THRESHOLD
          ) {
            setShowDrawerSwipeDistanceSafe(Math.abs(gestureState.dx));
          } else if (showDrawerSwipeDistanceRef.current > 0) {
            setShowDrawerSwipeDistanceSafe(0);
          }

          if (switchPrevReady) {
            setSwitchPrevSwipeDistanceSafe(Math.abs(gestureState.dy));
          } else if (switchPrevSwipeDistanceRef.current > 0) {
            setSwitchPrevSwipeDistanceSafe(0);
          }

          if (switchNextReady) {
            setSwitchNextSwipeDistanceSafe(Math.abs(gestureState.dy));
          } else if (switchNextSwipeDistanceRef.current > 0) {
            setSwitchNextSwipeDistanceSafe(0);
          }
          navSwitchGestureLockedRef.current = switchPrevReady || switchNextReady;
        },
        onPanResponderRelease: (event, gestureState) => {
          const absDx = Math.abs(gestureState.dx);
          const absDy = Math.abs(gestureState.dy);
          const horizontalDominant = absDx > absDy * GESTURE_HORIZONTAL_RATIO_THRESHOLD;
          const verticalDominant = absDy > absDx * GESTURE_RATIO_THRESHOLD;
          const edge = getCurrentListEdgeState();

          if (
            horizontalDominant &&
            gestureState.dx >= GESTURE_CREATE_CHAT_COMMIT_THRESHOLD &&
            canStartCreateChatFromGesture(event)
          ) {
            runNavGestureAction(onRequestCreateAgentChatBySwipe);
            navSwitchGestureLockedRef.current = false;
            return;
          }
          const drawerDistance = Math.abs(gestureState.dx);
          const commitDrawerByDistance = drawerDistance >= GESTURE_SHOW_DRAWER_COMMIT_DISTANCE;
          const commitDrawerByVelocity = gestureState.vx <= GESTURE_SHOW_DRAWER_COMMIT_VELOCITY;
          if (horizontalDominant && gestureState.dx <= -GESTURE_SHOW_DRAWER_ACTIVATE_THRESHOLD && (commitDrawerByDistance || commitDrawerByVelocity)) {
            resetNavGestureVisuals();
            if (Date.now() < gestureCooldownUntilRef.current) {
              navSwitchGestureLockedRef.current = false;
              return;
            }
            gestureCooldownUntilRef.current = Date.now() + GESTURE_COOLDOWN_MS;
            onRequestShowChatDetailDrawer?.();
            navSwitchGestureLockedRef.current = false;
            return;
          }
          resetNavGestureVisuals();
          if (verticalDominant && edge.atTop && gestureState.dy >= GESTURE_SWITCH_THRESHOLD) {
            runNavGestureAction(() => onRequestSwitchAgentChat?.('prev'));
            navSwitchGestureLockedRef.current = false;
            return;
          }
          if (verticalDominant && edge.atBottom && gestureState.dy <= -GESTURE_SWITCH_THRESHOLD) {
            runNavGestureAction(() => onRequestSwitchAgentChat?.('next'));
          }
          navSwitchGestureLockedRef.current = false;
        },
        onPanResponderTerminate: () => {
          navSwitchGestureLockedRef.current = false;
          resetNavGestureVisuals();
        }
      }),
    [
      canStartCreateChatFromGesture,
      getCurrentListEdgeState,
      onRequestCreateAgentChatBySwipe,
      onRequestShowChatDetailDrawer,
      onRequestSwitchAgentChat,
      resetNavGestureVisuals,
      runNavGestureAction,
      setCreateChatSwipeDistanceSafe,
      setShowDrawerSwipeDistanceSafe,
      setSwitchNextSwipeDistanceSafe,
      setSwitchPrevSwipeDistanceSafe,
      shouldSetTimelinePanResponder
    ]
  );

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

  const reloadActiveFrontendToolViewport = useCallback(
    async (toolId: string, toolKey: string) => {
      clearToolInitTimers(false);
      frontendToolLoadedRef.current = false;
      setChatStateSafe((prev) =>
        prev.activeFrontendTool && prev.activeFrontendTool.toolId === toolId
          ? {
              ...prev,
              activeFrontendTool: {
                ...prev.activeFrontendTool,
                viewportHtml: null,
                loading: true,
                loadError: '',
                toolInitDispatched: false,
                userInteracted: false,
                initAttempt: 0,
                initLastSentAtMs: undefined
              }
            }
          : prev
      );

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
                  loading: false,
                  loadError: ''
                }
              }
            : prev
        );
      } catch (error) {
        const current = activeFrontendToolRef.current;
        if (!current || current.toolId !== toolId) return;
        clearToolInitTimers(false);

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
    [backendUrl, clearToolInitTimers, setChatStateSafe]
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
      const renderMode: FrontendToolState['renderMode'] = isNativeConfirmDialogTool(toolType, toolKey)
        ? 'native_confirm_dialog'
        : 'webview';

      const initialToolParams = payload.toolParams && typeof payload.toolParams === 'object'
        ? (payload.toolParams as Record<string, unknown>)
        : null;
      const initialParamsReady = Boolean(payload.paramsReady) || Boolean(initialToolParams);
      clearToolInitTimers(true);
      frontendToolLoadedRef.current = false;

      setChatStateSafe((prev) => ({
        ...prev,
        activeFrontendTool: {
          runId: String(payload.runId || ''),
          toolId,
          toolKey,
          toolType,
          toolName: String(payload.toolName || toolKey),
          renderMode,
          toolTimeout: (payload.toolTimeout as number | null | undefined) ?? null,
          toolParams: initialToolParams,
          paramsReady: initialParamsReady,
          paramsError: String(payload.paramsError || ''),
          argsText: String(payload.argsText || ''),
          missingChunkIndexes: Array.isArray(payload.missingChunkIndexes)
            ? (payload.missingChunkIndexes as number[])
            : [],
          chunkGapDetected: Boolean(payload.chunkGapDetected),
          toolInitDispatched: false,
          userInteracted: false,
          initAttempt: 0,
          initLastSentAtMs: undefined,
          viewportHtml: null,
          loading: renderMode === 'webview',
          loadError: ''
        }
      }));

      if (renderMode === 'webview') {
        await reloadActiveFrontendToolViewport(toolId, toolKey);
      }
    },
    [clearToolInitTimers, reloadActiveFrontendToolViewport, setChatStateSafe]
  );

  const handleFrontendToolRetry = useCallback(() => {
    const active = activeFrontendToolRef.current;
    if (!active) return;
    if (active.renderMode !== 'webview') return;
    clearToolInitTimers(false);
    reloadActiveFrontendToolViewport(active.toolId, active.toolKey).catch(() => {});
  }, [clearToolInitTimers, reloadActiveFrontendToolViewport]);

  const handleEffects = useCallback(
    (effects: ChatEffect[], source: 'live' | 'history') => {
      effects.forEach((effect) => {
        if (effect.type === 'set_chat_id') {
          const nextChatId = String(effect.payload?.chatId || '');
          if (nextChatId && nextChatId !== chatIdRef.current) {
            if (source === 'live') {
              skipHistoryLoadChatIdRef.current = nextChatId;
            }
            chatIdRef.current = nextChatId;
            dispatch(setChatId(nextChatId));
            if (source === 'live') {
              onRefreshChats(true).catch(() => {});
            }
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
          return;
        }

        if (effect.type === 'frontend_tool_params_ready') {
          const payload = effect.payload || {};
          const toolId = String(payload.toolId || '');
          if (!toolId) return;

          setChatStateSafe((prev) =>
            prev.activeFrontendTool && prev.activeFrontendTool.toolId === toolId
              ? {
                  ...prev,
                activeFrontendTool: {
                  ...prev.activeFrontendTool,
                  toolParams:
                    payload.toolParams && typeof payload.toolParams === 'object'
                      ? (payload.toolParams as Record<string, unknown>)
                      : null,
                  paramsReady: Boolean(payload.paramsReady),
                  paramsError: String(payload.paramsError || ''),
                  argsText: String(payload.argsText || prev.activeFrontendTool.argsText || ''),
                  missingChunkIndexes: Array.isArray(payload.missingChunkIndexes)
                    ? (payload.missingChunkIndexes as number[])
                    : [],
                  chunkGapDetected: Boolean(payload.chunkGapDetected),
                  toolInitDispatched: false,
                  userInteracted: false,
                  initAttempt: 0,
                  initLastSentAtMs: undefined
                }
              }
              : prev
          );

          const chunkGapDetected = Boolean(payload.chunkGapDetected);
          const missingChunkIndexes = Array.isArray(payload.missingChunkIndexes)
            ? (payload.missingChunkIndexes as Array<number | string>)
            : [];
          if (chunkGapDetected && !chunkGapNotifiedToolIdsRef.current.has(toolId)) {
            chunkGapNotifiedToolIdsRef.current.add(toolId);
            dispatch(
              setStatusText(
                `前端工具参数分片缺失：toolId=${toolId} missing=[${missingChunkIndexes.join(',')}]`
              )
            );
          }
        }
      });
    },
    [activateFrontendToolFromEffect, clearStreamIdleTimer, dispatch, executeAction, onRefreshChats, setChatStateSafe]
  );

  const applyEvent = useCallback(
    (event: ChatEvent, source: 'live' | 'history') => {
      const type = normalizeEventType((event as Record<string, unknown>)?.type);

      if (type === 'chat.start') {
        const eventToken = String((event as Record<string, unknown>)?.chatImageToken || '').trim();
        if (eventToken && eventToken !== chatImageTokenRef.current) {
          setChatImageTokenSafe(eventToken);
        }
      }

      if (source === 'live' && isStreamActivityType(type)) {
        streamLastEventAtRef.current = Date.now();
        armStreamIdleTimer();
      }
      if (source === 'live' && type === 'plan.update') {
        armPlanCollapseTimer();
      }

      const { next, effects } = reduceChatEvent(chatStateRef.current, event, source, runtimeRef.current);

      if (source === 'live' && isStreamActivityType(type)) {
        next.streaming = true;
      }

      chatStateRef.current = next;
      activeFrontendToolRef.current = next.activeFrontendTool;
      setChatState(next);

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
    [armPlanCollapseTimer, armStreamIdleTimer, handleEffects, scheduleReasoningCollapse, setChatImageTokenSafe]
  );

  const resetTimeline = useCallback(() => {
    clearToolInitTimers(true);
    runtimeRef.current = createRuntimeMaps();
    frontendToolLoadedRef.current = false;
    chunkGapNotifiedToolIdsRef.current.clear();
    setChatStateSafe(() => createEmptyChatState());
    setChatImageTokenSafe('');
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
    if (scrollableStabilizationTimerRef.current) {
      clearTimeout(scrollableStabilizationTimerRef.current);
      scrollableStabilizationTimerRef.current = null;
    }
    setIsTimelineScrollable(false);
    setEdgeToast(null);
    if (edgeToastTimerRef.current) {
      clearTimeout(edgeToastTimerRef.current);
      edgeToastTimerRef.current = null;
    }
    listAtTopRef.current = true;
    listAtBottomRef.current = false;
    listContentHeightRef.current = 0;
    listOffsetYRef.current = 0;
    navSwitchGestureLockedRef.current = false;
    resetNavGestureVisuals();
  }, [clearReasoningTimers, clearToolInitTimers, resetNavGestureVisuals, setAutoScrollMode, setChatImageTokenSafe, setChatStateSafe]);

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

    const initialAccessToken = await getAccessToken(backendUrl);
    if (!initialAccessToken) {
      dispatch(setStatusText('登录状态失效，请重新登录'));
      return;
    }

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

    const runStreamRequest = async (accessToken: string) => {
      await consumeJsonSseXhr(
        `${backendUrl}/api/ap/query`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
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
        controller.signal,
        {
          onMalformedFrame: (rawFrame, reason) => {
            if (__DEV__) {
              const preview = String(rawFrame || '').replace(/\s+/g, ' ').slice(0, 220);
              console.warn(`[chatStream] malformed SSE frame: ${reason}; preview=${preview}`);
            }
            const now = Date.now();
            if (now - malformedNoticeAtRef.current > 1800) {
              malformedNoticeAtRef.current = now;
              dispatch(setStatusText(`SSE 数据帧异常：${reason}`));
            }
          }
        }
      );
    };

    try {
      try {
        await runStreamRequest(initialAccessToken);
      } catch (error) {
        const rawMessage = String((error as Error)?.message || '');
        const isUnauthorized = rawMessage.includes('HTTP 401');
        if (!controller.signal.aborted && isUnauthorized) {
          const retryAccessToken = await getAccessToken(backendUrl, true);
          if (!retryAccessToken) {
            throw error;
          }
          await runStreamRequest(retryAccessToken);
        } else {
          throw error;
        }
      }
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
      onRefreshChats(true).catch(() => {});
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
        return false;
      }

      try {
        const data = await submitFrontendTool({
          baseUrl: backendUrl,
          runId: active.runId,
          toolId: active.toolId,
          params: params && typeof params === 'object' ? params : {}
        }).unwrap();

        if (data?.accepted) {
          clearToolInitTimers(true);
          frontendToolLoadedRef.current = false;
          setChatStateSafe((prev) => ({ ...prev, activeFrontendTool: null }));
          return true;
        } else {
          const detail = String(data?.detail || data?.status || 'unmatched');
          dispatch(setStatusText(`提交未被接受：${detail}`));
          return false;
        }
      } catch (error) {
        dispatch(setStatusText(`提交失败：${(error as Error)?.message || 'unknown error'}`));
        return false;
      }
    },
    [backendUrl, clearToolInitTimers, dispatch, setChatStateSafe, submitFrontendTool]
  );

  const postToFrontendToolWebView = useCallback((payload: Record<string, unknown>) => {
    if (!frontendToolWebViewRef.current) {
      return;
    }
    frontendToolWebViewRef.current.injectJavaScript(buildWebViewPostMessageScript(payload));
  }, []);

  const canDispatchToolInit = useCallback((active: FrontendToolState | null) => {
    if (!active || active.renderMode !== 'webview' || !frontendToolWebViewRef.current) {
      return false;
    }
    if (!frontendToolLoadedRef.current) {
      return false;
    }
    if (active.loading || active.loadError || !active.viewportHtml) {
      return false;
    }
    if (!active.paramsReady || Boolean(active.paramsError)) {
      return false;
    }
    if (active.userInteracted) {
      return false;
    }
    return true;
  }, []);

  const dispatchToolInitOnce = useCallback(
    (_trigger: string) => {
      const active = activeFrontendToolRef.current;
      if (!canDispatchToolInit(active)) {
        return false;
      }

      const initPayload = {
        type: 'tool_init',
        data: {
          runId: active.runId,
          toolId: active.toolId,
          toolKey: active.toolKey,
          toolType: active.toolType,
          toolTimeout: active.toolTimeout,
          params: active.toolParams && typeof active.toolParams === 'object' ? active.toolParams : {}
        }
      };
      postToFrontendToolWebView(initPayload);

      const sentAtMs = Date.now();
      const sessionKey = resolveToolInitSessionKey(active);
      const nextAttempt = Number(active.initAttempt || 0) + 1;

      setChatStateSafe((prev) =>
        prev.activeFrontendTool && prev.activeFrontendTool.toolId === active.toolId
          ? {
              ...prev,
              activeFrontendTool: {
                ...prev.activeFrontendTool,
                toolInitDispatched: true,
                initAttempt: Number(prev.activeFrontendTool.initAttempt || 0) + 1,
                initLastSentAtMs: sentAtMs
              }
            }
          : prev
      );

      if (
        nextAttempt >= TOOL_INIT_HINT_MIN_ATTEMPT &&
        toolInitHintSessionKeyRef.current !== sessionKey &&
        sentAtMs - toolInitHintAtRef.current >= TOOL_INIT_HINT_THROTTLE_MS
      ) {
        toolInitHintSessionKeyRef.current = sessionKey;
        toolInitHintAtRef.current = sentAtMs;
        dispatch(setStatusText('前端工具已重发初始化，请在页面内点击任意位置唤醒交互'));
      }

      return true;
    },
    [canDispatchToolInit, dispatch, postToFrontendToolWebView, resolveToolInitSessionKey, setChatStateSafe]
  );

  const startToolInitHeartbeat = useCallback(() => {
    if (toolInitHeartbeatTimerRef.current) {
      return;
    }
    toolInitHeartbeatTimerRef.current = setInterval(() => {
      const active = activeFrontendToolRef.current;
      if (!active || active.userInteracted || active.loadError || active.paramsError) {
        clearToolInitTimers(false);
        return;
      }
      dispatchToolInitOnce('heartbeat');
    }, TOOL_INIT_HEARTBEAT_MS);
  }, [clearToolInitTimers, dispatchToolInitOnce]);

  const scheduleToolInitFastRetry = useCallback(function scheduleToolInitFastRetry() {
    if (!toolInitFastRetryStartedRef.current) {
      return;
    }
    if (toolInitRetryTimerRef.current) {
      return;
    }
    if (toolInitFastRetryIndexRef.current >= TOOL_INIT_FAST_RETRY_DELAYS_MS.length) {
      startToolInitHeartbeat();
      return;
    }

    const delay = TOOL_INIT_FAST_RETRY_DELAYS_MS[toolInitFastRetryIndexRef.current];
    toolInitFastRetryIndexRef.current += 1;
    toolInitRetryTimerRef.current = setTimeout(() => {
      toolInitRetryTimerRef.current = null;
      const active = activeFrontendToolRef.current;
      if (!active || active.userInteracted || active.loadError || active.paramsError) {
        clearToolInitTimers(false);
        return;
      }
      dispatchToolInitOnce('fast_retry');
      scheduleToolInitFastRetry();
    }, delay);
  }, [clearToolInitTimers, dispatchToolInitOnce, startToolInitHeartbeat]);

  const ensureToolInitReliableDispatch = useCallback(
    (trigger: string) => {
      const active = activeFrontendToolRef.current;
      if (!active) {
        clearToolInitTimers(true);
        return;
      }

      const nextSessionKey = resolveToolInitSessionKey(active);
      if (toolInitSessionKeyRef.current !== nextSessionKey) {
        clearToolInitTimers(false);
        toolInitSessionKeyRef.current = nextSessionKey;
      }

      if (!canDispatchToolInit(active)) {
        if (active.userInteracted || active.loadError || active.paramsError) {
          clearToolInitTimers(false);
        }
        return;
      }

      if (!toolInitFastRetryStartedRef.current) {
        toolInitFastRetryStartedRef.current = true;
        toolInitFastRetryIndexRef.current = 0;
        scheduleToolInitFastRetry();
        return;
      }

      if (trigger !== 'timer') {
        dispatchToolInitOnce(trigger);
      }
      if (toolInitFastRetryIndexRef.current >= TOOL_INIT_FAST_RETRY_DELAYS_MS.length) {
        startToolInitHeartbeat();
      }
    },
    [
      canDispatchToolInit,
      clearToolInitTimers,
      dispatchToolInitOnce,
      resolveToolInitSessionKey,
      scheduleToolInitFastRetry,
      startToolInitHeartbeat
    ]
  );

  const handleFrontendToolMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const bridgeMessage = parseFrontendToolBridgeMessage(event.nativeEvent.data);
        if (!bridgeMessage) {
          return;
        }

        if (bridgeMessage.type === 'frontend_submit') {
          submitActiveFrontendTool(bridgeMessage.params).catch(() => {});
          return;
        }

        if (bridgeMessage.type === 'frontend_interacted') {
          clearToolInitTimers(false);
          const active = activeFrontendToolRef.current;
          if (!active) {
            return;
          }
          setChatStateSafe((prev) =>
            prev.activeFrontendTool && prev.activeFrontendTool.toolId === active.toolId
              ? {
                  ...prev,
                  activeFrontendTool: {
                    ...prev.activeFrontendTool,
                    userInteracted: true
                  }
                }
              : prev
          );
          return;
        }

        if (bridgeMessage.type === 'frontend_ready') {
          ensureToolInitReliableDispatch('frontend_ready');
          return;
        }

        if (bridgeMessage.type === 'auth_refresh_request') {
          const fallback = Promise.resolve<WebViewAuthRefreshOutcome>({
            ok: false,
            error: 'Auth refresh handler unavailable'
          });
          const refreshTask = onWebViewAuthRefreshRequest
            ? onWebViewAuthRefreshRequest(bridgeMessage.requestId, bridgeMessage.source)
            : fallback;

          refreshTask
            .then((outcome) => {
              const result = createWebViewAuthRefreshResultMessage(bridgeMessage.requestId, outcome);
              postToFrontendToolWebView(result as unknown as Record<string, unknown>);
            })
            .catch((error) => {
              const result = createWebViewAuthRefreshResultMessage(bridgeMessage.requestId, {
                ok: false,
                error: String((error as Error)?.message || 'refresh failed')
              });
              postToFrontendToolWebView(result as unknown as Record<string, unknown>);
            });
        }
      } catch {
        // Ignore parse errors.
      }
    },
    [
      clearToolInitTimers,
      ensureToolInitReliableDispatch,
      onWebViewAuthRefreshRequest,
      postToFrontendToolWebView,
      setChatStateSafe,
      submitActiveFrontendTool
    ]
  );

  const handleFrontendToolWebViewLoad = useCallback(() => {
    const active = activeFrontendToolRef.current;
    if (!active || active.renderMode !== 'webview' || !frontendToolWebViewRef.current) return;
    frontendToolLoadedRef.current = true;
    ensureToolInitReliableDispatch('webview_load');

    const authTokenMessage = createWebViewAuthTokenMessage(authAccessToken, authAccessExpireAtMs);
    if (authTokenMessage) {
      postToFrontendToolWebView(authTokenMessage as unknown as Record<string, unknown>);
    }
  }, [authAccessExpireAtMs, authAccessToken, ensureToolInitReliableDispatch, postToFrontendToolWebView]);

  useEffect(() => {
    const active = chatState.activeFrontendTool;
    if (!active) {
      frontendToolLoadedRef.current = false;
      clearToolInitTimers(true);
      return;
    }
    if (active.loadError || active.paramsError || active.userInteracted) {
      clearToolInitTimers(false);
      return;
    }
    ensureToolInitReliableDispatch('active_tool_state');
  }, [
    chatState.activeFrontendTool?.toolId,
    chatState.activeFrontendTool?.viewportHtml,
    chatState.activeFrontendTool?.loading,
    chatState.activeFrontendTool?.loadError,
    chatState.activeFrontendTool?.paramsReady,
    chatState.activeFrontendTool?.paramsError,
    chatState.activeFrontendTool?.toolParams,
    chatState.activeFrontendTool?.userInteracted,
    clearToolInitTimers,
    ensureToolInitReliableDispatch
  ]);

  useEffect(() => {
    if (!authTokenSignal || !frontendToolWebViewRef.current) {
      return;
    }
    const authTokenMessage = createWebViewAuthTokenMessage(authAccessToken, authAccessExpireAtMs);
    if (!authTokenMessage) {
      return;
    }
    postToFrontendToolWebView(authTokenMessage as unknown as Record<string, unknown>);
  }, [authAccessExpireAtMs, authAccessToken, authTokenSignal, postToFrontendToolWebView]);

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

  const handleMarkdownImageTokenError = useCallback(() => {
    if (imageTokenErrorNotifiedRef.current) {
      return;
    }
    imageTokenErrorNotifiedRef.current = true;
    dispatch(setStatusText('图片加载失败：签名可能过期或无权限'));
  }, [dispatch]);

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
  const hasPlanTasks = chatState.planState.tasks.length > 0;
  const hasActiveFrontendTool = Boolean(chatState.activeFrontendTool);
  const composerBottomPadding =
    keyboardHeight > 0 ? (Platform.OS === 'ios' ? 0 : 10) : Math.max(insets.bottom, 10);
  const drawerWidthPx = contentWidth * PUSH_DRAWER_WIDTH_RATIO;
  const previewMaxOpenFraction = drawerWidthPx > 0
    ? (contentWidth * PUSH_DRAWER_PREVIEW_RATIO) / drawerWidthPx
    : 0;
  const createChatRevealProgress = useMemo(() => {
    return calcGestureRevealProgress(
      createChatSwipeDistance,
      GESTURE_CREATE_CHAT_REVEAL_THRESHOLD,
      GESTURE_CREATE_CHAT_VISUAL_MAX
    );
  }, [createChatSwipeDistance]);
  const showDrawerRevealProgress = useMemo(() => {
    if (showDrawerSwipeDistance <= 0) return 0;
    return Math.min(1, showDrawerSwipeDistance / GESTURE_SHOW_DRAWER_COMMIT_DISTANCE);
  }, [showDrawerSwipeDistance]);
  const switchPrevRevealProgress = useMemo(() => {
    return calcGestureRevealProgress(switchPrevSwipeDistance, GESTURE_SWITCH_REVEAL_THRESHOLD, GESTURE_SWITCH_VISUAL_MAX);
  }, [switchPrevSwipeDistance]);
  const switchNextRevealProgress = useMemo(() => {
    return calcGestureRevealProgress(switchNextSwipeDistance, GESTURE_SWITCH_REVEAL_THRESHOLD, GESTURE_SWITCH_VISUAL_MAX);
  }, [switchNextSwipeDistance]);

  useEffect(() => {
    if (!onRequestPreviewChatDetailDrawer) {
      return;
    }
    onRequestPreviewChatDetailDrawer(showDrawerRevealProgress);

    if (chatDetailDrawerOpen) return;

    if (showDrawerRevealProgress > 0) {
      contentPushAnim.setValue(showDrawerRevealProgress * previewMaxOpenFraction);
    } else {
      contentPushAnim.stopAnimation((val) => {
        if (val > 0.001) {
          Animated.timing(contentPushAnim, {
            toValue: 0,
            duration: 140,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start();
        }
      });
    }
  }, [chatDetailDrawerOpen, contentPushAnim, onRequestPreviewChatDetailDrawer,
      previewMaxOpenFraction, showDrawerRevealProgress]);

  useEffect(() => {
    const wasOpen = contentPushPrevDrawerOpenRef.current;
    contentPushPrevDrawerOpenRef.current = chatDetailDrawerOpen;
    if (chatDetailDrawerOpen === wasOpen) return;

    contentPushAnim.stopAnimation();
    if (chatDetailDrawerOpen) {
      Animated.spring(contentPushAnim, {
        toValue: 1,
        damping: 24,
        stiffness: 240,
        mass: 0.9,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(contentPushAnim, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [chatDetailDrawerOpen, contentPushAnim]);

  useEffect(() => {
    frontendToolOverlayAnim.stopAnimation();
    if (hasActiveFrontendTool) {
      setFrontendToolOverlayMounted(true);
      Animated.timing(frontendToolOverlayAnim, {
        toValue: 1,
        duration: FRONTEND_TOOL_OVERLAY_OPEN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }).start();
      return;
    }
    Animated.timing(frontendToolOverlayAnim, {
      toValue: 0,
      duration: FRONTEND_TOOL_OVERLAY_CLOSE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true
    }).start(() => {
      if (!activeFrontendToolRef.current) {
        setFrontendToolOverlayMounted(false);
      }
    });
  }, [frontendToolOverlayAnim, hasActiveFrontendTool]);

  const frontendToolSheetTranslateY = useMemo(
    () =>
      frontendToolOverlayAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [26, 0]
      }),
    [frontendToolOverlayAnim]
  );
  const frontendToolSheetOpacity = useMemo(
    () =>
      frontendToolOverlayAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.92, 1]
      }),
    [frontendToolOverlayAnim]
  );

  useEffect(() => {
    if (Platform.OS !== 'android' || !hasActiveFrontendTool) {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [hasActiveFrontendTool]);

  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);

  useEffect(() => {
    if (malformedStatusClearTimerRef.current) {
      clearTimeout(malformedStatusClearTimerRef.current);
      malformedStatusClearTimerRef.current = null;
    }

    if (!String(statusText || '').startsWith(SSE_MALFORMED_STATUS_PREFIX)) {
      return;
    }

    malformedStatusClearTimerRef.current = setTimeout(() => {
      malformedStatusClearTimerRef.current = null;
      dispatch(setStatusText(''));
    }, SSE_MALFORMED_STATUS_TTL_MS);

    return () => {
      if (malformedStatusClearTimerRef.current) {
        clearTimeout(malformedStatusClearTimerRef.current);
        malformedStatusClearTimerRef.current = null;
      }
    };
  }, [dispatch, statusText]);

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
    if (chatId && skipHistoryLoadChatIdRef.current === chatId) {
      skipHistoryLoadChatIdRef.current = null;
      return;
    }

    if (!chatId) {
      shouldScrollTopAfterHistoryLoadRef.current = false;
      skipHistoryLoadChatIdRef.current = null;
      stopStreaming();
      resetTimeline();
      return;
    }

    let cancelled = false;
    shouldScrollTopAfterHistoryLoadRef.current = true;

    stopStreaming();
    resetTimeline();

    loadChat({ baseUrl: backendUrl, chatId })
      .unwrap()
      .then((data) => {
        if (cancelled) return;
        setChatImageTokenSafe(String(data?.chatImageToken || ''));
        const events = Array.isArray(data?.events) ? data.events : [];
        events.forEach((event) => applyEvent(event, 'history'));
        if (shouldScrollTopAfterHistoryLoadRef.current) {
          shouldScrollTopAfterHistoryLoadRef.current = false;
          scrollToTopAndDisableAutoScroll();
        }
      })
      .catch((error) => {
        if (cancelled) return;
        dispatch(setStatusText(`会话载入失败：${formatError(error)}`));
      });

    return () => {
      cancelled = true;
    };
  }, [
    applyEvent,
    backendUrl,
    chatId,
    dispatch,
    loadChat,
    resetTimeline,
    scrollToTopAndDisableAutoScroll,
    setChatImageTokenSafe,
    stopStreaming
  ]);

  useEffect(() => {
    if (!chatId || !refreshSignal) {
      return;
    }

    if (chatStateRef.current.streaming) {
      return;
    }

    let cancelled = false;
    loadChat({ baseUrl: backendUrl, chatId })
      .unwrap()
      .then((data) => {
        if (cancelled) {
          return;
        }

        runtimeRef.current = createRuntimeMaps();
        const emptyState = createEmptyChatState();
        chatStateRef.current = emptyState;
        activeFrontendToolRef.current = null;
        setChatState(emptyState);
        setChatImageTokenSafe(String(data?.chatImageToken || ''));

        const events = Array.isArray(data?.events) ? data.events : [];
        events.forEach((event) => applyEvent(event, 'history'));
      })
      .catch(() => {
        // ignore background refresh failure
      });

    return () => {
      cancelled = true;
    };
  }, [applyEvent, backendUrl, chatId, loadChat, refreshSignal, setChatImageTokenSafe]);

  const listExtraData = useMemo(
    () => ({
      expandedTools: chatState.expandedTools,
      chatImageToken
    }),
    [chatImageToken, chatState.expandedTools]
  );

  const renderTimelineItem = useCallback(
    ({ item }: { item: TimelineEntry }) => (
      <TimelineEntryRow
        item={item}
        theme={theme}
        contentWidth={contentWidth}
        backendUrl={backendUrl}
        chatImageToken={chatImageToken}
        onToggleTool={handleToggleToolExpanded}
        toolExpanded={Boolean(chatState.expandedTools[item.id])}
        onToggleReasoning={handleToggleReasoning}
        onCopyText={handleCopyText}
        onImageAuthError={handleMarkdownImageTokenError}
      />
    ),
    [
      backendUrl,
      chatImageToken,
      chatState.expandedTools,
      contentWidth,
      handleCopyText,
      handleMarkdownImageTokenError,
      handleToggleReasoning,
      handleToggleToolExpanded,
      theme
    ]
  );

  useEffect(() => {
    return () => {
      stopStreaming();
      clearReasoningTimers();
      clearStreamIdleTimer();
      clearToolInitTimers(true);
      if (planCollapseTimerRef.current) {
        clearTimeout(planCollapseTimerRef.current);
        planCollapseTimerRef.current = null;
      }

      if (copyToastTimer.current) {
        clearTimeout(copyToastTimer.current);
        copyToastTimer.current = null;
      }
      if (edgeToastTimerRef.current) {
        clearTimeout(edgeToastTimerRef.current);
        edgeToastTimerRef.current = null;
      }
      setEdgeToast(null);
      if (fireworksTimerRef.current) {
        clearTimeout(fireworksTimerRef.current);
        fireworksTimerRef.current = null;
      }
      if (malformedStatusClearTimerRef.current) {
        clearTimeout(malformedStatusClearTimerRef.current);
        malformedStatusClearTimerRef.current = null;
      }
      if (scrollableStabilizationTimerRef.current) {
        clearTimeout(scrollableStabilizationTimerRef.current);
        scrollableStabilizationTimerRef.current = null;
      }
    };
  }, [clearReasoningTimers, clearStreamIdleTimer, clearToolInitTimers, stopStreaming]);

  const contentTransformStyle = useMemo(() => {
    const DEAD_ZONE = 18;
    if (createChatSwipeDistance > DEAD_ZONE) {
      const raw = (createChatSwipeDistance - DEAD_ZONE) * 0.4;
      return { transform: [{ translateX: Math.min(raw, 52) }] };
    }
    if (switchPrevSwipeDistance > DEAD_ZONE) {
      const raw = (switchPrevSwipeDistance - DEAD_ZONE) * 0.8;
      const maxPullDown = Math.max(insets.top + 44, 72);
      return { transform: [{ translateY: Math.min(raw, maxPullDown) }] };
    }
    if (switchNextSwipeDistance > DEAD_ZONE) {
      const raw = (switchNextSwipeDistance - DEAD_ZONE) * 0.8;
      const maxPullUp = Math.max(insets.bottom + 60, 80);
      return { transform: [{ translateY: -Math.min(raw, maxPullUp) }] };
    }
    return undefined;
  }, [createChatSwipeDistance, switchPrevSwipeDistance, switchNextSwipeDistance, insets.top, insets.bottom]);

  const contentPushTranslateX = useMemo(
    () => contentPushAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -drawerWidthPx],
      extrapolate: 'clamp',
    }),
    [contentPushAnim, drawerWidthPx]
  );


  return (
    <View style={styles.container} nativeID="chat-screen-root" testID="chat-screen-root">
      {/* ---- 推挤层：左滑时整体向左位移 ---- */}
      <Animated.View style={[styles.contentPushLayer, { transform: [{ translateX: contentPushTranslateX }] }]}>
      {/* ---- 背景提示层（zIndex: 0，被 contentWrap 遮住）---- */}
      {createChatSwipeDistance > 0 ? (
        <View pointerEvents="none" style={styles.createChatHintBehind}>
          <View style={[styles.createChatHintBehindCard, { opacity: createChatRevealProgress }]}>
            {'新建对话'.split('').map((char, i) => (
              <Text key={i} style={[styles.createChatHintBehindChar, { color: theme.textSoft }]}>
                {char}
              </Text>
            ))}
          </View>
        </View>
      ) : null}
      {switchPrevSwipeDistance > 0 ? (
        <View
          pointerEvents="none"
          style={[styles.switchPrevHintBehind, { top: insets.top - 2 }]}
          testID="switch-prev-hint-layer"
        >
          <View
            style={[
              styles.switchHintCard,
              {
                backgroundColor: theme.surfaceStrong,
                borderColor: theme.border,
                opacity: switchPrevRevealProgress
              }
            ]}
          >
            <Text style={[styles.switchHintArrow, { color: theme.textSoft }]}>↑</Text>
            <Text style={[styles.switchHintText, { color: theme.text }]}>上一条对话</Text>
          </View>
        </View>
      ) : null}
      {switchNextSwipeDistance > 0 ? (
        <View
          pointerEvents="none"
          style={[styles.switchNextHintBehind, { bottom: composerBottomPadding + 4 }]}
          testID="switch-next-hint-layer"
        >
          <View
            style={[
              styles.switchHintCard,
              {
                backgroundColor: theme.surfaceStrong,
                borderColor: theme.border,
                opacity: switchNextRevealProgress
              }
            ]}
          >
            <Text style={[styles.switchHintText, { color: theme.text }]}>下一条对话</Text>
            <Text style={[styles.switchHintArrow, { color: theme.textSoft }]}>↓</Text>
          </View>
        </View>
      ) : null}

      {/* ---- 内容层（带背景色 + 手势位移）---- */}
      <View style={[styles.contentWrap, { backgroundColor: theme.surface }, contentTransformStyle]}>
        <View style={styles.timelineGestureLayer} {...timelineGestureResponder.panHandlers} testID="chat-timeline-gesture-layer">
          <FlatList
            ref={listRef}
            data={chatState.timeline}
            extraData={listExtraData}
            removeClippedSubviews={false}
            nestedScrollEnabled={Platform.OS === 'android'}
            keyboardShouldPersistTaps="handled"
            bounces={isTimelineScrollable}
            alwaysBounceVertical={isTimelineScrollable}
            keyExtractor={(item) => item.id}
            style={styles.timelineList}
            contentContainerStyle={[styles.timelineContent, chatState.timeline.length === 0 ? styles.timelineContentEmpty : null]}
            onScroll={(event) => {
              const native = event.nativeEvent;
              syncListMetrics(
                native.contentOffset.y,
                native.layoutMeasurement.height,
                native.contentSize.height,
                { fromScroll: true }
              );
            }}
            onLayout={(event) => {
              syncListMetrics(listOffsetYRef.current, event.nativeEvent.layout.height, listContentHeightRef.current);
            }}
            onContentSizeChange={(width, height) => {
              void width;
              syncListMetrics(listOffsetYRef.current, listViewportHeightRef.current, height);
            }}
            scrollEventThrottle={16}
            nativeID="chat-timeline-list"
            testID="chat-timeline-list"
            renderItem={renderTimelineItem}
            ListEmptyComponent={
              <View style={[styles.emptyPanel, { backgroundColor: theme.surfaceStrong }]}>
                <Text style={[styles.emptyTitle, { color: theme.text }]}>开始一个完整对话</Text>
                <Text style={[styles.emptySubTitle, { color: theme.textSoft }]}>先在对话列表选择会话，或直接发送消息开始。</Text>
              </View>
            }
          />
        </View>

      {!hasActiveFrontendTool ? (
        <View style={[styles.composerOuter, { paddingBottom: composerBottomPadding }]}>
          {hasPlanTasks ? (
            <View style={[styles.planFloatWrap, { shadowColor: theme.shadow }]}>
              {isTimelineScrollable && !autoScrollEnabled && chatState.timeline.length ? (
                <View style={styles.scrollToBottomAbovePlan}>
                  <TouchableOpacity
                    activeOpacity={0.86}
                    onPress={() => scrollToBottom(true)}
                    testID="scroll-to-bottom-btn"
                    style={[styles.scrollToBottomBtn, { backgroundColor: theme.surfaceStrong, borderColor: theme.border }]}
                  >
                    <Text style={[styles.scrollToBottomText, { color: theme.text }]}>↓</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <TouchableOpacity
                activeOpacity={0.84}
                onPress={() => {
                  if (planCollapseTimerRef.current) {
                    clearTimeout(planCollapseTimerRef.current);
                    planCollapseTimerRef.current = null;
                  }
                  setPlanExpanded((prev) => !prev);
                }}
                testID="plan-toggle-btn"
                style={[
                  styles.planCard,
                  planExpanded
                    ? { backgroundColor: theme.surfaceStrong, borderColor: theme.border }
                    : { backgroundColor: theme.primarySoft, borderColor: theme.borderStrong }
                ]}
              >
                {planExpanded ? (
                <View>
                  <View style={[styles.planHead, { backgroundColor: theme.primarySoft, borderColor: theme.borderStrong }]}>
                    <Text style={[styles.planTitle, { color: theme.primaryDeep }]}>
                      {`任务列表 ${planProgress.current}/${planProgress.total}`}
                    </Text>
                    <Text style={[styles.planHint, { color: theme.textMute }]}>
                      点击收起
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
                  <Text style={[styles.planCollapsedText, { color: theme.primaryDeep }]} numberOfLines={1}>
                    {`${planProgress.current}/${planProgress.total}` + (cleanedPlanTasks.length ? ` · ${cleanedPlanTasks[cleanedPlanTasks.length - 1].cleanedDescription}` : '')}
                  </Text>
                </View>
              )}
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.composerLayer}>
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
              activeFrontendTool={null}
              frontendToolBaseUrl={backendUrl}
              frontendToolWebViewRef={frontendToolWebViewRef}
              onFrontendToolMessage={handleFrontendToolMessage}
              onFrontendToolLoad={handleFrontendToolWebViewLoad}
              onFrontendToolRetry={handleFrontendToolRetry}
              onNativeConfirmSubmit={submitActiveFrontendTool}
            />

            {!hasPlanTasks && isTimelineScrollable && !autoScrollEnabled && chatState.timeline.length ? (
              <View style={styles.scrollToBottomAboveComposer}>
                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={() => scrollToBottom(true)}
                  testID="scroll-to-bottom-btn"
                  style={[styles.scrollToBottomBtn, { backgroundColor: theme.surfaceStrong, borderColor: theme.border }]}
                >
                  <Text style={[styles.scrollToBottomText, { color: theme.text }]}>↓</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
      </View>
      </Animated.View>

      {/* ---- 浮层 ---- */}
      {edgeToast ? (
        <View
          pointerEvents="none"
          style={[
            styles.edgeToastWrap,
            edgeToast.placement === 'top'
              ? { top: Math.max(insets.top + 10, 12) }
              : { bottom: Math.max(composerBottomPadding + 86, insets.bottom + 72) }
          ]}
          testID={edgeToast.placement === 'top' ? 'chat-edge-toast-top' : 'chat-edge-toast-bottom'}
        >
          <View style={[styles.edgeToastCard, { backgroundColor: theme.surfaceStrong, borderColor: theme.border }]}>
            <Text style={[styles.edgeToastText, { color: theme.textSoft }]}>{edgeToast.message}</Text>
          </View>
        </View>
      ) : null}

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

      {frontendToolOverlayMounted ? (
        <Animated.View
          pointerEvents={hasActiveFrontendTool ? 'auto' : 'none'}
          style={styles.frontendToolOverlay}
          testID="frontend-tool-overlay"
        >
          <Animated.View
            style={[styles.frontendToolOverlayMask, { backgroundColor: theme.overlay, opacity: frontendToolOverlayAnim }]}
            testID="frontend-tool-overlay-mask"
          />
          <Animated.View
            style={[
              styles.frontendToolOverlaySheetWrap,
              {
                paddingBottom: composerBottomPadding,
                opacity: frontendToolSheetOpacity,
                transform: [{ translateY: frontendToolSheetTranslateY }]
              }
            ]}
            testID="frontend-tool-overlay-sheet"
          >
            {hasActiveFrontendTool ? (
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
                frontendToolBaseUrl={backendUrl}
                frontendToolWebViewRef={frontendToolWebViewRef}
                onFrontendToolMessage={handleFrontendToolMessage}
                onFrontendToolLoad={handleFrontendToolWebViewLoad}
                onFrontendToolRetry={handleFrontendToolRetry}
                onNativeConfirmSubmit={submitActiveFrontendTool}
              />
            ) : null}
          </Animated.View>
        </Animated.View>
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
  contentPushLayer: {
    flex: 1
  },
  contentWrap: {
    flex: 1,
    zIndex: 1
  },
  timelineGestureLayer: {
    flex: 1
  },
  createChatHintBehind: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 52,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 0
  },
  createChatHintBehindCard: {
    alignItems: 'center',
    gap: 2
  },
  createChatHintBehindChar: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20
  },
  switchPrevHintBehind: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 0
  },
  switchNextHintBehind: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 0
  },
  switchHintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 7
  },
  switchHintText: {
    fontSize: 12,
    fontWeight: '700'
  },
  switchHintArrow: {
    fontSize: 14,
    fontWeight: '700'
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
  composerLayer: {
    position: 'relative'
  },
  frontendToolOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 6
  },
  frontendToolOverlayMask: {
    ...StyleSheet.absoluteFillObject
  },
  frontendToolOverlaySheetWrap: {
    paddingTop: 4
  },
  scrollToBottomAbovePlan: {
    position: 'absolute',
    left: '50%',
    marginLeft: -22,
    top: -54,
    zIndex: 4
  },
  scrollToBottomAboveComposer: {
    position: 'absolute',
    left: '50%',
    marginLeft: -22,
    top: -54,
    zIndex: 4
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
    position: 'relative',
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
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  planTitle: {
    fontWeight: '700',
    fontSize: 14
  },
  planHint: {
    fontSize: 10,
    fontWeight: '500'
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
    paddingVertical: 7,
    zIndex: 3
  },
  copyToastText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600'
  },
  edgeToastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 7
  },
  edgeToastCard: {
    maxWidth: '84%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  edgeToastText: {
    fontSize: 12,
    fontWeight: '600'
  },
  fireworksLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3
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
