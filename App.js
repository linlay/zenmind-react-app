import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const STORAGE_KEY = 'agw_mobile_chat_settings_v1';
const DEFAULT_ENDPOINT_INPUT = 'agw.linlay.cc';
const DRAWER_WIDTH = 328;

const FONT_SANS = Platform.select({
  ios: 'Avenir Next',
  android: 'sans-serif',
  default: 'system-ui'
});

const FONT_MONO = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace'
});

const THEMES = {
  light: {
    mode: 'light',
    gradient: ['#f8fbff', '#eef3fb', '#e9eff9'],
    bgCircleA: 'rgba(47, 108, 243, 0.18)',
    bgCircleB: 'rgba(79, 146, 255, 0.12)',
    surface: '#fbfcff',
    surfaceStrong: '#ffffff',
    surfaceSoft: '#f1f5fd',
    border: '#d4dfef',
    borderStrong: '#b9cbe5',
    text: '#27334a',
    textSoft: '#60728f',
    textMute: '#8d9bb2',
    primary: '#2f6cf3',
    primaryDeep: '#1f54c7',
    primarySoft: 'rgba(47, 108, 243, 0.13)',
    userBubble: ['#3b77f5', '#2a60dc'],
    assistantBubble: '#ffffff',
    systemBubble: '#fff1f1',
    timelineDot: '#7ea6ff',
    ok: '#1fa06c',
    warn: '#cc8c2f',
    danger: '#d65252',
    shadow: 'rgba(25, 49, 88, 0.14)',
    overlay: 'rgba(12, 22, 38, 0.34)',
    sendIcon: '#ffffff'
  },
  dark: {
    mode: 'dark',
    gradient: ['#0c1626', '#0f1b2f', '#10203a'],
    bgCircleA: 'rgba(89, 143, 255, 0.22)',
    bgCircleB: 'rgba(48, 104, 225, 0.18)',
    surface: '#14253f',
    surfaceStrong: '#182b49',
    surfaceSoft: '#1f3455',
    border: '#2f4b73',
    borderStrong: '#426193',
    text: '#ecf2ff',
    textSoft: '#b8caea',
    textMute: '#8ea8cf',
    primary: '#78a0ff',
    primaryDeep: '#5f89eb',
    primarySoft: 'rgba(120, 160, 255, 0.16)',
    userBubble: ['#5d84eb', '#4067cf'],
    assistantBubble: '#1a2d4c',
    systemBubble: '#3a2530',
    timelineDot: '#90b0ff',
    ok: '#34c88e',
    warn: '#e0ab58',
    danger: '#f17979',
    shadow: 'rgba(0, 0, 0, 0.38)',
    overlay: 'rgba(2, 7, 16, 0.62)',
    sendIcon: '#f5f8ff'
  }
};

function normalizeEndpointInput(raw) {
  const text = String(raw || '').trim().replace(/\/+$/, '');
  return text || DEFAULT_ENDPOINT_INPUT;
}

function looksLikeLocalAddress(host) {
  const value = String(host || '').toLowerCase();
  if (!value) {
    return false;
  }

  if (
    value.startsWith('localhost') ||
    value.startsWith('127.') ||
    value.startsWith('10.') ||
    value.startsWith('192.168.')
  ) {
    return true;
  }

  const match172 = value.match(/^172\.(\d{1,2})\./);
  if (match172) {
    const second = Number(match172[1]);
    if (second >= 16 && second <= 31) {
      return true;
    }
  }

  return /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/.test(value);
}

function toBackendBaseUrl(endpointInput) {
  const normalized = normalizeEndpointInput(endpointInput);
  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  const scheme = looksLikeLocalAddress(normalized) ? 'http' : 'https';
  return `${scheme}://${normalized}`;
}

function createRequestId(prefix = 'mobile') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatError(error) {
  const message = String(error?.message || 'unknown error');
  if (message.toLowerCase().includes('network request failed')) {
    return `${message}（请确认域名/IP 可访问，并且手机可连接后端）`;
  }
  return message;
}

function getAgentKey(agent) {
  if (!agent || typeof agent !== 'object') {
    return '';
  }
  return String(agent.key || agent.id || '').trim();
}

function getAgentName(agent) {
  if (!agent || typeof agent !== 'object') {
    return '';
  }
  return String(agent.name || getAgentKey(agent) || '').trim();
}

function getChatTitle(chat) {
  if (!chat || typeof chat !== 'object') {
    return '';
  }
  return String(chat.chatName || chat.title || chat.chatId || '').trim();
}

function getChatTimestamp(chat) {
  if (!chat || typeof chat !== 'object') {
    return Date.now();
  }

  const values = [chat.updatedAt, chat.updateTime, chat.createdAt, chat.timestamp];
  for (const value of values) {
    if (!value) {
      continue;
    }
    const ms = new Date(value).getTime();
    if (!Number.isNaN(ms)) {
      return ms;
    }
  }

  return Date.now();
}

function toHHMM(input) {
  if (!input) {
    return '';
  }

  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function parseApiEnvelope(response, bodyText) {
  let json;
  try {
    json = bodyText ? JSON.parse(bodyText) : null;
  } catch (_error) {
    throw new Error(`Invalid JSON response: ${bodyText.slice(0, 180)}`);
  }

  if (!response.ok) {
    throw new Error(json?.msg || `HTTP ${response.status}`);
  }

  if (!json || typeof json !== 'object' || json.code !== 0) {
    throw new Error(json?.msg || 'API returned non-zero code');
  }

  return json.data;
}

async function fetchApiJson(baseUrl, path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const bodyText = await response.text();
  return parseApiEnvelope(response, bodyText);
}

function parseSseBlock(block, onJsonEvent) {
  const lines = block.split(/\r?\n/);
  const dataLines = [];

  for (const line of lines) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (!dataLines.length) {
    return;
  }

  const payload = dataLines.join('\n').trim();
  if (!payload || payload === '[DONE]') {
    return;
  }

  try {
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === 'object') {
      onJsonEvent(parsed);
    }
  } catch (_error) {
    // Ignore malformed frame.
  }
}

