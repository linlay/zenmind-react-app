import AsyncStorage from '@react-native-async-storage/async-storage';
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
const DRAWER_WIDTH = 320;

const THEME_PALETTES = {
  light: {
    page: '#f4f7ff',
    surface: '#ffffff',
    surfaceSoft: '#edf3ff',
    input: '#f7f9ff',
    border: '#d7e2f3',
    text: '#1f2d41',
    muted: '#647691',
    primary: '#2d67e8',
    primarySoft: '#e3ecff',
    userBubble: '#2f67ea',
    assistantBubble: '#ffffff',
    systemBubble: '#fff1f1',
    danger: '#c53f3f',
    success: '#1a9663',
    shadow: 'rgba(31, 54, 94, 0.12)',
    overlay: 'rgba(8, 15, 30, 0.34)',
    statusBg: '#edf3ff'
  },
  dark: {
    page: '#0d1728',
    surface: '#16243a',
    surfaceSoft: '#1c2d48',
    input: '#1c2d47',
    border: '#304a6f',
    text: '#ecf3ff',
    muted: '#9bb0cf',
    primary: '#6f97ff',
    primarySoft: 'rgba(111, 151, 255, 0.2)',
    userBubble: '#3f6de0',
    assistantBubble: '#1a2a43',
    systemBubble: '#3a232b',
    danger: '#f07575',
    success: '#39c78b',
    shadow: 'rgba(0, 0, 0, 0.35)',
    overlay: 'rgba(1, 4, 10, 0.62)',
    statusBg: '#1b2c46'
  }
};

function normalizeEndpointInput(raw) {
  const text = String(raw || '').trim().replace(/\/+$/, '');
  return text || DEFAULT_ENDPOINT_INPUT;
}