async function consumeJsonSse(response, onJsonEvent, signal) {
  const body = response.body;
  if (body && typeof body.getReader === 'function') {
    const reader = body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      if (signal?.aborted) {
        throw new Error('request aborted');
      }

      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split(/\n\n/);
      buffer = chunks.pop() || '';
      for (const chunk of chunks) {
        parseSseBlock(chunk, onJsonEvent);
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      parseSseBlock(buffer, onJsonEvent);
    }
    return;
  }

  const text = await response.text();
  const chunks = text.split(/\n\n/);
  for (const chunk of chunks) {
    parseSseBlock(chunk, onJsonEvent);
  }
}

function renderToolLabel(event) {
  const toolName = String(event.toolName || '').trim();
  if (toolName) {
    return toolName;
  }

  const toolApi = String(event.toolApi || '').trim();
  if (toolApi) {
    return toolApi;
  }

  const toolId = String(event.toolId || '').trim();
  if (toolId) {
    return toolId;
  }

  return 'tool';
}

function clipToolResult(value) {
  if (value === undefined || value === null) {
    return '';
  }

  let text = '';
  if (typeof value === 'string') {
    text = value;
  } else {
    try {
      text = JSON.stringify(value);
    } catch (_error) {
      text = String(value);
    }
  }

  return text.length > 140 ? `${text.slice(0, 140)}...` : text;
}

function getToolTone(state) {
  if (state === 'done') {
    return 'ok';
  }
  if (state === 'failed') {
    return 'danger';
  }
  return 'warn';
}

function EntryRow({ item, styles, theme }) {
  const appear = useRef(new Animated.Value(0)).current;
  const seqMatch = String(item?.id || '').match(/:(\d+)$/);
  const seq = seqMatch ? Number(seqMatch[1]) : 0;
  const delay = Number.isFinite(seq) ? Math.min(120, seq * 8) : 0;

  useEffect(() => {
    Animated.timing(appear, {
      toValue: 1,
      duration: 210,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [appear, delay]);

  const enterStyle = {
    opacity: appear,
    transform: [
      {
        translateY: appear.interpolate({
          inputRange: [0, 1],
          outputRange: [6, 0]
        })
      },
      {
        scale: appear.interpolate({
          inputRange: [0, 1],
          outputRange: [0.985, 1]
        })
      }
    ]
  };

  if (item.kind === 'stage') {
    const stageToneStyle =
      item.tone === 'ok'
        ? { borderColor: theme.ok, color: theme.ok, backgroundColor: `${theme.ok}22` }
        : item.tone === 'error'
          ? { borderColor: theme.danger, color: theme.danger, backgroundColor: `${theme.danger}22` }
          : { borderColor: theme.borderStrong, color: theme.textSoft, backgroundColor: theme.surfaceSoft };

    return (
      <Animated.View style={[styles.stageWrap, enterStyle]}>
        <View style={[styles.stagePill, stageToneStyle]}>
          <Text style={[styles.stageText, { color: stageToneStyle.color }]}>{item.text}</Text>
        </View>
      </Animated.View>
    );
  }

  if (item.kind === 'tool') {
    const tone = getToolTone(item.state);
    const toneStyle =
      tone === 'ok'
        ? { borderColor: `${theme.ok}66`, color: theme.ok, bg: `${theme.ok}14` }
        : tone === 'danger'
          ? { borderColor: `${theme.danger}66`, color: theme.danger, bg: `${theme.danger}14` }
          : { borderColor: `${theme.warn}66`, color: theme.warn, bg: `${theme.warn}14` };

    return (
      <Animated.View style={[styles.toolRow, enterStyle]}>
        <View style={[styles.timelineDot, { backgroundColor: theme.timelineDot }]} />
        <View style={styles.toolBody}>
          <View style={[styles.toolChip, { borderColor: toneStyle.borderColor, backgroundColor: toneStyle.bg }]}>
            <Text style={[styles.toolChipText, { color: toneStyle.color }]}>call: _{item.label}_</Text>
          </View>
          {item.detail ? (
            <Text style={[styles.toolDetailText, { color: theme.textSoft }]} numberOfLines={2}>
              {item.detail}
            </Text>
          ) : null}
        </View>
      </Animated.View>
    );
  }

  const isUser = item.role === 'user';
  const isSystem = item.role === 'system';

  if (isUser) {
    return (
      <Animated.View style={[styles.userRow, enterStyle]}>
        <LinearGradient colors={theme.userBubble} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.userBubble}>
          <Text style={styles.userText}>{item.text}</Text>
          <Text style={styles.userTime}>{toHHMM(item.ts)}</Text>
        </LinearGradient>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.assistantRow, enterStyle]}>
      <View style={[styles.timelineDot, { backgroundColor: theme.timelineDot }]} />
      <View
        style={[
          styles.assistantBubble,
          {
            borderColor: isSystem ? `${theme.danger}8f` : theme.border,
            backgroundColor: isSystem ? theme.systemBubble : theme.assistantBubble
          }
        ]}
      >
        <Text style={[styles.assistantText, { color: theme.text }]}>{item.text}</Text>
        <Text style={[styles.assistantTime, { color: theme.textMute }]}>{toHHMM(item.ts)}</Text>
      </View>
    </Animated.View>
  );
}

function AppContent() {
  const insets = useSafeAreaInsets();

  const [booting, setBooting] = useState(true);
  const [themeMode, setThemeMode] = useState('light');
  const [endpointInput, setEndpointInput] = useState(DEFAULT_ENDPOINT_INPUT);
  const [endpointDraft, setEndpointDraft] = useState(DEFAULT_ENDPOINT_INPUT);
  const [agents, setAgents] = useState([]);
  const [selectedAgentKey, setSelectedAgentKey] = useState('');
  const [chats, setChats] = useState([]);
  const [chatKeyword, setChatKeyword] = useState('');
  const [chatId, setChatId] = useState('');
  const [timeline, setTimeline] = useState([]);
  const [composerText, setComposerText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statusText, setStatusText] = useState('初始化中...');
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);

  const theme = THEMES[themeMode] || THEMES.light;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const backendUrl = useMemo(() => toBackendBaseUrl(endpointInput), [endpointInput]);

  const listRef = useRef(null);
  const abortControllerRef = useRef(null);
  const sequenceRef = useRef(0);
  const contentIdMapRef = useRef(new Map());
  const toolIdMapRef = useRef(new Map());
  const drawerAnim = useRef(new Animated.Value(0)).current;
  const sendScale = useRef(new Animated.Value(1)).current;

  const nextId = useCallback((prefix) => {
    sequenceRef.current += 1;
    return `${prefix}:${sequenceRef.current}`;
  }, []);

  const resetTimeline = useCallback(() => {
    sequenceRef.current = 0;
    contentIdMapRef.current = new Map();
    toolIdMapRef.current = new Map();
    setTimeline([]);
  }, []);

  const persistSettings = useCallback(async (partial = {}) => {
    try {
      const payload = {
        themeMode,
        endpointInput,
        selectedAgentKey,
        ...partial
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (_error) {
      // Ignore persistence failures silently.
    }
  }, [endpointInput, selectedAgentKey, themeMode]);

  const upsertEntry = useCallback((id, builder) => {
    setTimeline((prev) => {
      const index = prev.findIndex((entry) => entry.id === id);
      if (index === -1) {
        return [...prev, builder(null)];
      }

      const next = [...prev];
      next[index] = builder(next[index]);
      return next;
    });
  }, []);

  const appendEntry = useCallback((entry) => {
    setTimeline((prev) => [...prev, entry]);
  }, []);

  const applyEvent = useCallback((event, source = 'live') => {
    if (!event || typeof event !== 'object') {
      return;
    }

    if (event.chatId) {
      setChatId(String(event.chatId));
    }

    const ts = event.timestamp || Date.now();
    const type = String(event.type || '');

    if (type === 'request.query') {
      const requestId = String(event.requestId || nextId('request'));
      const itemId = `message:user:${requestId}`;
      upsertEntry(itemId, (old) => ({
        ...(old || {}),
        id: itemId,
        kind: 'message',
        role: 'user',
        text: String(event.message || ''),
        ts
      }));
      return;
    }

    if (type === 'run.start') {
      if (source === 'live') {
        appendEntry({ id: nextId('stage'), kind: 'stage', tone: 'normal', text: '正在生成回答...', ts });
      }
      setStatusText('助手正在处理中...');
      return;
    }

    if (type === 'run.complete') {
      setStreaming(false);
      if (source === 'live') {
        appendEntry({ id: nextId('stage'), kind: 'stage', tone: 'ok', text: '本轮会话已完成', ts });
      }
      setStatusText('回答完成');
      return;
    }

    if (type === 'run.cancel') {
      setStreaming(false);
      appendEntry({ id: nextId('stage'), kind: 'stage', tone: 'error', text: '会话已取消', ts });
      setStatusText('已取消');
      return;
    }

    if (type === 'run.error') {
      setStreaming(false);
      const message = `run.error: ${JSON.stringify(event.error || {}, null, 2)}`;
      appendEntry({
        id: nextId('system'),
        kind: 'message',
        role: 'system',
        text: message,
        ts
      });
      setStatusText('运行失败');
      return;
    }

    if ((type === 'tool.start' || type === 'tool.snapshot') && event.toolId) {
      const toolId = String(event.toolId);
      let itemId = toolIdMapRef.current.get(toolId);
      if (!itemId) {
        itemId = nextId('tool');
        toolIdMapRef.current.set(toolId, itemId);
      }

      upsertEntry(itemId, (old) => ({
        ...(old || {}),
        id: itemId,
        kind: 'tool',
        label: renderToolLabel(event),
        detail: old?.detail || '',
        state: 'running',
        ts
      }));
      return;
    }

    if ((type === 'tool.result' || type === 'tool.end') && event.toolId) {
      const toolId = String(event.toolId);
      let itemId = toolIdMapRef.current.get(toolId);
      if (!itemId) {
        itemId = nextId('tool');
        toolIdMapRef.current.set(toolId, itemId);
      }

      const detail = type === 'tool.result'
        ? clipToolResult(Object.prototype.hasOwnProperty.call(event, 'result') ? event.result : (event.output ?? event.text))
        : '';

      upsertEntry(itemId, (old) => ({
        ...(old || {}),
        id: itemId,
        kind: 'tool',
        label: old?.label || renderToolLabel(event),
        detail: detail || old?.detail || '',
        state: event.error ? 'failed' : 'done',
        ts
      }));
      return;
    }

    if ((type === 'content.start' || type === 'content.delta' || type === 'content.snapshot' || type === 'content.end') && event.contentId) {
      const contentId = String(event.contentId);
      let itemId = contentIdMapRef.current.get(contentId);
      if (!itemId) {
        itemId = nextId('assistant');
        contentIdMapRef.current.set(contentId, itemId);
      }

      if (type === 'content.delta') {
        upsertEntry(itemId, (old) => ({
          ...(old || {}),
          id: itemId,
          kind: 'message',
          role: 'assistant',
          text: `${old?.text || ''}${String(event.delta || '')}`,
          ts
        }));
        return;
      }

      if (type === 'content.start') {
        upsertEntry(itemId, (old) => ({
          ...(old || {}),
          id: itemId,
          kind: 'message',
          role: 'assistant',
          text: String(event.text || ''),
          ts
        }));
        return;
      }

      const nextText = typeof event.text === 'string' ? event.text : '';
      if (nextText || source === 'history') {
        upsertEntry(itemId, (old) => ({
          ...(old || {}),
          id: itemId,
          kind: 'message',
          role: 'assistant',
          text: nextText,
          ts
        }));
      }
    }
  }, [appendEntry, nextId, upsertEntry]);

  const stopStreaming = useCallback((reason = '已停止') => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStreaming(false);
    setStatusText(reason);
  }, []);

  const refreshAgents = useCallback(async (base = backendUrl, silent = false) => {
    if (!silent) {
      setLoadingAgents(true);
    }

    try {
      const data = await fetchApiJson(base, '/api/agents');
      const list = Array.isArray(data) ? data : [];
      setAgents(list);
      setSelectedAgentKey((current) => {
        if (current && list.some((item) => getAgentKey(item) === current)) {
          return current;
        }
        return getAgentKey(list[0]) || '';
      });
      if (!silent) {
        setStatusText(`已加载 ${list.length} 个 Agent`);
      }
    } catch (error) {
      setStatusText(`Agent 加载失败：${formatError(error)}`);
    } finally {
      if (!silent) {
        setLoadingAgents(false);
      }
    }
  }, [backendUrl]);

  const refreshChats = useCallback(async (base = backendUrl, silent = false) => {
    if (!silent) {
      setLoadingChats(true);
    }

    try {
      const data = await fetchApiJson(base, '/api/chats');
      const list = Array.isArray(data) ? data : [];
      setChats(list);
      if (!silent) {
        setStatusText(`会话列表已更新 (${list.length})`);
      }
    } catch (error) {
      setStatusText(`会话列表加载失败：${formatError(error)}`);
    } finally {
      if (!silent) {
        setLoadingChats(false);
      }
    }
  }, [backendUrl]);

  const refreshAll = useCallback(async (base = backendUrl, silent = false) => {
    await Promise.all([refreshAgents(base, silent), refreshChats(base, silent)]);
  }, [backendUrl, refreshAgents, refreshChats]);

  const loadChat = useCallback(async (targetChatId) => {
    const id = String(targetChatId || '').trim();
    if (!id) {
      return;
    }

    stopStreaming('会话切换中...');
    resetTimeline();

    try {
      const query = `?chatId=${encodeURIComponent(id)}`;
      const data = await fetchApiJson(backendUrl, `/api/chat${query}`);
      const events = Array.isArray(data?.events) ? data.events : [];
      for (const event of events) {
        applyEvent(event, 'history');
      }
      setChatId(id);
      setDrawerOpen(false);
      setStatusText(`会话已载入：${id}`);
    } catch (error) {
      setStatusText(`会话载入失败：${formatError(error)}`);
    }
  }, [applyEvent, backendUrl, resetTimeline, stopStreaming]);

  const startNewChat = useCallback(() => {
    stopStreaming('新会话已就绪');
    setChatId('');
    setDrawerOpen(false);
    resetTimeline();
  }, [resetTimeline, stopStreaming]);

  const sendMessage = useCallback(async () => {
    const message = String(composerText || '').trim();
    if (!message) {
      return;
    }

    if (streaming) {
      setStatusText('已有进行中的回答，请先停止');
      return;
    }

    const agentKey = selectedAgentKey || getAgentKey(agents[0]);
    if (!agentKey) {
      setStatusText('请先选择 Agent');
      return;
    }

    setComposerText('');

    const requestId = createRequestId('mobile');
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
    setStreaming(true);
    setStatusText(`@${agentKey} 正在回复中...`);

    try {
      const response = await fetch(`${backendUrl}/api/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        signal: controller.signal,
        body: JSON.stringify({
          requestId,
          chatId: chatId || undefined,
          message,
          agentKey,
          role: 'user',
          stream: true
        })
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`HTTP ${response.status}: ${detail.slice(0, 220)}`);
      }

      await consumeJsonSse(
        response,
        (event) => {
          applyEvent(event, 'live');
        },
        controller.signal
      );

      setStatusText('本轮回答结束');
      refreshChats(backendUrl, true);
    } catch (error) {
      if (controller.signal.aborted) {
        setStatusText('已停止');
      } else {
        appendEntry({
          id: nextId('system'),
          kind: 'message',
          role: 'system',
          text: formatError(error),
          ts: Date.now()
        });
        setStatusText('请求失败');
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setStreaming(false);
    }
  }, [agents, applyEvent, appendEntry, backendUrl, chatId, composerText, nextId, refreshChats, selectedAgentKey, streaming]);

  const applyEndpoint = useCallback(async () => {
    const normalized = normalizeEndpointInput(endpointDraft);
    const nextBase = toBackendBaseUrl(normalized);
    setEndpointInput(normalized);
    setEndpointDraft(normalized);
    setStatusText(`正在连接 ${nextBase} ...`);
    await persistSettings({ endpointInput: normalized });
    refreshAll(nextBase);
  }, [endpointDraft, persistSettings, refreshAll]);

  const openSettingsFromTop = useCallback(() => {
    setDrawerOpen(true);
    setSettingsOpen(true);
  }, []);

  const pressSendScale = useCallback((toValue) => {
    Animated.spring(sendScale, {
      toValue,
      useNativeDriver: true,
      speed: 36,
      bounciness: 5
    }).start();
  }, [sendScale]);

  const toggleTheme = useCallback(async () => {
    const next = themeMode === 'light' ? 'dark' : 'light';
    setThemeMode(next);
    await persistSettings({ themeMode: next });
  }, [persistSettings, themeMode]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        if (!mounted) {
          return;
        }

        const savedTheme = parsed?.themeMode === 'dark' ? 'dark' : 'light';
        const savedEndpoint = normalizeEndpointInput(parsed?.endpointInput || DEFAULT_ENDPOINT_INPUT);
        const savedAgent = String(parsed?.selectedAgentKey || '');

        setThemeMode(savedTheme);
        setEndpointInput(savedEndpoint);
        setEndpointDraft(savedEndpoint);
        setSelectedAgentKey(savedAgent);
      } catch (_error) {
        if (!mounted) {
          return;
        }
        setThemeMode('light');
        setEndpointInput(DEFAULT_ENDPOINT_INPUT);
        setEndpointDraft(DEFAULT_ENDPOINT_INPUT);
      } finally {
        if (mounted) {
          setBooting(false);
        }
      }
    })();

    return () => {
      mounted = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    Animated.timing(drawerAnim, {
      toValue: drawerOpen ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [drawerAnim, drawerOpen]);

  useEffect(() => {
    if (booting) {
      return;
    }

    persistSettings();
  }, [booting, endpointInput, persistSettings, selectedAgentKey, themeMode]);

  useEffect(() => {
    if (booting) {
      return;
    }

    refreshAll(backendUrl, true);
  }, [backendUrl, booting, refreshAll]);

  const tailSignature = useMemo(() => {
    if (!timeline.length) {
      return 'empty';
    }
    const last = timeline[timeline.length - 1];
    const body = `${last.text || ''}${last.detail || ''}${last.state || ''}`;
    return `${last.id}:${body.length}`;
  }, [timeline]);

  useEffect(() => {
    const timer = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 30);

    return () => clearTimeout(timer);
  }, [tailSignature]);

  const filteredChats = useMemo(() => {
    const keyword = chatKeyword.trim().toLowerCase();
    const sorted = [...chats].sort((a, b) => getChatTimestamp(b) - getChatTimestamp(a));
    if (!keyword) {
      return sorted;
    }

    return sorted.filter((chat) => {
      const haystack = `${chat.chatName || ''} ${chat.chatId || ''} ${chat.firstAgentKey || ''}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [chatKeyword, chats]);

  const drawerTranslateX = drawerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-DRAWER_WIDTH, 0]
  });

  const activeAgentName = useMemo(() => {
    const found = agents.find((agent) => getAgentKey(agent) === selectedAgentKey);
    return getAgentName(found || agents[0]) || 'AGW';
  }, [agents, selectedAgentKey]);

  const agentBadgeLetter = activeAgentName.trim().charAt(0).toUpperCase() || 'A';

  if (booting) {
    return (
      <SafeAreaView edges={['top']} style={styles.safeRoot}>
        <LinearGradient colors={theme.gradient} style={styles.gradientFill}>
          <View style={styles.bootWrap}>
            <View style={styles.bootCard}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={styles.bootText}>正在加载配置...</Text>
            </View>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeRoot}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />

      <LinearGradient colors={theme.gradient} style={styles.gradientFill}>
        <View pointerEvents="none" style={styles.bgDecorWrap}>
          <View style={[styles.bgCircleA, { backgroundColor: theme.bgCircleA }]} />
          <View style={[styles.bgCircleB, { backgroundColor: theme.bgCircleB }]} />
        </View>

        <KeyboardAvoidingView
          style={styles.shell}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
        >
          <View style={styles.topNav}>
            <TouchableOpacity activeOpacity={0.72} style={styles.navPillButton} onPress={() => setDrawerOpen(true)}>
              <Text style={styles.navPillButtonText}>会话</Text>
            </TouchableOpacity>

            <View style={styles.brandBlock}>
              <View style={styles.brandAvatarWrap}>
                <Text style={styles.brandAvatarText}>{agentBadgeLetter}</Text>
              </View>
              <Text style={styles.brandTitle}>AGW</Text>
            </View>

            <View style={styles.topActions}>
              <TouchableOpacity activeOpacity={0.72} style={styles.topActionBtn} onPress={openSettingsFromTop}>
                <Text style={styles.topActionText}>设置</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.72} style={styles.topActionBtn} onPress={toggleTheme}>
                <Text style={styles.topActionText}>{theme.mode === 'light' ? '夜间' : '日间'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.agentRailWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.agentRailContent}>
              {(agents.length ? agents : [{ key: '', name: '暂无 Agent' }]).map((agent) => {
                const key = getAgentKey(agent);
                const name = getAgentName(agent) || key || 'Agent';
                const selected = key && key === selectedAgentKey;
                return (
                  <TouchableOpacity
                    key={key || 'empty-agent'}
                    disabled={!key}
                    activeOpacity={0.78}
                    onPress={() => {
                      setSelectedAgentKey(key);
                      persistSettings({ selectedAgentKey: key });
                    }}
                    style={[
                      styles.agentPill,
                      {
                        borderColor: selected ? theme.primaryDeep : theme.border,
                        backgroundColor: selected ? theme.primarySoft : theme.surface
                      }
                    ]}
                  >
                    <Text style={[styles.agentPillText, { color: selected ? theme.primaryDeep : theme.textSoft }]}>{name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.statusBarCard}>
            <Text style={styles.statusText} numberOfLines={1}>
              {statusText}
            </Text>
            <Text style={styles.statusSubText} numberOfLines={1}>
              {chatId ? `chat: ${chatId}` : 'new chat'}
            </Text>
            {loadingAgents || loadingChats ? <ActivityIndicator size="small" color={theme.primary} /> : null}
          </View>

          <FlatList
            ref={listRef}
            data={timeline}
            keyExtractor={(item) => item.id}
            style={styles.timelineList}
            contentContainerStyle={[
              styles.timelineContent,
              timeline.length === 0 ? styles.timelineContentEmpty : null
            ]}
            renderItem={({ item }) => <EntryRow item={item} styles={styles} theme={theme} />}
            ListEmptyComponent={
              <View style={styles.emptyPanel}>
                <Text style={styles.emptyTitle}>开始一个完整对话</Text>
                <Text style={styles.emptySubTitle}>左上角打开历史会话，或者直接输入消息发起聊天。</Text>
              </View>
            }
          />

          <View style={[styles.composerOuter, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <View style={styles.composerCard}>
              <TextInput
                value={composerText}
                onChangeText={setComposerText}
                placeholder={streaming ? '正在流式输出中，可点击停止' : '回复消息...'}
                placeholderTextColor={theme.textMute}
                editable={!streaming}
                multiline
                style={styles.composerInput}
              />
              <View style={styles.composerActionRow}>
                {streaming ? (
                  <TouchableOpacity activeOpacity={0.78} style={styles.stopBtn} onPress={() => stopStreaming('已手动停止')}>
                    <Text style={styles.stopBtnText}>停止</Text>
                  </TouchableOpacity>
                ) : null}

                <Animated.View style={{ transform: [{ scale: sendScale }] }}>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={styles.sendBtn}
                    onPress={sendMessage}
                    onPressIn={() => pressSendScale(0.92)}
                    onPressOut={() => pressSendScale(1)}
                  >
                    <LinearGradient colors={[theme.primary, theme.primaryDeep]} style={styles.sendBtnGradient}>
                      <Text style={styles.sendBtnText}>↑</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>

        <View pointerEvents={drawerOpen ? 'auto' : 'none'} style={StyleSheet.absoluteFill}>
          <Animated.View style={[styles.drawerOverlay, { opacity: drawerAnim }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setDrawerOpen(false)} />
          </Animated.View>

          <Animated.View
            style={[
              styles.drawerPanel,
              {
                paddingTop: insets.top + 8,
                transform: [{ translateX: drawerTranslateX }]
              }
            ]}
          >
            <View style={styles.drawerHead}>
              <Text style={styles.drawerTitle}>聊天历史</Text>
              <TouchableOpacity activeOpacity={0.72} style={styles.drawerCloseBtn} onPress={() => setDrawerOpen(false)}>
                <Text style={styles.drawerCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.drawerActionRow}>
              <TouchableOpacity activeOpacity={0.74} style={styles.drawerActionBtn} onPress={startNewChat}>
                <Text style={styles.drawerActionText}>+ 新会话</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.74} style={styles.drawerActionBtn} onPress={() => refreshChats(backendUrl)}>
                <Text style={styles.drawerActionText}>刷新</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.74} style={styles.drawerActionBtn} onPress={() => setSettingsOpen((prev) => !prev)}>
                <Text style={styles.drawerActionText}>设置</Text>
              </TouchableOpacity>
            </View>

            {settingsOpen ? (
              <View style={styles.settingCard}>
                <Text style={styles.settingLabel}>后端域名 / IP</Text>
                <TextInput
                  value={endpointDraft}
                  onChangeText={setEndpointDraft}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="agw.linlay.cc 或 192.168.1.8:8080"
                  placeholderTextColor={theme.textMute}
                  style={styles.settingInput}
                />
                <Text style={styles.settingHint}>当前连接：{backendUrl}</Text>
                <TouchableOpacity activeOpacity={0.82} style={styles.settingApplyBtn} onPress={applyEndpoint}>
                  <LinearGradient colors={[theme.primary, theme.primaryDeep]} style={styles.settingApplyGradient}>
                    <Text style={styles.settingApplyText}>保存并重连</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : null}

            <TextInput
              value={chatKeyword}
              onChangeText={setChatKeyword}
              placeholder="搜索会话"
              placeholderTextColor={theme.textMute}
              style={styles.chatSearchInput}
            />

            <ScrollView style={styles.chatListWrap} contentContainerStyle={styles.chatListContent}>
              {filteredChats.length ? (
                filteredChats.map((chat, index) => {
                  const active = chat.chatId === chatId;
                  const title = getChatTitle(chat) || chat.chatId || '未命名会话';
                  const chatMetaParts = [];
                  if (chat.firstAgentKey) {
                    chatMetaParts.push(`@${chat.firstAgentKey}`);
                  }
                  if (chat.chatId) {
                    chatMetaParts.push(chat.chatId);
                  }
                  const chatMeta = chatMetaParts.join(' · ');
                  const itemKey = chat.chatId || `${title}:${index}`;

                  return (
                    <TouchableOpacity
                      key={itemKey}
                      activeOpacity={0.74}
                      style={[
                        styles.chatItem,
                        {
                          borderColor: active ? theme.primaryDeep : theme.border,
                          backgroundColor: active ? theme.primarySoft : theme.surfaceStrong
                        }
                      ]}
                      onPress={() => loadChat(chat.chatId)}
                    >
                      <Text style={styles.chatItemTitle} numberOfLines={1}>{title}</Text>
                      <Text style={styles.chatItemMeta} numberOfLines={1}>{chatMeta}</Text>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View style={styles.emptyHistoryCard}>
                  <Text style={styles.emptyHistoryText}>暂无历史会话</Text>
                </View>
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    safeRoot: {
      flex: 1,
      backgroundColor: theme.surface
    },
    gradientFill: {
      flex: 1
    },
    shell: {
      flex: 1
    },
    bgDecorWrap: {
      ...StyleSheet.absoluteFillObject
    },
    bgCircleA: {
      position: 'absolute',
      width: 270,
      height: 270,
      borderRadius: 135,
      top: -130,
      right: -50
    },
    bgCircleB: {
      position: 'absolute',
      width: 220,
      height: 220,
      borderRadius: 110,
      left: -90,
      bottom: 110
    },
    bootWrap: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center'
    },
    bootCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceStrong,
      paddingHorizontal: 16,
      paddingVertical: 12,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.11,
      shadowRadius: 12,
      elevation: 3
    },
    bootText: {
      color: theme.text,
      fontFamily: FONT_SANS,
      fontWeight: '700',
      fontSize: 15
    },
    topNav: {
      marginTop: 7,
      marginHorizontal: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingHorizontal: 9,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.07,
      shadowRadius: 10,
      elevation: 2
    },
    navPillButton: {
      height: 28,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.borderStrong,
      backgroundColor: theme.surfaceStrong,
      paddingHorizontal: 11,
      justifyContent: 'center',
      alignItems: 'center'
    },
    navPillButtonText: {
      color: theme.textSoft,
      fontFamily: FONT_SANS,
      fontWeight: '700',
      fontSize: 12
    },
    brandBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8
    },
    brandAvatarWrap: {
      width: 30,
      height: 30,
      borderRadius: 10,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center'
    },
    brandAvatarText: {
      color: '#ffffff',
      fontFamily: FONT_SANS,
      fontWeight: '800',
      fontSize: 14
    },
    brandTitle: {
      color: theme.text,
      fontFamily: FONT_SANS,
      fontWeight: '700',
      fontSize: 20,
      letterSpacing: 0.4
    },
    topActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7
    },
    topActionBtn: {
      height: 28,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.borderStrong,
      backgroundColor: theme.surfaceStrong,
      paddingHorizontal: 10,
      justifyContent: 'center',
      alignItems: 'center'
    },
    topActionText: {
      color: theme.textSoft,
      fontFamily: FONT_SANS,
      fontWeight: '700',
      fontSize: 12
    },
    agentRailWrap: {
      marginHorizontal: 12,
      marginTop: 7,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingVertical: 7
    },
    agentRailContent: {
      paddingHorizontal: 7,
      gap: 6,
      alignItems: 'center'
    },
    agentPill: {
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 11,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center'
    },
    agentPillText: {
      fontFamily: FONT_SANS,
      fontSize: 12,
      fontWeight: '700'
    },
    statusBarCard: {
      marginHorizontal: 12,
      marginTop: 7,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceStrong,
      minHeight: 40,
      paddingHorizontal: 11,
      paddingVertical: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8
    },
    statusText: {
      flex: 1,
      color: theme.textSoft,
      fontFamily: FONT_SANS,
      fontSize: 12,
      fontWeight: '600'
    },
    statusSubText: {
      maxWidth: 130,
      color: theme.textMute,
      fontFamily: FONT_MONO,
      fontSize: 11,
      fontWeight: '600'
    },
    timelineList: {
      flex: 1
    },
    timelineContent: {
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 12
    },
    timelineContentEmpty: {
      flexGrow: 1,
      justifyContent: 'center'
    },
    emptyPanel: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.borderStrong,
      borderStyle: 'dashed',
      backgroundColor: theme.surfaceStrong,
      paddingHorizontal: 18,
      paddingVertical: 20
    },
    emptyTitle: {
      color: theme.text,
      fontFamily: FONT_SANS,
      fontWeight: '700',
      fontSize: 16
    },
    emptySubTitle: {
      marginTop: 8,
      color: theme.textSoft,
      fontFamily: FONT_SANS,
      fontSize: 13,
      lineHeight: 20
    },
    stageWrap: {
      alignItems: 'center',
      marginBottom: 8
    },
    stagePill: {
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4
    },
    stageText: {
      fontFamily: FONT_SANS,
      fontWeight: '700',
      fontSize: 11,
      letterSpacing: 0.2
    },
    toolRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 8
    },
    timelineDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginTop: 10,
      marginRight: 7
    },
    toolBody: {
      flex: 1
    },
    toolChip: {
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3
    },
    toolChipText: {
      fontFamily: FONT_MONO,
      fontSize: 11,
      fontWeight: '700'
    },
    toolDetailText: {
      marginTop: 3,
      fontFamily: FONT_SANS,
      fontSize: 11,
      lineHeight: 17
    },
    userRow: {
      alignItems: 'flex-end',
      marginBottom: 8
    },
    userBubble: {
      maxWidth: '87%',
      borderRadius: 14,
      borderTopRightRadius: 8,
      paddingHorizontal: 11,
      paddingVertical: 8,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.14,
      shadowRadius: 10,
      elevation: 2
    },
    userText: {
      color: '#ffffff',
      fontFamily: FONT_SANS,
      fontSize: 14,
      lineHeight: 21,
      fontWeight: '600'
    },
    userTime: {
      marginTop: 5,
      color: 'rgba(255,255,255,0.83)',
      textAlign: 'right',
      fontFamily: FONT_MONO,
      fontSize: 11,
      fontWeight: '700'
    },
    assistantRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 8
    },
    assistantBubble: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 13,
      borderTopLeftRadius: 7,
      paddingHorizontal: 11,
      paddingVertical: 9,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 1
    },
    assistantText: {
      fontFamily: FONT_SANS,
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '500'
    },
    assistantTime: {
      marginTop: 5,
      textAlign: 'right',
      fontFamily: FONT_MONO,
      fontSize: 11,
      fontWeight: '700'
    },
    composerOuter: {
      paddingHorizontal: 12,
      paddingTop: 4
    },
    composerCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.borderStrong,
      backgroundColor: theme.surfaceStrong,
      padding: 9,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 2
    },
    composerInput: {
      minHeight: 44,
      maxHeight: 150,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      color: theme.text,
      fontFamily: FONT_SANS,
      fontSize: 15,
      lineHeight: 20,
      paddingHorizontal: 11,
      paddingVertical: 10,
      textAlignVertical: 'top'
    },
    composerActionRow: {
      marginTop: 8,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 10
    },
    stopBtn: {
      height: 32,
      paddingHorizontal: 13,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: `${theme.danger}85`,
      backgroundColor: `${theme.danger}14`,
      alignItems: 'center',
      justifyContent: 'center'
    },
    stopBtnText: {
      color: theme.danger,
      fontFamily: FONT_SANS,
      fontSize: 12,
      fontWeight: '700'
    },
    sendBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      overflow: 'hidden'
    },
    sendBtnGradient: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center'
    },
    sendBtnText: {
      color: theme.sendIcon,
      fontFamily: FONT_SANS,
      fontSize: 17,
      fontWeight: '800',
      marginTop: -2
    },
    drawerOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.overlay
    },
    drawerPanel: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: DRAWER_WIDTH,
      borderRightWidth: 1,
      borderRightColor: theme.borderStrong,
      backgroundColor: theme.surface,
      paddingHorizontal: 12,
      shadowColor: '#000000',
      shadowOffset: { width: 2, height: 0 },
      shadowOpacity: 0.25,
      shadowRadius: 15,
      elevation: 8
    },
    drawerHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between'
    },
    drawerTitle: {
      color: theme.text,
      fontFamily: FONT_SANS,
      fontSize: 20,
      fontWeight: '700'
    },
    drawerCloseBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: theme.borderStrong,
      backgroundColor: theme.surfaceStrong,
      alignItems: 'center',
      justifyContent: 'center'
    },
    drawerCloseText: {
      color: theme.textSoft,
      fontFamily: FONT_SANS,
      fontSize: 13,
      fontWeight: '700'
    },
    drawerActionRow: {
      marginTop: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7
    },
    drawerActionBtn: {
      flex: 1,
      height: 32,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.borderStrong,
      backgroundColor: theme.surfaceStrong,
      alignItems: 'center',
      justifyContent: 'center'
    },
    drawerActionText: {
      color: theme.textSoft,
      fontFamily: FONT_SANS,
      fontSize: 12,
      fontWeight: '700'
    },
    settingCard: {
      marginTop: 10,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: theme.borderStrong,
      backgroundColor: theme.surfaceStrong,
      padding: 10
    },
    settingLabel: {
      color: theme.text,
      fontFamily: FONT_SANS,
      fontSize: 13,
      fontWeight: '700'
    },
    settingInput: {
      marginTop: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      color: theme.text,
      fontFamily: FONT_MONO,
      fontSize: 13,
      paddingHorizontal: 10,
      height: 38
    },
    settingHint: {
      marginTop: 7,
      color: theme.textMute,
      fontFamily: FONT_SANS,
      fontSize: 11
    },
    settingApplyBtn: {
      marginTop: 10,
      height: 34,
      borderRadius: 10,
      overflow: 'hidden'
    },
    settingApplyGradient: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center'
    },
    settingApplyText: {
      color: '#ffffff',
      fontFamily: FONT_SANS,
      fontSize: 12,
      fontWeight: '700'
    },
    chatSearchInput: {
      marginTop: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.borderStrong,
      backgroundColor: theme.surfaceStrong,
      color: theme.text,
      fontFamily: FONT_SANS,
      fontSize: 13,
      paddingHorizontal: 10,
      height: 38
    },
    chatListWrap: {
      marginTop: 10,
      flex: 1
    },
    chatListContent: {
      paddingBottom: 22
    },
    chatItem: {
      borderRadius: 11,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 9,
      marginBottom: 7
    },
    chatItemTitle: {
      color: theme.text,
      fontFamily: FONT_SANS,
      fontSize: 14,
      fontWeight: '700'
    },
    chatItemMeta: {
      marginTop: 4,
      color: theme.textMute,
      fontFamily: FONT_MONO,
      fontSize: 11,
      fontWeight: '700'
    },
    emptyHistoryCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.borderStrong,
      borderStyle: 'dashed',
      paddingHorizontal: 12,
      paddingVertical: 16,
      alignItems: 'center'
    },
    emptyHistoryText: {
      color: theme.textMute,
      fontFamily: FONT_SANS,
      fontSize: 12,
      fontWeight: '600'
    }
  });
}