function looksLikeLocalHost(host) {
  const value = String(host || '').toLowerCase();
  if (!value) {
    return false;
  }

  if (value.startsWith('localhost') || value.startsWith('127.') || value.startsWith('10.')) {
    return true;
  }

  if (value.startsWith('192.168.')) {
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

  const scheme = looksLikeLocalHost(normalized) ? 'http' : 'https';
  return `${scheme}://${normalized}`;
}

function createRequestId(prefix = 'mobile') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getAgentKey(item) {
  if (!item || typeof item !== 'object') {
    return '';
  }
  return String(item.key || item.id || '').trim();
}

function chatDisplayName(chat) {
  if (!chat || typeof chat !== 'object') {
    return '';
  }
  return String(chat.chatName || chat.title || chat.chatId || '').trim();
}

function withNetworkHint(error) {
  const message = String(error?.message || 'unknown error');
  if (message.toLowerCase().includes('network request failed')) {
    return `${message}（请确认域名/IP可访问，并且手机网络可直连后端）`;
  }
  return message;
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

function formatChatMeta(chat) {
  const parts = [];
  if (chat?.firstAgentKey) {
    parts.push(`@${chat.firstAgentKey}`);
  }
  if (chat?.chatId) {
    parts.push(chat.chatId);
  }
  return parts.join(' · ');
}

function timestampText(ts) {
  if (!ts) {
    return '';
  }

  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function messageTimestamp(item) {
  if (!item || typeof item !== 'object') {
    return Date.now();
  }

  const candidates = [item.updatedAt, item.updateTime, item.createdAt, item.timestamp];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const ms = new Date(candidate).getTime();
    if (!Number.isNaN(ms)) {
      return ms;
    }
  }
  return Date.now();
}

function buildConversationFromEvents(events) {
  const messages = [];
  const messageIndexById = new Map();
  const contentToMessageId = new Map();
  let latestChatId = '';

  const upsertMessage = (id, role, text, ts = Date.now()) => {
    const index = messageIndexById.get(id);
    if (index === undefined) {
      messageIndexById.set(id, messages.length);
      messages.push({ id, role, text: String(text || ''), ts });
      return;
    }

    messages[index] = {
      ...messages[index],
      role,
      text: String(text || ''),
      ts
    };
  };

  const appendMessageText = (id, role, delta, ts = Date.now()) => {
    const index = messageIndexById.get(id);
    if (index === undefined) {
      messageIndexById.set(id, messages.length);
      messages.push({ id, role, text: String(delta || ''), ts });
      return;
    }

    const current = messages[index];
    messages[index] = {
      ...current,
      role,
      text: `${current.text || ''}${String(delta || '')}`,
      ts
    };
  };

  for (const event of events) {
    if (!event || typeof event !== 'object') {
      continue;
    }

    if (event.chatId) {
      latestChatId = String(event.chatId);
    }

    const type = String(event.type || '');
    if (type === 'request.query') {
      const requestId = String(event.requestId || createRequestId('history'));
      upsertMessage(`user:${requestId}`, 'user', event.message || '', event.timestamp || Date.now());
      continue;
    }

    if ((type === 'run.error' || type === 'run.cancel') && event.error) {
      const payload = type === 'run.cancel'
        ? 'run.cancel'
        : `run.error: ${JSON.stringify(event.error || {}, null, 2)}`;
      upsertMessage(`system:${type}:${Date.now()}:${Math.random()}`, 'system', payload, event.timestamp || Date.now());
      continue;
    }

    if ((type === 'content.start' || type === 'content.delta' || type === 'content.snapshot' || type === 'content.end') && event.contentId) {
      const contentId = String(event.contentId);
      let messageId = contentToMessageId.get(contentId);
      if (!messageId) {
        messageId = `assistant:${contentId}`;
        contentToMessageId.set(contentId, messageId);
      }

      if (type === 'content.delta') {
        appendMessageText(messageId, 'assistant', event.delta || '', event.timestamp || Date.now());
      } else if (type === 'content.start') {
        upsertMessage(messageId, 'assistant', event.text || '', event.timestamp || Date.now());
      } else {
        const snapshot = typeof event.text === 'string' ? event.text : '';
        if (snapshot) {
          upsertMessage(messageId, 'assistant', snapshot, event.timestamp || Date.now());
        }
      }
    }
  }

  return {
    messages,
    latestChatId,
    contentToMessageId
  };
}

function MessageBubble({ item, theme, styles }) {
  const isUser = item.role === 'user';
  const isSystem = item.role === 'system';
  const wrapperStyle = isUser ? styles.messageUserWrap : styles.messageAssistantWrap;

  const bubbleStyle = [
    styles.messageBubble,
    {
      borderColor: theme.border,
      shadowColor: theme.shadow,
      backgroundColor: isUser ? theme.userBubble : isSystem ? theme.systemBubble : theme.assistantBubble
    },
    isUser ? styles.messageUserBubble : null,
    isSystem ? styles.messageSystemBubble : null
  ];

  const textStyle = [
    styles.messageText,
    { color: isUser ? '#ffffff' : theme.text }
  ];

  return (
    <View style={wrapperStyle}>
      <View style={bubbleStyle}>
        <Text style={textStyle}>{item.text || (isSystem ? '系统提示' : '')}</Text>
        <Text style={[styles.messageTime, { color: isUser ? 'rgba(255,255,255,0.8)' : theme.muted }]}> 
          {timestampText(item.ts)}
        </Text>
      </View>
    </View>
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
  const [messages, setMessages] = useState([]);
  const [composerText, setComposerText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statusText, setStatusText] = useState('初始化中...');
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingAgents, setLoadingAgents] = useState(false);

  const backendUrl = useMemo(() => toBackendBaseUrl(endpointInput), [endpointInput]);
  const theme = THEME_PALETTES[themeMode] || THEME_PALETTES.light;
  const styles = useMemo(() => createStyles(theme), [theme]);

  const flatListRef = useRef(null);
  const abortControllerRef = useRef(null);
  const contentMessageMapRef = useRef(new Map());
  const drawerAnim = useRef(new Animated.Value(0)).current;

  const tailSignature = useMemo(() => {
    const last = messages[messages.length - 1];
    if (!last) {
      return 'empty';
    }
    return `${last.id}:${last.text.length}`;
  }, [messages]);

  const filteredChats = useMemo(() => {
    const keyword = chatKeyword.trim().toLowerCase();
    const sorted = [...chats].sort((a, b) => messageTimestamp(b) - messageTimestamp(a));
    if (!keyword) {
      return sorted;
    }

    return sorted.filter((item) => {
      const hay = `${item.chatName || ''} ${item.chatId || ''} ${item.firstAgentKey || ''}`.toLowerCase();
      return hay.includes(keyword);
    });
  }, [chatKeyword, chats]);

  const persistSettings = useCallback(async (next = {}) => {
    try {
      const payload = {
        themeMode,
        endpointInput,
        selectedAgentKey,
        ...next
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (_error) {
      // Ignore persistence failure silently.
    }
  }, [endpointInput, selectedAgentKey, themeMode]);

  const setOrAppendMessage = useCallback((id, role, text, ts = Date.now()) => {
    setMessages((prev) => {
      const index = prev.findIndex((item) => item.id === id);
      if (index === -1) {
        return [...prev, { id, role, text: String(text || ''), ts }];
      }

      const next = [...prev];
      next[index] = {
        ...next[index],
        role,
        text: String(text || ''),
        ts
      };
      return next;
    });
  }, []);

  const appendToMessage = useCallback((id, role, delta, ts = Date.now()) => {
    setMessages((prev) => {
      const index = prev.findIndex((item) => item.id === id);
      if (index === -1) {
        return [...prev, { id, role, text: String(delta || ''), ts }];
      }

      const next = [...prev];
      const current = next[index];
      next[index] = {
        ...current,
        role,
        text: `${current.text || ''}${String(delta || '')}`,
        ts
      };
      return next;
    });
  }, []);

  const clearConversation = useCallback(() => {
    contentMessageMapRef.current = new Map();
    setMessages([]);
  }, []);

  const stopStreaming = useCallback((reason = '已停止') => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStreaming(false);
    setStatusText(reason);
  }, []);

  const applyAgwEvent = useCallback((event, source = 'live') => {
    if (!event || typeof event !== 'object') {
      return;
    }

    if (event.chatId) {
      setChatId(String(event.chatId));
    }

    const type = String(event.type || '');

    if (type === 'request.query') {
      const requestId = String(event.requestId || createRequestId('evt'));
      setOrAppendMessage(`user:${requestId}`, 'user', event.message || '', event.timestamp || Date.now());
      return;
    }

    if (type === 'run.start') {
      setStatusText('助手正在思考...');
      return;
    }

    if (type === 'run.complete') {
      setStreaming(false);
      setStatusText('已完成');
      return;
    }

    if (type === 'run.error') {
      setStreaming(false);
      const errorText = `run.error: ${JSON.stringify(event.error || {}, null, 2)}`;
      setOrAppendMessage(`system:${Date.now()}`, 'system', errorText, event.timestamp || Date.now());
      setStatusText('运行失败');
      return;
    }

    if (type === 'run.cancel') {
      setStreaming(false);
      setOrAppendMessage(`system:${Date.now()}`, 'system', 'run.cancel', event.timestamp || Date.now());
      setStatusText('已取消');
      return;
    }

    if ((type === 'content.start' || type === 'content.delta' || type === 'content.snapshot' || type === 'content.end') && event.contentId) {
      const contentId = String(event.contentId);
      let messageId = contentMessageMapRef.current.get(contentId);

      if (!messageId) {
        messageId = `assistant:${contentId}`;
        contentMessageMapRef.current.set(contentId, messageId);
      }

      if (type === 'content.delta') {
        appendToMessage(messageId, 'assistant', event.delta || '', event.timestamp || Date.now());
      } else if (type === 'content.start') {
        setOrAppendMessage(messageId, 'assistant', event.text || '', event.timestamp || Date.now());
      } else {
        const snapshotText = typeof event.text === 'string' ? event.text : '';
        if (snapshotText || source === 'history') {
          setOrAppendMessage(messageId, 'assistant', snapshotText, event.timestamp || Date.now());
        }
      }
    }
  }, [appendToMessage, setOrAppendMessage]);

  const refreshAgents = useCallback(async (base = backendUrl, silent = false) => {
    if (!silent) {
      setLoadingAgents(true);
    }

    try {
      const items = await fetchApiJson(base, '/api/agents');
      const list = Array.isArray(items) ? items : [];
      setAgents(list);
      setSelectedAgentKey((prev) => {
        if (prev && list.some((item) => getAgentKey(item) === prev)) {
          return prev;
        }
        return getAgentKey(list[0]) || '';
      });
      if (!silent) {
        setStatusText(`已连接，加载到 ${list.length} 个 agent`);
      }
    } catch (error) {
      setStatusText(`agent 加载失败：${withNetworkHint(error)}`);
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
        setStatusText(`会话列表已刷新（${list.length}）`);
      }
    } catch (error) {
      setStatusText(`会话加载失败：${withNetworkHint(error)}`);
    } finally {
      if (!silent) {
        setLoadingChats(false);
      }
    }
  }, [backendUrl]);

  const refreshAll = useCallback(async (base = backendUrl, silent = false) => {
    await Promise.all([
      refreshAgents(base, silent),
      refreshChats(base, silent)
    ]);
  }, [backendUrl, refreshAgents, refreshChats]);

  const loadChat = useCallback(async (targetChatId) => {
    const nextChatId = String(targetChatId || '').trim();
    if (!nextChatId) {
      return;
    }

    stopStreaming();
    setStatusText(`正在加载会话 ${nextChatId}...`);

    try {
      const query = `?chatId=${encodeURIComponent(nextChatId)}`;
      const data = await fetchApiJson(backendUrl, `/api/chat${query}`);
      const events = Array.isArray(data?.events) ? data.events : [];
      const parsed = buildConversationFromEvents(events);
      contentMessageMapRef.current = parsed.contentToMessageId;
      setMessages(parsed.messages);
      setChatId(nextChatId);
      setDrawerOpen(false);
      setStatusText(`会话已载入：${nextChatId}`);
    } catch (error) {
      setStatusText(`会话载入失败：${withNetworkHint(error)}`);
    }
  }, [backendUrl, stopStreaming]);

  const startNewChat = useCallback(() => {
    stopStreaming('新会话已就绪');
    setChatId('');
    clearConversation();
    setDrawerOpen(false);
  }, [clearConversation, stopStreaming]);

  const sendMessage = useCallback(async () => {
    const text = String(composerText || '').trim();
    if (!text) {
      return;
    }

    if (streaming) {
      setStatusText('当前有进行中的回答，请先停止');
      return;
    }

    const agentKey = selectedAgentKey || getAgentKey(agents[0]);
    if (!agentKey) {
      setStatusText('请先选择一个 Agent');
      return;
    }

    const requestId = createRequestId('mobile');
    setOrAppendMessage(`user:${requestId}`, 'user', text, Date.now());
    setComposerText('');

    const controller = new AbortController();
    abortControllerRef.current = controller;
    contentMessageMapRef.current = new Map();
    setStreaming(true);
    setStatusText(`正在请求 @${agentKey} ...`);

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
          message: text,
          agentKey,
          role: 'user',
          stream: true
        })
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`HTTP ${response.status}: ${detail.slice(0, 220)}`);
      }

      await consumeJsonSse(response, (jsonEvent) => {
        applyAgwEvent(jsonEvent, 'live');
      }, controller.signal);

      setStatusText('回答结束');
      refreshChats(backendUrl, true);
    } catch (error) {
      if (controller.signal.aborted) {
        setStatusText('已停止');
      } else {
        setOrAppendMessage(`system:${Date.now()}`, 'system', withNetworkHint(error), Date.now());
        setStatusText('请求失败');
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setStreaming(false);
    }
  }, [agents, applyAgwEvent, backendUrl, chatId, composerText, refreshChats, selectedAgentKey, setOrAppendMessage, streaming]);

  const applyEndpoint = useCallback(async () => {
    const normalized = normalizeEndpointInput(endpointDraft);
    const nextBaseUrl = toBackendBaseUrl(normalized);
    setEndpointInput(normalized);
    setEndpointDraft(normalized);
    setStatusText(`正在连接 ${nextBaseUrl} ...`);
    await persistSettings({ endpointInput: normalized });
    refreshAll(nextBaseUrl);
  }, [endpointDraft, persistSettings, refreshAll]);

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
        const saved = raw ? JSON.parse(raw) : {};
        if (!mounted) {
          return;
        }

        const savedTheme = saved?.themeMode === 'dark' ? 'dark' : 'light';
        const savedEndpoint = normalizeEndpointInput(saved?.endpointInput || DEFAULT_ENDPOINT_INPUT);
        const savedAgent = String(saved?.selectedAgentKey || '');

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
    refreshAll(backendUrl, true);
  }, [backendUrl, booting, refreshAll]);

  useEffect(() => {
    if (booting) {
      return;
    }

    persistSettings();
  }, [booting, endpointInput, persistSettings, selectedAgentKey, themeMode]);

  useEffect(() => {
    if (!flatListRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 20);

    return () => clearTimeout(timer);
  }, [tailSignature]);

  const drawerTranslateX = drawerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-DRAWER_WIDTH, 0]
  });

  if (booting) {
    return (
      <SafeAreaView edges={['top']} style={[styles.safeRoot, styles.centered]}>
        <StatusBar style="light" />
        <View style={styles.bootCard}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={[styles.bootText, { color: theme.text }]}>正在加载配置...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeRoot}>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />

      <View pointerEvents="none" style={styles.backgroundDecorLayer}>
        <View style={styles.bgBlobOne} />
        <View style={styles.bgBlobTwo} />
      </View>

      <KeyboardAvoidingView
        style={styles.main}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 6 : 0}
      >
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconButton} onPress={() => setDrawerOpen(true)}>
            <Text style={[styles.iconButtonText, { color: theme.text }]}>☰</Text>
          </TouchableOpacity>

          <View style={styles.titleWrap}>
            <Text style={[styles.title, { color: theme.text }]}>AGW Chat Assistant</Text>
            <Text numberOfLines={1} style={[styles.subTitle, { color: theme.muted }]}> 
              {chatId ? `chat: ${chatId}` : 'new chat'}
            </Text>
          </View>

          <TouchableOpacity style={styles.iconButton} onPress={toggleTheme}>
            <Text style={[styles.iconButtonText, { color: theme.text }]}>{themeMode === 'light' ? '☾' : '☀'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.agentRailCard}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.agentRailContent}>
            {(agents.length ? agents : [{ key: '', name: '暂无 Agent' }]).map((agent) => {
              const key = getAgentKey(agent);
              const label = agent.name || key || 'agent';
              const selected = key && key === selectedAgentKey;
              return (
                <TouchableOpacity
                  key={key || 'empty-agent'}
                  disabled={!key}
                  onPress={() => {
                    setSelectedAgentKey(key);
                    persistSettings({ selectedAgentKey: key });
                  }}
                  style={[
                    styles.agentChip,
                    {
                      borderColor: selected ? theme.primary : theme.border,
                      backgroundColor: selected ? theme.primarySoft : theme.surface
                    }
                  ]}
                >
                  <Text style={[styles.agentChipText, { color: selected ? theme.primary : theme.muted }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.statusRow}>
          <Text numberOfLines={1} style={[styles.statusText, { color: theme.muted }]}> 
            {statusText}
          </Text>
          {(loadingAgents || loadingChats) ? <ActivityIndicator size="small" color={theme.primary} /> : null}
        </View>

        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble item={item} theme={theme} styles={styles} />}
          style={styles.messagesList}
          contentContainerStyle={[
            styles.messagesContent,
            messages.length === 0 ? styles.messagesContentEmpty : null
          ]}
          ListEmptyComponent={(
            <View style={[styles.emptyWrap, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
              <Text style={[styles.emptyTitle, { color: theme.text }]}>开始一段新的对话</Text>
              <Text style={[styles.emptySub, { color: theme.muted }]}> 
                左上角打开历史会话，或直接输入问题发起聊天。
              </Text>
            </View>
          )}
        />

        <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 10) }]}> 
          <View style={styles.composerCard}>
            <TextInput
              value={composerText}
              onChangeText={setComposerText}
              placeholder={streaming ? '正在流式回答中，可点击停止' : '输入消息...'}
              placeholderTextColor={theme.muted}
              editable={!streaming}
              multiline
              style={styles.composerInput}
            />
            <View style={styles.composerActions}>
              {streaming ? (
                <TouchableOpacity style={[styles.stopButton, { borderColor: theme.danger }]} onPress={() => stopStreaming('已手动停止')}> 
                  <Text style={[styles.stopButtonText, { color: theme.danger }]}>停止</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.sendButton, { backgroundColor: theme.primary }]}
                onPress={sendMessage}
              >
                <Text style={styles.sendButtonText}>发送</Text>
              </TouchableOpacity>
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
          <View style={styles.drawerHeader}>
            <Text style={[styles.drawerTitle, { color: theme.text }]}>聊天历史</Text>
            <TouchableOpacity style={styles.iconButton} onPress={() => setDrawerOpen(false)}>
              <Text style={[styles.iconButtonText, { color: theme.text }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.drawerToolRow}>
            <TouchableOpacity style={[styles.drawerToolBtn, { borderColor: theme.border }]} onPress={startNewChat}> 
              <Text style={[styles.drawerToolText, { color: theme.text }]}>+ 新会话</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.drawerToolBtn, { borderColor: theme.border }]} onPress={() => refreshChats(backendUrl)}> 
              <Text style={[styles.drawerToolText, { color: theme.text }]}>刷新</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.drawerToolBtn, { borderColor: theme.border }]} onPress={() => setSettingsOpen((prev) => !prev)}> 
              <Text style={[styles.drawerToolText, { color: theme.text }]}>设置</Text>
            </TouchableOpacity>
          </View>

          {settingsOpen ? (
            <View style={[styles.settingsCard, { borderColor: theme.border, backgroundColor: theme.surfaceSoft }]}> 
              <Text style={[styles.settingsLabel, { color: theme.text }]}>后端域名 / IP</Text>
              <TextInput
                value={endpointDraft}
                onChangeText={setEndpointDraft}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="agw.linlay.cc 或 192.168.1.8:8080"
                placeholderTextColor={theme.muted}
                style={[styles.settingsInput, { borderColor: theme.border, color: theme.text }]}
              />
              <Text style={[styles.settingsHint, { color: theme.muted }]}>当前地址：{backendUrl}</Text>
              <TouchableOpacity style={[styles.settingsApplyBtn, { backgroundColor: theme.primary }]} onPress={applyEndpoint}> 
                <Text style={styles.settingsApplyText}>保存并重连</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <TextInput
            value={chatKeyword}
            onChangeText={setChatKeyword}
            placeholder="搜索会话"
            placeholderTextColor={theme.muted}
            style={[styles.searchInput, { borderColor: theme.border, color: theme.text }]}
          />

          <ScrollView style={styles.chatListWrap} contentContainerStyle={styles.chatListContent}>
            {filteredChats.length ? filteredChats.map((chat, index) => {
              const active = chat.chatId === chatId;
              const chatKey = chat.chatId || `${chatDisplayName(chat) || 'chat'}:${index}`;
              return (
                <TouchableOpacity
                  key={chatKey}
                  style={[
                    styles.chatItem,
                    {
                      borderColor: active ? theme.primary : theme.border,
                      backgroundColor: active ? theme.primarySoft : theme.surface
                    }
                  ]}
                  onPress={() => loadChat(chat.chatId)}
                >
                  <Text numberOfLines={1} style={[styles.chatItemTitle, { color: theme.text }]}> 
                    {chatDisplayName(chat) || chat.chatId || '未命名会话'}
                  </Text>
                  <Text numberOfLines={1} style={[styles.chatItemMeta, { color: theme.muted }]}> 
                    {formatChatMeta(chat)}
                  </Text>
                </TouchableOpacity>
              );
            }) : (
              <View style={[styles.emptyHistory, { borderColor: theme.border }]}> 
                <Text style={[styles.emptyHistoryText, { color: theme.muted }]}>暂无历史会话</Text>
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </View>
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
      backgroundColor: theme.page
    },
    centered: {
      justifyContent: 'center',
      alignItems: 'center'
    },
    main: {
      flex: 1
    },
    bootCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingHorizontal: 16,
      paddingVertical: 12
    },
    bootText: {
      fontSize: 15,
      fontWeight: '600'
    },
    backgroundDecorLayer: {
      ...StyleSheet.absoluteFillObject
    },
    bgBlobOne: {
      position: 'absolute',
      top: -120,
      right: -40,
      width: 260,
      height: 260,
      borderRadius: 130,
      backgroundColor: theme.primarySoft
    },
    bgBlobTwo: {
      position: 'absolute',
      bottom: 60,
      left: -90,
      width: 220,
      height: 220,
      borderRadius: 110,
      backgroundColor: theme.surfaceSoft
    },
    topBar: {
      marginHorizontal: 14,
      marginTop: 6,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      shadowColor: '#000000',
      shadowOpacity: 0.06,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
      paddingHorizontal: 8,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center'
    },
    titleWrap: {
      flex: 1,
      minWidth: 0,
      marginHorizontal: 8
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.2
    },
    subTitle: {
      marginTop: 2,
      fontSize: 12
    },
    iconButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceSoft,
      justifyContent: 'center',
      alignItems: 'center'
    },
    iconButtonText: {
      fontSize: 16,
      fontWeight: '700'
    },
    agentRailCard: {
      marginTop: 10,
      marginHorizontal: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingVertical: 8
    },
    agentRailContent: {
      paddingHorizontal: 8,
      alignItems: 'center'
    },
    agentChip: {
      marginHorizontal: 5,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8
    },
    agentChipText: {
      fontSize: 12,
      fontWeight: '600'
    },
    statusRow: {
      marginHorizontal: 14,
      marginTop: 10,
      marginBottom: 2,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.statusBg,
      minHeight: 34,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between'
    },
    statusText: {
      flex: 1,
      fontSize: 12,
      marginRight: 10
    },
    messagesList: {
      flex: 1
    },
    messagesContent: {
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 16
    },
    messagesContentEmpty: {
      flexGrow: 1,
      justifyContent: 'center'
    },
    emptyWrap: {
      borderRadius: 18,
      borderWidth: 1,
      paddingHorizontal: 20,
      paddingVertical: 20,
      alignItems: 'center'
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '700'
    },
    emptySub: {
      marginTop: 8,
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 20
    },
    messageUserWrap: {
      alignItems: 'flex-end',
      marginBottom: 9
    },
    messageAssistantWrap: {
      alignItems: 'flex-start',
      marginBottom: 9
    },
    messageBubble: {
      maxWidth: '90%',
      borderRadius: 16,
      borderTopLeftRadius: 10,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 9,
      shadowOpacity: 0.16,
      shadowRadius: 9,
      shadowOffset: { width: 0, height: 3 },
      elevation: 1
    },
    messageUserBubble: {
      borderTopLeftRadius: 16,
      borderTopRightRadius: 10
    },
    messageSystemBubble: {
      borderColor: theme.danger
    },
    messageText: {
      fontSize: 15,
      lineHeight: 22
    },
    messageTime: {
      marginTop: 6,
      fontSize: 11,
      textAlign: 'right'
    },
    composerWrap: {
      paddingHorizontal: 14,
      paddingTop: 6
    },
    composerCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      padding: 10
    },
    composerInput: {
      minHeight: 44,
      maxHeight: 150,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.input,
      color: theme.text,
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 10,
      fontSize: 15,
      lineHeight: 20,
      textAlignVertical: 'top'
    },
    composerActions: {
      marginTop: 10,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 10
    },
    stopButton: {
      height: 36,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 14,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'transparent'
    },
    stopButtonText: {
      fontSize: 13,
      fontWeight: '700'
    },
    sendButton: {
      height: 36,
      borderRadius: 12,
      paddingHorizontal: 18,
      justifyContent: 'center',
      alignItems: 'center'
    },
    sendButtonText: {
      fontSize: 14,
      color: '#ffffff',
      fontWeight: '700'
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
      backgroundColor: theme.page,
      borderRightWidth: 1,
      borderRightColor: theme.border,
      paddingTop: Platform.OS === 'android' ? 26 : 12,
      paddingHorizontal: 12,
      shadowColor: '#000000',
      shadowOpacity: 0.2,
      shadowRadius: 20,
      shadowOffset: { width: 2, height: 0 },
      elevation: 8
    },
    drawerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between'
    },
    drawerTitle: {
      fontSize: 19,
      fontWeight: '700'
    },
    drawerToolRow: {
      flexDirection: 'row',
      marginTop: 12,
      gap: 8
    },
    drawerToolBtn: {
      flex: 1,
      borderRadius: 11,
      borderWidth: 1,
      backgroundColor: theme.surface,
      height: 36,
      justifyContent: 'center',
      alignItems: 'center'
    },
    drawerToolText: {
      fontSize: 13,
      fontWeight: '600'
    },
    settingsCard: {
      marginTop: 10,
      borderWidth: 1,
      borderRadius: 12,
      padding: 10
    },
    settingsLabel: {
      fontSize: 13,
      fontWeight: '700'
    },
    settingsInput: {
      marginTop: 7,
      borderWidth: 1,
      borderRadius: 10,
      backgroundColor: theme.surface,
      paddingHorizontal: 10,
      height: 38,
      fontSize: 14
    },
    settingsHint: {
      marginTop: 6,
      fontSize: 11
    },
    settingsApplyBtn: {
      marginTop: 10,
      height: 34,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center'
    },
    settingsApplyText: {
      color: '#ffffff',
      fontSize: 13,
      fontWeight: '700'
    },
    searchInput: {
      marginTop: 10,
      borderWidth: 1,
      borderRadius: 10,
      backgroundColor: theme.surface,
      paddingHorizontal: 10,
      height: 38,
      fontSize: 14
    },
    chatListWrap: {
      flex: 1,
      marginTop: 10
    },
    chatListContent: {
      paddingBottom: 20
    },
    chatItem: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 10,
      marginBottom: 8
    },
    chatItemTitle: {
      fontSize: 14,
      fontWeight: '700'
    },
    chatItemMeta: {
      marginTop: 4,
      fontSize: 11
    },
    emptyHistory: {
      borderWidth: 1,
      borderRadius: 12,
      borderStyle: 'dashed',
      padding: 14,
      alignItems: 'center'
    },
    emptyHistoryText: {
      fontSize: 12
    }
  });
}
