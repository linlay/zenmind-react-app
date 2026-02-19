import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Markdown from 'react-native-markdown-display';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
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
import RenderHtml from 'react-native-render-html';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const STORAGE_KEY = 'agw_mobile_chat_settings_v1';
const DEFAULT_ENDPOINT_INPUT = 'agw.linlay.cc';
const DRAWER_MAX_WIDTH = 332;
const AUTO_COLLAPSE_MS = 1500;
const STREAM_IDLE_MS = 2500;
const FIREWORK_COLORS = ['#ffd166', '#ff6b6b', '#4cc9f0', '#80ed99', '#ff9f1c', '#c77dff'];
const FIREWORK_MIN_DURATION_MS = 900;
const FIREWORK_MAX_DURATION_MS = 15000;
const FIREWORK_DEFAULT_DURATION_MS = 5000;

const FRONTEND_VIEWPORT_TYPES = new Set(['html', 'qlc']);

const WEBVIEW_BRIDGE_SCRIPT = `
(function() {
  var origPostMessage = window.postMessage;
  window.postMessage = function(data, targetOrigin) {
    if (data && typeof data === 'object' &&
        (data.type === 'agw_frontend_submit' || data.type === 'agw_chat_message')) {
      window.ReactNativeWebView.postMessage(JSON.stringify(data));
    }
    origPostMessage.call(window, data, targetOrigin);
  };
  true;
})();
`;

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
    timelineLine: 'rgba(126, 166, 255, 0.42)',
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
    timelineLine: 'rgba(144, 176, 255, 0.45)',
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

async function fetchViewportHtml(baseUrl, viewportKey) {
  const data = await fetchApiJson(baseUrl, `/api/viewport?viewportKey=${encodeURIComponent(viewportKey)}`);
  const html = data?.html;
  if (typeof html !== 'string' || !html.trim()) {
    throw new Error('Viewport response does not contain html');
  }
  return html;
}

async function submitFrontendToolApi(baseUrl, { runId, toolId, params }) {
  return fetchApiJson(baseUrl, '/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ runId, toolId, params })
  });
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
      const chunks = buffer.split(/\r?\n\r?\n/);
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
  const chunks = text.split(/\r?\n\r?\n/);
  for (const chunk of chunks) {
    parseSseBlock(chunk, onJsonEvent);
  }
}

function consumeJsonSseXhr(url, fetchOptions, onJsonEvent, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('request aborted')); return; }

    const xhr = new XMLHttpRequest();
    let lastIndex = 0;
    let settled = false;
    const settle = (fn, val) => { if (!settled) { settled = true; fn(val); } };

    const onAbort = () => xhr.abort();
    signal?.addEventListener('abort', onAbort);
    const cleanup = () => signal?.removeEventListener('abort', onAbort);

    xhr.open(fetchOptions.method || 'POST', url);
    if (fetchOptions.headers) {
      Object.entries(fetchOptions.headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    }

    xhr.onreadystatechange = () => {
      if (xhr.readyState >= 3) {
        const full = xhr.responseText;
        const fresh = full.substring(lastIndex);
        if (fresh) {
          const parts = fresh.split(/\r?\n\r?\n/);
          const incomplete = parts.pop() || '';
          for (const chunk of parts) {
            if (chunk.trim()) parseSseBlock(chunk, onJsonEvent);
          }
          lastIndex = full.length - incomplete.length;
        }
      }
      if (xhr.readyState === 4) {
        const remain = xhr.responseText.substring(lastIndex).trim();
        if (remain) parseSseBlock(remain, onJsonEvent);
        cleanup();
        if (xhr.status >= 200 && xhr.status < 300) {
          settle(resolve);
        } else {
          settle(reject, new Error(`HTTP ${xhr.status}: ${xhr.responseText.slice(0, 220)}`));
        }
      }
    };

    xhr.onerror = () => { cleanup(); settle(reject, new Error('Network request failed')); };
    xhr.onabort = () => { cleanup(); settle(reject, new Error('request aborted')); };
    xhr.send(fetchOptions.body || null);
  });
}

function normalizeTaskStatus(raw) {
  const status = String(raw || 'init').toLowerCase();
  if (status === 'running' || status === 'in_progress' || status === 'progress') {
    return 'running';
  }
  if (status === 'done' || status === 'completed' || status === 'success' || status === 'finished') {
    return 'done';
  }
  if (status === 'failed' || status === 'error') {
    return 'failed';
  }
  return 'init';
}

function normalizePlanTask(task, index) {
  const taskId = String(task?.taskId || `task-${index + 1}`);
  const description = String(task?.description || taskId || '未命名任务');
  const status = normalizeTaskStatus(task?.status);
  return { taskId, description, status };
}

function getTaskTone(status) {
  const normalized = normalizeTaskStatus(status);
  if (normalized === 'done') {
    return 'ok';
  }
  if (normalized === 'failed') {
    return 'danger';
  }
  if (normalized === 'running') {
    return 'warn';
  }
  return 'neutral';
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

function renderActionLabel(event) {
  const name = String(event.actionName || '').trim();
  if (name) {
    return name;
  }

  const description = String(event.description || '').trim();
  if (description) {
    return description;
  }

  const actionId = String(event.actionId || '').trim();
  if (actionId) {
    return actionId;
  }

  return 'action';
}

function getActionGlyph(actionName) {
  const name = String(actionName || '').trim().toLowerCase();
  if (name === 'switch_theme') {
    return '◐';
  }
  if (name === 'launch_fireworks') {
    return '✦';
  }
  if (name === 'show_modal') {
    return '▣';
  }
  return '✧';
}

function normalizeEventType(rawType) {
  const type = String(rawType || '').trim();
  if (!type) {
    return '';
  }

  const aliasMap = {
    'message.start': 'content.start',
    'message.delta': 'content.delta',
    'message.end': 'content.end',
    'answer.start': 'content.start',
    'answer.delta': 'content.delta',
    'answer.end': 'content.end',
    'response.start': 'content.start',
    'response.delta': 'content.delta',
    'response.end': 'content.end'
  };

  return aliasMap[type] || type;
}

function isStreamActivityType(type) {
  if (!type) {
    return false;
  }

  if (type === 'run.start' || type === 'plan.update') {
    return true;
  }

  return (
    type.startsWith('content.') ||
    type.startsWith('tool.') ||
    type.startsWith('action.') ||
    type.startsWith('reasoning.') ||
    type.startsWith('task.')
  );
}

function parseStructuredArgs(rawText) {
  const text = String(rawText || '').trim();
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function toDisplayText(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch (_error) {
    return String(value);
  }
}

function isFrontendToolEvent(event) {
  if (!event || typeof event !== 'object') {
    return false;
  }
  const toolType = String(event.toolType || '').trim().toLowerCase();
  return FRONTEND_VIEWPORT_TYPES.has(toolType) && Boolean(event.toolKey);
}

function parseViewportHeaderFields(headerLine) {
  const result = {};
  const parts = String(headerLine || '').split(',');
  for (const part of parts) {
    const [rawKey, ...rawValueParts] = part.split('=');
    if (!rawKey || rawValueParts.length === 0) {
      continue;
    }
    const key = rawKey.trim().toLowerCase();
    const value = rawValueParts.join('=').trim();
    if (!key || !value) {
      continue;
    }
    result[key] = value;
  }
  return result;
}

function splitViewportBlocks(rawText) {
  const text = String(rawText || '');
  if (!text) {
    return [];
  }

  const regex = /```viewport\s*\n?([\s\S]*?)```/gi;
  const segments = [];
  let lastIndex = 0;
  let match = regex.exec(text);

  while (match) {
    if (match.index > lastIndex) {
      segments.push({ type: 'markdown', content: text.slice(lastIndex, match.index) });
    }

    const blockContent = (match[1] || '').trim();
    const lines = blockContent.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

    if (lines.length >= 2) {
      const fields = parseViewportHeaderFields(lines[0]);
      const viewportType = (fields.type || '').toLowerCase();
      const viewportKey = fields.key || '';

      if (viewportType && viewportKey) {
        const payloadRaw = lines.slice(1).join('\n');
        let payload = null;
        try {
          payload = JSON.parse(payloadRaw);
        } catch (_e) {
          payload = null;
        }

        segments.push({
          type: 'viewport',
          viewportType,
          viewportKey,
          payload,
          payloadRaw
        });
      } else {
        segments.push({ type: 'viewport', content: blockContent });
      }
    } else {
      segments.push({ type: 'viewport', content: blockContent });
    }

    lastIndex = regex.lastIndex;
    match = regex.exec(text);
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'markdown', content: text.slice(lastIndex) });
  }

  if (!segments.length) {
    segments.push({ type: 'markdown', content: text });
  }

  return segments;
}

function getCollapsedPlanTask(tasks = []) {
  const running = tasks.find((task) => normalizeTaskStatus(task.status) === 'running');
  if (running) {
    return running;
  }

  for (let i = tasks.length - 1; i >= 0; i -= 1) {
    const task = tasks[i];
    const status = normalizeTaskStatus(task.status);
    if (status === 'done' || status === 'failed') {
      return task;
    }
  }

  return tasks[tasks.length - 1] || null;
}

function getPlanProgress(tasks = []) {
  const total = tasks.length;
  if (!total) {
    return { current: 0, total: 0 };
  }

  const runningIndex = tasks.findIndex((task) => normalizeTaskStatus(task.status) === 'running');
  if (runningIndex >= 0) {
    return { current: runningIndex + 1, total };
  }

  for (let i = total - 1; i >= 0; i -= 1) {
    const status = normalizeTaskStatus(tasks[i].status);
    if (status === 'done' || status === 'failed') {
      return { current: i + 1, total };
    }
  }

  return { current: 1, total };
}

function clampNumber(rawValue, min, max, fallback) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return fallback;
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function parseFireworkPalette(rawPalette) {
  const list = Array.isArray(rawPalette)
    ? rawPalette
    : typeof rawPalette === 'string'
      ? rawPalette.split(/[\s,|]+/)
      : [];

  const colors = list
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  return colors.length ? colors : FIREWORK_COLORS;
}

function normalizeFireworksArgs(rawArgs) {
  const args =
    rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)
      ? rawArgs
      : { durationMs: rawArgs };

  const durationMs = Math.round(
    clampNumber(
      args.durationMs ?? args.duration ?? args.ms,
      FIREWORK_MIN_DURATION_MS,
      FIREWORK_MAX_DURATION_MS,
      FIREWORK_DEFAULT_DURATION_MS
    )
  );
  const intensity = clampNumber(args.intensity, 0.55, 2.2, 1);
  const spread = clampNumber(args.spread, 0.7, 1.65, 1);
  const gravity = clampNumber(args.gravity, 0.65, 1.75, 1);
  const launchSpread = clampNumber(args.launchSpread, 0.2, 0.95, 0.58);
  const burstTop = clampNumber(args.burstTopRatio, 0.08, 0.42, 0.17);
  const burstBottom = clampNumber(args.burstBottomRatio, burstTop + 0.08, 0.72, 0.38);
  const burstInput = args.bursts ?? args.burstCount;
  const particleInput =
    args.particlesPerBurst ??
    args.particleCount ??
    args.sparkCount ??
    (burstInput === undefined ? args.count : undefined);

  const estimatedBursts = Math.max(2, Math.round(durationMs / 900));
  const bursts = Math.round(
    clampNumber(burstInput, 2, 8, estimatedBursts)
  );
  const particlesPerBurst = Math.round(
    clampNumber(
      particleInput,
      14,
      90,
      34 + Math.round(16 * intensity)
    )
  );

  return {
    durationMs,
    bursts,
    particlesPerBurst,
    intensity,
    spread,
    gravity,
    launchSpread,
    burstTop,
    burstBottom,
    palette: parseFireworkPalette(args.palette ?? args.colors)
  };
}

function createFireworksShow(width, height, rawArgs) {
  const config = normalizeFireworksArgs(rawArgs);
  const safeWidth = Math.max(300, width || 0);
  const safeHeight = Math.max(520, height || 0);
  const rockets = [];
  const sparks = [];
  const now = Date.now();

  const firstLaunchMs = 80;
  const timelineEndMs = Math.max(540, config.durationMs - 280);
  const launchWindowMs = Math.max(360, timelineEndMs - firstLaunchMs - 520);
  const launchBaseY = safeHeight + 30;

  for (let burstIndex = 0; burstIndex < config.bursts; burstIndex += 1) {
    const burstProgress = config.bursts <= 1 ? 0 : burstIndex / (config.bursts - 1);
    const baseStartMs = firstLaunchMs + launchWindowMs * burstProgress;
    const launchStartMs = clampNumber(
      baseStartMs + (Math.random() - 0.5) * 220,
      0,
      Math.max(80, timelineEndMs - 460),
      baseStartMs
    );
    const launchDurationMs = 420 + Math.random() * 320;
    const explodeAtMs = Math.min(timelineEndMs, launchStartMs + launchDurationMs);

    const centerX = safeWidth * (0.5 + (Math.random() - 0.5) * config.launchSpread);
    const centerY =
      safeHeight * (config.burstTop + Math.random() * (config.burstBottom - config.burstTop));
    const launchX = centerX + (Math.random() - 0.5) * 54;
    const launchY = launchBaseY + Math.random() * 30;
    const color =
      config.palette[(burstIndex + Math.floor(Math.random() * config.palette.length)) % config.palette.length];
    const rocketStartT = launchStartMs / config.durationMs;
    const rocketEndT = explodeAtMs / config.durationMs;
    const rocketMidT = rocketStartT + (rocketEndT - rocketStartT) * 0.55;
    const rocketDx = centerX - launchX;
    const rocketDy = centerY - launchY;

    rockets.push({
      id: `rocket-${now}-${burstIndex}`,
      x: launchX,
      y: launchY,
      dx: rocketDx,
      dy: rocketDy,
      midDx: rocketDx * 0.5,
      midDy: rocketDy * 0.52 - 18 - Math.random() * 14,
      startT: rocketStartT,
      midT: rocketMidT,
      endT: rocketEndT,
      size: 2.1 + Math.random() * 2.2,
      tailLength: 22 + Math.random() * 20,
      color,
      rotateDeg: `${(Math.atan2(rocketDy, rocketDx) * 180) / Math.PI + 90}deg`
    });

    const particleCount = Math.max(
      12,
      Math.round(config.particlesPerBurst * (0.72 + Math.random() * 0.58))
    );
    for (let sparkIndex = 0; sparkIndex < particleCount; sparkIndex += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (120 + Math.random() * 220) * config.intensity;
      const lifeMs = 760 + Math.random() * 880;
      const startMs = explodeAtMs + Math.random() * 90;
      const endMs = Math.min(config.durationMs - 45, startMs + lifeMs);
      if (endMs <= startMs + 170) {
        continue;
      }

      const lifeSec = (endMs - startMs) / 1000;
      const vx = Math.cos(angle) * speed * config.spread;
      const vy = Math.sin(angle) * speed * config.spread;
      const gravityY = 300 * config.gravity * (0.72 + Math.random() * 0.58);

      const dx = vx * lifeSec;
      const dy = vy * lifeSec + 0.5 * gravityY * lifeSec * lifeSec;
      const startT = startMs / config.durationMs;
      const endT = endMs / config.durationMs;
      const spanT = endT - startT;
      if (spanT <= 0.006) {
        continue;
      }

      const minGap = Math.max(0.0015, Math.min(0.012, spanT * 0.16));
      const midMin = startT + minGap;
      const midMax = endT - minGap;
      if (midMax <= midMin) {
        continue;
      }

      const peakMin = startT + minGap;
      const peakMax = endT - minGap * 2;
      if (peakMax <= peakMin) {
        continue;
      }

      const midT = clampNumber(
        startT + spanT * (0.5 + Math.random() * 0.2),
        midMin,
        midMax,
        startT + spanT * 0.62
      );
      const peakT = clampNumber(
        startT + spanT * (0.26 + Math.random() * 0.22),
        peakMin,
        peakMax,
        startT + spanT * 0.38
      );
      const fadeMin = peakT + minGap;
      const fadeMax = endT - minGap;
      if (fadeMax <= fadeMin) {
        continue;
      }
      const fadeT = clampNumber(
        startT + spanT * (0.7 + Math.random() * 0.16),
        fadeMin,
        fadeMax,
        startT + spanT * 0.84
      );
      if (!(startT < peakT && peakT < fadeT && fadeT < endT && startT < midT && midT < endT)) {
        continue;
      }
      const size = 1.8 + Math.random() * 3.1;
      const sparkColor =
        config.palette[(burstIndex + sparkIndex + Math.floor(Math.random() * config.palette.length)) % config.palette.length];

      sparks.push({
        id: `spark-${now}-${burstIndex}-${sparkIndex}`,
        x: centerX + (Math.random() - 0.5) * 5,
        y: centerY + (Math.random() - 0.5) * 5,
        dx,
        dy,
        midDx: dx * (0.5 + Math.random() * 0.15) + (Math.random() - 0.5) * 22,
        midDy: dy * 0.48 - Math.abs(vy) * lifeSec * 0.23 - 8,
        startT,
        midT,
        peakT,
        fadeT,
        endT,
        size,
        trailLength: size * (2.4 + Math.random() * 3),
        trailWidth: Math.max(1, size * 0.34),
        trailOpacity: 0.26 + Math.random() * 0.24,
        color: sparkColor,
        rotateDeg: `${(Math.atan2(dy, dx) * 180) / Math.PI + 90}deg`
      });
    }
  }

  return {
    durationMs: config.durationMs,
    rockets,
    sparks
  };
}

function ViewportBlockView({ viewportKey, payload, backendUrl, theme, contentWidth }) {
  const [html, setHtml] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const webViewRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetchViewportHtml(backendUrl, viewportKey)
      .then((result) => {
        if (!cancelled) {
          setHtml(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Failed to load viewport');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [backendUrl, viewportKey]);

  const handleLoad = useCallback(() => {
    if (!webViewRef.current || !payload) {
      return;
    }
    const initScript = `
      try {
        window.postMessage(${JSON.stringify({ type: 'agw_tool_init', data: { params: payload } })}, '*');
      } catch(e) {}
      true;
    `;
    webViewRef.current.injectJavaScript(initScript);
  }, [payload]);

  if (loading) {
    return (
      <View style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="small" color={theme.primary} />
      </View>
    );
  }

  if (error || !html) {
    return (
      <View style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 8 }}>
        <Text style={{ color: theme.danger, fontSize: 12, fontFamily: FONT_MONO }}>
          {error || 'Viewport unavailable'}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ minHeight: 80, maxHeight: 320, borderRadius: 10, overflow: 'hidden', marginVertical: 6, borderWidth: 1, borderColor: theme.border }}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html }}
        style={{ flex: 1, backgroundColor: 'transparent', width: Math.max(60, contentWidth - 86) }}
        javaScriptEnabled
        onLoad={handleLoad}
        scrollEnabled
        nestedScrollEnabled
      />
    </View>
  );
}

function EntryRow({
  item,
  styles,
  theme,
  contentWidth,
  backendUrl,
  toolExpanded,
  onToggleTool,
  onToggleReasoning,
  onCopyText
}) {
  const appear = useRef(new Animated.Value(0)).current;
  const isAssistantStreaming =
    item.kind === 'message' && item.role === 'assistant' && Boolean(item.isStreamingContent);
  const segments = useMemo(() => {
    if (isAssistantStreaming) {
      return [];
    }
    if (item.kind === 'message' && item.role === 'assistant') {
      return splitViewportBlocks(item.text);
    }
    return [];
  }, [isAssistantStreaming, item.kind, item.role, item.text]);

  useEffect(() => {
    Animated.timing(appear, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [appear]);

  const enterStyle = {
    opacity: appear,
    transform: [
      {
        translateY: appear.interpolate({
          inputRange: [0, 1],
          outputRange: [6, 0]
        })
      }
    ]
  };

  const renderTimelineRail = (dotStyle, icon) => (
    <View style={styles.timelineRail}>
      <View style={[styles.timelineLine, { backgroundColor: theme.timelineLine }]} />
      {icon ? (
        <Text style={[styles.timelineIcon, dotStyle]}>{icon}</Text>
      ) : (
        <View style={[styles.timelineDot, dotStyle, { backgroundColor: theme.timelineDot }]} />
      )}
    </View>
  );

  const renderStateIcon = (state, color) => {
    const normalized = normalizeTaskStatus(state);
    if (normalized === 'running') {
      return <ActivityIndicator size="small" color={color} />;
    }
    if (normalized === 'failed') {
      return (
        <View style={[styles.statusIconDot, { backgroundColor: `${theme.danger}2b` }]}>
          <Text style={[styles.statusIconText, { color: theme.danger }]}>×</Text>
        </View>
      );
    }
    return (
      <View style={[styles.statusIconDot, { backgroundColor: `${theme.ok}2b` }]}>
        <Text style={[styles.statusIconText, { color: theme.ok }]}>✓</Text>
      </View>
    );
  };

  if (item.kind === 'tool' || item.kind === 'action') {
    const tone = getTaskTone(item.state);
    const toneStyle =
      tone === 'ok'
        ? { color: theme.ok, bg: `${theme.ok}16` }
        : tone === 'danger'
          ? { color: theme.danger, bg: `${theme.danger}14` }
          : tone === 'warn'
            ? { color: theme.warn, bg: `${theme.warn}16` }
            : { color: theme.textSoft, bg: theme.surfaceSoft };

    const typeGlyph = item.kind === 'action' ? getActionGlyph(item.actionName || item.label) : '';

    return (
      <Animated.View style={[styles.toolRow, enterStyle]}>
        {renderTimelineRail(styles.timelineDotTool, '🔧')}
        <View style={styles.toolBody}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => onToggleTool(item.id)}>
            <View style={[styles.toolHead, { backgroundColor: toneStyle.bg }]}>
              <View style={styles.toolStateIconWrap}>
                {renderStateIcon(item.state, toneStyle.color)}
              </View>
              {typeGlyph ? <Text style={[styles.toolKindGlyph, { color: toneStyle.color }]}>{typeGlyph}</Text> : null}
              <Text style={[styles.toolHeadText, { color: toneStyle.color }]} numberOfLines={1}>
                {item.label}
              </Text>
            </View>
          </TouchableOpacity>

          {toolExpanded ? (
            <View style={[styles.toolExpandPanel, { backgroundColor: theme.surfaceStrong }]}>
              <View style={styles.toolDetailBlock}>
                <Text style={[styles.toolDetailTitle, { color: theme.textSoft }]}>args</Text>
                <Text style={[styles.toolDetailText, { color: theme.text }]}>{item.argsText || '(empty)'}</Text>
              </View>
              <View style={styles.toolDetailBlock}>
                <Text style={[styles.toolDetailTitle, { color: theme.textSoft }]}>result</Text>
                <Text style={[styles.toolDetailText, { color: theme.text }]}>{item.resultText || '(empty)'}</Text>
              </View>
            </View>
          ) : null}
        </View>
      </Animated.View>
    );
  }

  if (item.kind === 'reasoning') {
    const durationSec = item.startTs && item.endTs
      ? ((item.endTs - item.startTs) / 1000).toFixed(1)
      : null;
    const durationLabel = durationSec ? `思考 ${durationSec}s` : '思考中...';

    return (
      <Animated.View style={[styles.reasoningRow, enterStyle]}>
        {renderTimelineRail(styles.timelineDotReasoning, '💡')}
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.reasoningBody}
          onPress={() => onToggleReasoning && onToggleReasoning(item.id)}
        >
          <Text style={[styles.reasoningLabel, { color: theme.textMute }]}>{durationLabel}</Text>
          {item.collapsed ? null : (
            <Text style={[styles.reasoningText, { color: theme.textMute }]}>{item.text || ''}</Text>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  }

  const isUser = item.role === 'user';
  const isSystem = item.role === 'system';
  const isRunEnd = isSystem && item.variant === 'run_end';

  if (isUser) {
    return (
      <Animated.View style={[styles.userRow, enterStyle]}>
        <View style={styles.timelineSpacer} />
        <View style={styles.userBubbleWrap}>
          <TouchableOpacity activeOpacity={0.85} onLongPress={() => onCopyText && onCopyText(item.text)}>
            <LinearGradient colors={theme.userBubble} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.userBubble}>
              <Text style={styles.userText}>{item.text}</Text>
            </LinearGradient>
          </TouchableOpacity>
          <Text style={[styles.userTime, { color: theme.textMute }]}>{toHHMM(item.ts)}</Text>
        </View>
      </Animated.View>
    );
  }

  if (isRunEnd) {
    const endText = String(item.text || '本次运行结束').trim();
    const runEndLabel = `-- ${endText} --`;

    return (
      <Animated.View style={[styles.runEndRow, enterStyle]}>
        <Text style={[styles.runEndText, { color: theme.textMute }]}>{runEndLabel}</Text>
      </Animated.View>
    );
  }

  if (isSystem) {
    const systemColor =
      item.tone === 'ok'
        ? theme.ok
        : item.tone === 'warn'
          ? theme.warn
          : item.tone === 'neutral'
            ? theme.textSoft
            : theme.danger;

    return (
      <Animated.View style={[styles.systemRow, enterStyle]}>
        {renderTimelineRail(styles.timelineDotMessage)}
        <View style={styles.systemWrap}>
          <View style={[styles.systemBadge, { backgroundColor: theme.systemBubble }]}>
            <Text style={[styles.systemText, { color: systemColor }]}>{item.text}</Text>
          </View>
          <Text style={[styles.systemTime, { color: theme.textMute }]}>{toHHMM(item.ts)}</Text>
        </View>
      </Animated.View>
    );
  }

  const mdStyle = {
    body: { color: theme.text, fontFamily: FONT_SANS, fontSize: 15, lineHeight: 22 },
    text: { color: theme.text, fontFamily: FONT_SANS, fontSize: 15, lineHeight: 22 },
    paragraph: { marginTop: 0, marginBottom: 10 },
    heading1: { color: theme.text, marginTop: 2, marginBottom: 8, fontSize: 22, fontWeight: '800' },
    heading2: { color: theme.text, marginTop: 2, marginBottom: 8, fontSize: 20, fontWeight: '700' },
    heading3: { color: theme.text, marginTop: 2, marginBottom: 8, fontSize: 18, fontWeight: '700' },
    bullet_list: { marginTop: 0, marginBottom: 10 },
    ordered_list: { marginTop: 0, marginBottom: 10 },
    code_inline: {
      color: theme.primaryDeep,
      backgroundColor: theme.primarySoft,
      borderRadius: 6,
      paddingHorizontal: 5,
      paddingVertical: 2,
      fontFamily: FONT_MONO
    },
    fence: {
      color: theme.textSoft,
      backgroundColor: theme.surfaceSoft,
      borderRadius: 10,
      padding: 10,
      fontFamily: FONT_MONO,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 0,
      marginBottom: 10
    },
    link: {
      color: theme.primary,
      textDecorationLine: 'underline'
    }
  };

  return (
    <Animated.View style={[styles.assistantRow, enterStyle]}>
      {renderTimelineRail(styles.timelineDotMessage, '💬')}
      <TouchableOpacity
        activeOpacity={0.9}
        style={styles.assistantFlowWrap}
        onLongPress={() => onCopyText && onCopyText(item.text)}
      >
        <View style={[styles.assistantBubblePanel, { backgroundColor: 'transparent' }]}>
          {isAssistantStreaming ? (
            <Markdown style={mdStyle}>{item.text || ''}</Markdown>
          ) : (
            segments.map((segment, index) => {
              if (segment.type === 'viewport') {
                if (segment.viewportKey) {
                  return (
                    <ViewportBlockView
                      key={`vp-${item.id}-${index}`}
                      viewportKey={segment.viewportKey}
                      payload={segment.payload}
                      backendUrl={backendUrl}
                      theme={theme}
                      contentWidth={contentWidth}
                    />
                  );
                }
                const fallbackText = segment.content || segment.payloadRaw || '';
                if (!fallbackText.trim()) {
                  return null;
                }
                return (
                  <Text
                    key={`vp-fallback-${item.id}-${index}`}
                    style={{ color: theme.textSoft, fontSize: 12, fontFamily: FONT_MONO, backgroundColor: theme.surfaceSoft, borderRadius: 8, padding: 8, marginVertical: 4 }}
                  >
                    {fallbackText}
                  </Text>
                );
              }

              if (!segment.content.trim()) {
                return null;
              }

              return (
                <Markdown
                  key={`md-${item.id}-${index}`}
                  style={mdStyle}
                >
                  {segment.content}
                </Markdown>
              );
            })
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function AppContent() {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();

  const [booting, setBooting] = useState(true);
  const [themeMode, setThemeMode] = useState('light');
  const [endpointInput, setEndpointInput] = useState(DEFAULT_ENDPOINT_INPUT);
  const [endpointDraft, setEndpointDraft] = useState(DEFAULT_ENDPOINT_INPUT);
  const [agents, setAgents] = useState([]);
  const [selectedAgentKey, setSelectedAgentKey] = useState('');
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const [chats, setChats] = useState([]);
  const [chatKeyword, setChatKeyword] = useState('');
  const [chatId, setChatId] = useState('');
  const [timeline, setTimeline] = useState([]);
  const [expandedTools, setExpandedTools] = useState({});
  const [composerText, setComposerText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [fireworksVisible, setFireworksVisible] = useState(false);
  const [fireworkRockets, setFireworkRockets] = useState([]);
  const [fireworkSparks, setFireworkSparks] = useState([]);
  const [actionModal, setActionModal] = useState({
    visible: false,
    title: '',
    content: '',
    closeText: '关闭'
  });
  const [planState, setPlanState] = useState({
    planId: '',
    tasks: [],
    expanded: false,
    lastTaskId: ''
  });
  const [activeFrontendTool, setActiveFrontendTool] = useState(null);

  const theme = THEMES[themeMode] || THEMES.light;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const backendUrl = useMemo(() => toBackendBaseUrl(endpointInput), [endpointInput]);

  const listRef = useRef(null);
  const abortControllerRef = useRef(null);
  const sequenceRef = useRef(0);
  const contentIdMapRef = useRef(new Map());
  const toolIdMapRef = useRef(new Map());
  const actionIdMapRef = useRef(new Map());
  const actionStateRef = useRef(new Map());
  const reasoningIdMapRef = useRef(new Map());
  const reasoningTimerRef = useRef(new Map());
  const planTimerRef = useRef(null);
  const fireworksTimerRef = useRef(null);
  const streamIdleTimerRef = useRef(null);
  const streamLastEventAtRef = useRef(0);
  const isAtBottomRef = useRef(true);
  const drawerAnim = useRef(new Animated.Value(0)).current;
  const sendScale = useRef(new Animated.Value(1)).current;
  const fireworksAnim = useRef(new Animated.Value(0)).current;
  const activeFrontendToolRef = useRef(null);
  const toolStateMapRef = useRef(new Map());
  const runIdRef = useRef('');
  const frontendToolWebViewRef = useRef(null);

  const drawerWidth = useMemo(() => {
    const candidate = Math.floor(window.width * 0.84);
    return Math.min(DRAWER_MAX_WIDTH, Math.max(278, candidate));
  }, [window.width]);

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

  const nextId = useCallback((prefix) => {
    sequenceRef.current += 1;
    return `${prefix}:${sequenceRef.current}`;
  }, []);

  const clearReasoningTimers = useCallback(() => {
    reasoningTimerRef.current.forEach((timer) => clearTimeout(timer));
    reasoningTimerRef.current = new Map();
  }, []);

  const clearPlanTimer = useCallback(() => {
    if (planTimerRef.current) {
      clearTimeout(planTimerRef.current);
      planTimerRef.current = null;
    }
  }, []);

  const resetPlan = useCallback(() => {
    clearPlanTimer();
    setPlanState({
      planId: '',
      tasks: [],
      expanded: false,
      lastTaskId: ''
    });
  }, [clearPlanTimer]);

  const resetTimeline = useCallback(() => {
    sequenceRef.current = 0;
    contentIdMapRef.current = new Map();
    toolIdMapRef.current = new Map();
    actionIdMapRef.current = new Map();
    actionStateRef.current = new Map();
    reasoningIdMapRef.current = new Map();
    clearReasoningTimers();
    if (fireworksTimerRef.current) {
      clearTimeout(fireworksTimerRef.current);
      fireworksTimerRef.current = null;
    }
    if (streamIdleTimerRef.current) {
      clearTimeout(streamIdleTimerRef.current);
      streamIdleTimerRef.current = null;
    }
    streamLastEventAtRef.current = 0;
    fireworksAnim.stopAnimation();
    setFireworksVisible(false);
    setFireworkRockets([]);
    setFireworkSparks([]);
    setActionModal((prev) => ({ ...prev, visible: false }));
    setExpandedTools({});
    setTimeline([]);
    setActiveFrontendTool(null);
    toolStateMapRef.current = new Map();
    runIdRef.current = '';
    resetPlan();
  }, [clearReasoningTimers, fireworksAnim, resetPlan]);

  const persistSettings = useCallback(
    async (partial = {}) => {
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
    },
    [endpointInput, selectedAgentKey, themeMode]
  );

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

  const armPlanCollapse = useCallback(() => {
    clearPlanTimer();
    planTimerRef.current = setTimeout(() => {
      setPlanState((prev) => ({ ...prev, expanded: false }));
      planTimerRef.current = null;
    }, AUTO_COLLAPSE_MS);
  }, [clearPlanTimer]);

  const scheduleReasoningCollapse = useCallback(
    (itemId) => {
      const timers = reasoningTimerRef.current;
      const old = timers.get(itemId);
      if (old) {
        clearTimeout(old);
      }

      const timer = setTimeout(() => {
        upsertEntry(itemId, (entry) => {
          if (!entry) {
            return entry;
          }
          return { ...entry, collapsed: true };
        });
        timers.delete(itemId);
      }, AUTO_COLLAPSE_MS);

      timers.set(itemId, timer);
    },
    [upsertEntry]
  );

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
        setStreaming(false);
      }
    }, STREAM_IDLE_MS + 40);
  }, [clearStreamIdleTimer]);

  const markStreamAlive = useCallback(() => {
    streamLastEventAtRef.current = Date.now();
    setStreaming(true);
    armStreamIdleTimer();
  }, [armStreamIdleTimer]);

  const applyThemeMode = useCallback(
    async (nextMode) => {
      const normalized = nextMode === 'dark' ? 'dark' : 'light';
      setThemeMode(normalized);
      await persistSettings({ themeMode: normalized });
    },
    [persistSettings]
  );

  const launchFireworks = useCallback(
    (rawArgs) => {
      const show = createFireworksShow(window.width, window.height, rawArgs);
      if (fireworksTimerRef.current) {
        clearTimeout(fireworksTimerRef.current);
        fireworksTimerRef.current = null;
      }

      setFireworkRockets(show.rockets);
      setFireworkSparks(show.sparks);
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
    [fireworksAnim, window.height, window.width]
  );

  const closeActionModal = useCallback(() => {
    setActionModal((prev) => ({ ...prev, visible: false }));
  }, []);

  const executeAction = useCallback(
    async (actionName, args) => {
      const name = String(actionName || '').trim().toLowerCase();
      if (!name) {
        return;
      }

      if (name === 'switch_theme') {
        const nextTheme = String(args?.theme || '').trim().toLowerCase();
        if (nextTheme === 'light' || nextTheme === 'dark') {
          await applyThemeMode(nextTheme);
          return;
        }
        await applyThemeMode(themeMode === 'light' ? 'dark' : 'light');
        return;
      }

      if (name === 'launch_fireworks') {
        launchFireworks(args);
        return;
      }

      if (name === 'show_modal') {
        setActionModal({
          visible: true,
          title: String(args?.title || '提示'),
          content: String(args?.content || ''),
          closeText: String(args?.closeText || '关闭')
        });
      }
    },
    [applyThemeMode, launchFireworks, themeMode]
  );

  useEffect(() => {
    activeFrontendToolRef.current = activeFrontendTool;
  }, [activeFrontendTool]);

  const activateFrontendToolFromState = useCallback(
    async (toolState) => {
      const toolId = toolState.toolId;
      const toolKey = toolState.toolKey;
      const toolType = String(toolState.toolType || '').trim().toLowerCase();
      const runId = toolState.runId || runIdRef.current;

      if (!toolId || !toolKey || !FRONTEND_VIEWPORT_TYPES.has(toolType)) {
        return;
      }

      setActiveFrontendTool({
        runId,
        toolId,
        toolKey,
        toolType,
        toolName: toolState.toolName || toolKey,
        toolTimeout: toolState.toolTimeout ?? null,
        toolParams: toolState.toolParams || null,
        viewportHtml: null,
        loading: true,
        loadError: ''
      });

      try {
        const html = await fetchViewportHtml(backendUrl, toolKey);
        const current = activeFrontendToolRef.current;
        if (!current || current.toolId !== toolId) {
          return;
        }
        setActiveFrontendTool((prev) =>
          prev && prev.toolId === toolId
            ? { ...prev, viewportHtml: html, loading: false }
            : prev
        );
      } catch (err) {
        const current = activeFrontendToolRef.current;
        if (!current || current.toolId !== toolId) {
          return;
        }
        setActiveFrontendTool((prev) =>
          prev && prev.toolId === toolId
            ? { ...prev, loading: false, loadError: err.message || 'Failed to load viewport' }
            : prev
        );
      }
    },
    [backendUrl]
  );

  const submitActiveFrontendTool = useCallback(
    async (params) => {
      const active = activeFrontendToolRef.current;
      if (!active) {
        setStatusText('当前没有等待提交的前端工具');
        return;
      }

      try {
        const data = await submitFrontendToolApi(backendUrl, {
          runId: active.runId,
          toolId: active.toolId,
          params: params && typeof params === 'object' ? params : {}
        });

        const accepted = Boolean(data?.accepted);
        if (accepted) {
          setActiveFrontendTool(null);
        } else {
          const detail = String(data?.detail || data?.status || 'unmatched');
          setStatusText(`提交未被接受：${detail}`);
        }
      } catch (err) {
        setStatusText(`提交失败：${err.message || 'unknown error'}`);
      }
    },
    [backendUrl]
  );

  const handleFrontendToolMessage = useCallback(
    (event) => {
      try {
        const data = typeof event.nativeEvent.data === 'string'
          ? JSON.parse(event.nativeEvent.data)
          : event.nativeEvent.data;

        if (!data || typeof data !== 'object') {
          return;
        }

        if (data.type === 'agw_frontend_submit') {
          const params = data.params && typeof data.params === 'object' ? data.params : {};
          submitActiveFrontendTool(params).catch(() => {});
        }
      } catch (_e) {
        // Ignore parse errors
      }
    },
    [submitActiveFrontendTool]
  );

  const handleFrontendToolWebViewLoad = useCallback(() => {
    const active = activeFrontendToolRef.current;
    if (!active || !frontendToolWebViewRef.current) {
      return;
    }

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

  const applyEvent = useCallback(
    (event, source = 'live') => {
      if (!event || typeof event !== 'object') {
        return;
      }

      if (event.chatId) {
        setChatId(String(event.chatId));
      }

      const ts = event.timestamp || Date.now();
      const type = normalizeEventType(event.type);

      if (source === 'live' && isStreamActivityType(type)) {
        markStreamAlive();
      }

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

      if (type === 'chat.start') {
        return;
      }

      if (type === 'run.start') {
        if (event.runId) {
          runIdRef.current = String(event.runId);
        }
        return;
      }

      if (type === 'run.complete') {
        clearStreamIdleTimer();
        setStreaming(false);
        setActiveFrontendTool(null);
        let endTs = source === 'live' ? Date.now() : ts;
        const timeCandidates = [event.completedAt, event.finishedAt, event.endTime, event.endTimestamp, event.timestamp];
        for (const value of timeCandidates) {
          if (value === undefined || value === null || value === '') {
            continue;
          }
          const ms = typeof value === 'number' ? value : new Date(value).getTime();
          if (!Number.isNaN(ms)) {
            endTs = ms;
            break;
          }
        }
        const finishedRunId = String(event.runId || runIdRef.current || '');
        const itemId = finishedRunId ? `run:end:${finishedRunId}` : nextId('run_end');
        upsertEntry(itemId, (old) => ({
          ...(old || {}),
          id: itemId,
          kind: 'message',
          role: 'system',
          variant: 'run_end',
          tone: 'ok',
          text: '本次运行结束',
          ts: endTs
        }));
        return;
      }

      if (type === 'run.cancel') {
        clearStreamIdleTimer();
        setStreaming(false);
        setActiveFrontendTool(null);
        let endTs = source === 'live' ? Date.now() : ts;
        const timeCandidates = [event.completedAt, event.finishedAt, event.endTime, event.endTimestamp, event.timestamp];
        for (const value of timeCandidates) {
          if (value === undefined || value === null || value === '') {
            continue;
          }
          const ms = typeof value === 'number' ? value : new Date(value).getTime();
          if (!Number.isNaN(ms)) {
            endTs = ms;
            break;
          }
        }
        const canceledRunId = String(event.runId || runIdRef.current || '');
        const itemId = canceledRunId ? `run:end:${canceledRunId}` : nextId('run_end');
        upsertEntry(itemId, (old) => ({
          ...(old || {}),
          id: itemId,
          kind: 'message',
          role: 'system',
          variant: 'run_end',
          tone: 'warn',
          text: '本次运行已取消',
          ts: endTs
        }));
        return;
      }

      if (type === 'run.error') {
        clearStreamIdleTimer();
        setStreaming(false);
        setActiveFrontendTool(null);
        appendEntry({
          id: nextId('system'),
          kind: 'message',
          role: 'system',
          text: `run.error: ${toDisplayText(event.error || event)}`,
          ts
        });
        return;
      }

      if (type === 'plan.update') {
        const tasks = Array.isArray(event.plan) ? event.plan.map((task, index) => normalizePlanTask(task, index)) : [];
        const collapsedTask = getCollapsedPlanTask(tasks);
        setPlanState((prev) => ({
          ...prev,
          planId: String(event.planId || prev.planId || ''),
          tasks,
          expanded: true,
          lastTaskId: collapsedTask?.taskId || prev.lastTaskId || ''
        }));
        armPlanCollapse();
        return;
      }

      if (type === 'task.start') {
        const taskId = String(event.taskId || '');
        if (!taskId) {
          return;
        }

        setPlanState((prev) => {
          const tasks = [...prev.tasks];
          const idx = tasks.findIndex((task) => task.taskId === taskId);
          const description = String(event.description || event.taskName || taskId);
          if (idx === -1) {
            tasks.push({ taskId, description, status: 'running' });
          } else {
            tasks[idx] = { ...tasks[idx], description, status: 'running' };
          }

          return {
            ...prev,
            tasks,
            expanded: true,
            lastTaskId: taskId
          };
        });
        armPlanCollapse();
        return;
      }

      if (type === 'task.end' || type === 'task.complete') {
        const taskId = String(event.taskId || '');
        if (!taskId) {
          return;
        }

        const nextStatus = normalizeTaskStatus(event.status || (event.error ? 'failed' : 'done'));
        setPlanState((prev) => {
          const tasks = [...prev.tasks];
          const idx = tasks.findIndex((task) => task.taskId === taskId);
          if (idx === -1) {
            tasks.push({ taskId, description: String(event.description || taskId), status: nextStatus });
          } else {
            tasks[idx] = { ...tasks[idx], status: nextStatus };
          }

          return {
            ...prev,
            tasks,
            expanded: true,
            lastTaskId: taskId
          };
        });
        armPlanCollapse();
        return;
      }

      if ((type === 'action.start' || type === 'action.snapshot') && event.actionId) {
        const actionId = String(event.actionId);
        const actionName = String(event.actionName || '').trim();
        const description = String(event.description || '').trim();
        let itemId = actionIdMapRef.current.get(actionId);
        if (!itemId) {
          itemId = nextId('action');
          actionIdMapRef.current.set(actionId, itemId);
        }

        const actionState = actionStateRef.current.get(actionId) || {
          actionName,
          argsText: '',
          resultText: '',
          executed: false
        };
        actionState.actionName = actionName || actionState.actionName || '';
        actionStateRef.current.set(actionId, actionState);

        upsertEntry(itemId, (old) => ({
          ...(old || {}),
          id: itemId,
          kind: 'action',
          actionName: actionState.actionName,
          label: old?.label || renderActionLabel(event),
          description: description || old?.description || '',
          argsText: old?.argsText || actionState.argsText || '',
          resultText: old?.resultText || actionState.resultText || '',
          state: 'running',
          ts
        }));
        return;
      }

      if (type === 'action.args' && event.actionId) {
        const actionId = String(event.actionId);
        let itemId = actionIdMapRef.current.get(actionId);
        if (!itemId) {
          itemId = nextId('action');
          actionIdMapRef.current.set(actionId, itemId);
        }

        const deltaText = String(event.delta || '');
        const stateInRef = actionStateRef.current.get(actionId) || {
          actionName: String(event.actionName || '').trim(),
          argsText: '',
          resultText: '',
          executed: false
        };
        stateInRef.argsText = `${stateInRef.argsText || ''}${deltaText}`;
        actionStateRef.current.set(actionId, stateInRef);

        upsertEntry(itemId, (old) => ({
          ...(old || {}),
          id: itemId,
          kind: 'action',
          actionName: old?.actionName || stateInRef.actionName || '',
          label: old?.label || renderActionLabel(event),
          description: old?.description || String(event.description || ''),
          argsText: `${old?.argsText || ''}${deltaText}`,
          resultText: old?.resultText || '',
          state: old?.state || 'running',
          ts
        }));
        return;
      }

      if (type === 'action.result' && event.actionId) {
        const actionId = String(event.actionId);
        let itemId = actionIdMapRef.current.get(actionId);
        if (!itemId) {
          itemId = nextId('action');
          actionIdMapRef.current.set(actionId, itemId);
        }

        const nextResult = toDisplayText(
          Object.prototype.hasOwnProperty.call(event, 'result') ? event.result : event.output
        );
        const stateInRef = actionStateRef.current.get(actionId) || {
          actionName: String(event.actionName || '').trim(),
          argsText: '',
          resultText: '',
          executed: false
        };
        stateInRef.resultText = nextResult || stateInRef.resultText || '';
        actionStateRef.current.set(actionId, stateInRef);

        upsertEntry(itemId, (old) => ({
          ...(old || {}),
          id: itemId,
          kind: 'action',
          actionName: old?.actionName || stateInRef.actionName || '',
          label: old?.label || renderActionLabel(event),
          description: old?.description || String(event.description || ''),
          argsText: old?.argsText || stateInRef.argsText || '',
          resultText: nextResult || old?.resultText || '',
          state: event.error ? 'failed' : old?.state || 'running',
          ts
        }));
        return;
      }

      if (type === 'action.end' && event.actionId) {
        const actionId = String(event.actionId);
        let itemId = actionIdMapRef.current.get(actionId);
        if (!itemId) {
          itemId = nextId('action');
          actionIdMapRef.current.set(actionId, itemId);
        }

        const stateInRef = actionStateRef.current.get(actionId) || {
          actionName: String(event.actionName || '').trim(),
          argsText: '',
          resultText: '',
          executed: false
        };
        stateInRef.actionName = String(event.actionName || stateInRef.actionName || '').trim();
        actionStateRef.current.set(actionId, stateInRef);

        upsertEntry(itemId, (old) => ({
          ...(old || {}),
          id: itemId,
          kind: 'action',
          actionName: old?.actionName || stateInRef.actionName || '',
          label: old?.label || renderActionLabel(event),
          description: old?.description || String(event.description || ''),
          argsText: old?.argsText || stateInRef.argsText || '',
          resultText: old?.resultText || stateInRef.resultText || '',
          state: event.error ? 'failed' : old?.state === 'failed' ? 'failed' : 'done',
          ts
        }));

        if (source === 'live' && !stateInRef.executed) {
          stateInRef.executed = true;
          actionStateRef.current.set(actionId, stateInRef);
          executeAction(stateInRef.actionName, parseStructuredArgs(stateInRef.argsText)).catch(() => {
            // Ignore runtime action errors to avoid breaking event rendering.
          });
        }
        return;
      }

      if ((type === 'tool.start' || type === 'tool.snapshot') && event.toolId) {
        const toolId = String(event.toolId);
        let itemId = toolIdMapRef.current.get(toolId);
        if (!itemId) {
          itemId = nextId('tool');
          toolIdMapRef.current.set(toolId, itemId);
        }

        const toolState = toolStateMapRef.current.get(toolId) || {
          toolId,
          argsBuffer: '',
          toolName: '',
          toolType: '',
          toolKey: '',
          toolTimeout: null,
          toolParams: null,
          runId: ''
        };
        toolState.toolName = event.toolName || toolState.toolName || '';
        toolState.toolType = event.toolType || toolState.toolType || '';
        toolState.toolKey = event.toolKey || toolState.toolKey || '';
        toolState.toolTimeout = event.toolTimeout ?? toolState.toolTimeout;
        toolState.runId = event.runId || toolState.runId || runIdRef.current;

        if (event.toolParams && typeof event.toolParams === 'object') {
          toolState.toolParams = event.toolParams;
        }
        toolStateMapRef.current.set(toolId, toolState);

        upsertEntry(itemId, (old) => ({
          ...(old || {}),
          id: itemId,
          kind: 'tool',
          label: old?.label || renderToolLabel(event),
          argsText: old?.argsText || '',
          resultText: old?.resultText || '',
          state: 'running',
          ts
        }));

        if (source === 'live' && isFrontendToolEvent({ toolType: toolState.toolType, toolKey: toolState.toolKey })) {
          activateFrontendToolFromState(toolState);
        }
        return;
      }

      if (type === 'tool.args' && event.toolId) {
        const toolId = String(event.toolId);
        let itemId = toolIdMapRef.current.get(toolId);
        if (!itemId) {
          itemId = nextId('tool');
          toolIdMapRef.current.set(toolId, itemId);
        }

        const deltaText = String(event.delta || '');
        const toolState = toolStateMapRef.current.get(toolId) || {
          toolId,
          argsBuffer: '',
          toolName: '',
          toolType: '',
          toolKey: '',
          toolTimeout: null,
          toolParams: null,
          runId: runIdRef.current
        };
        toolState.argsBuffer = (toolState.argsBuffer || '') + deltaText;
        toolStateMapRef.current.set(toolId, toolState);

        if (!toolState.toolParams) {
          try {
            const parsed = JSON.parse(toolState.argsBuffer);
            if (parsed && typeof parsed === 'object') {
              toolState.toolParams = parsed;
              const active = activeFrontendToolRef.current;
              if (active && active.toolId === toolId) {
                setActiveFrontendTool((prev) =>
                  prev && prev.toolId === toolId
                    ? { ...prev, toolParams: parsed }
                    : prev
                );
              }
            }
          } catch (_e) {
            // Not yet complete JSON
          }
        }

        upsertEntry(itemId, (old) => ({
          ...(old || {}),
          id: itemId,
          kind: 'tool',
          label: old?.label || renderToolLabel(event),
          argsText: `${old?.argsText || ''}${deltaText}`,
          resultText: old?.resultText || '',
          state: old?.state || 'running',
          ts
        }));
        return;
      }

      if (type === 'tool.result' && event.toolId) {
        const toolId = String(event.toolId);
        let itemId = toolIdMapRef.current.get(toolId);
        if (!itemId) {
          itemId = nextId('tool');
          toolIdMapRef.current.set(toolId, itemId);
        }

        const nextResult = toDisplayText(
          Object.prototype.hasOwnProperty.call(event, 'result') ? event.result : event.output
        );

        upsertEntry(itemId, (old) => ({
          ...(old || {}),
          id: itemId,
          kind: 'tool',
          label: old?.label || renderToolLabel(event),
          argsText: old?.argsText || '',
          resultText: nextResult || old?.resultText || '',
          state: event.error ? 'failed' : (nextResult || old?.resultText) ? 'done' : (old?.state || 'running'),
          ts
        }));
        return;
      }

      if (type === 'tool.end' && event.toolId) {
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
          label: old?.label || renderToolLabel(event),
          argsText: old?.argsText || '',
          resultText: old?.resultText || '',
          state: event.error ? 'failed' : old?.state === 'failed' ? 'failed' : 'done',
          ts
        }));
        return;
      }

      if (type.startsWith('reasoning.') && (event.reasoningId || event.runId || event.contentId)) {
        const reasoningId = String(event.reasoningId || event.runId || event.contentId);
        let itemId = reasoningIdMapRef.current.get(reasoningId);
        if (!itemId) {
          itemId = nextId('reasoning');
          reasoningIdMapRef.current.set(reasoningId, itemId);
        }

        if (type === 'reasoning.start') {
          upsertEntry(itemId, (old) => ({
            ...(old || {}),
            id: itemId,
            kind: 'reasoning',
            text: String(event.text || ''),
            collapsed: false,
            startTs: Date.now(),
            ts
          }));
          return;
        }

        if (type === 'reasoning.delta') {
          upsertEntry(itemId, (old) => ({
            ...(old || {}),
            id: itemId,
            kind: 'reasoning',
            text: `${old?.text || ''}${String(event.delta || '')}`,
            collapsed: false,
            ts
          }));
          return;
        }

        if (type === 'reasoning.end') {
          upsertEntry(itemId, (old) => ({
            ...(old || {}),
            id: itemId,
            kind: 'reasoning',
            collapsed: false,
            endTs: Date.now(),
            ts
          }));
          scheduleReasoningCollapse(itemId);
          return;
        }
      }

      if (
        (type === 'content.start' ||
          type === 'content.delta' ||
          type === 'content.snapshot' ||
          type === 'content.end') &&
        (event.contentId || event.runId || event.messageId || event.requestId)
      ) {
        const contentId = String(event.contentId || event.runId || event.messageId || event.requestId);
        let itemId = contentIdMapRef.current.get(contentId);
        if (!itemId) {
          itemId = nextId('assistant');
          contentIdMapRef.current.set(contentId, itemId);
        }

        if (type === 'content.start') {
          const seedText =
            typeof event.text === 'string'
              ? event.text
              : typeof event.delta === 'string'
                ? event.delta
                : typeof event.content === 'string'
                  ? event.content
                  : '';
          upsertEntry(itemId, (old) => ({
            ...(old || {}),
            id: itemId,
            kind: 'message',
            role: 'assistant',
            text: seedText || old?.text || '',
            isStreamingContent: source === 'live',
            ts
          }));
          return;
        }

        if (type === 'content.delta') {
          const deltaText =
            typeof event.delta === 'string'
              ? event.delta
              : typeof event.text === 'string'
                ? event.text
                : typeof event.content === 'string'
                  ? event.content
                  : '';

          upsertEntry(itemId, (old) => ({
            ...(old || {}),
            id: itemId,
            kind: 'message',
            role: 'assistant',
            text: `${old?.text || ''}${deltaText}`,
            isStreamingContent: source === 'live',
            ts
          }));
          return;
        }

        if (type === 'content.snapshot') {
          upsertEntry(itemId, (old) => ({
            ...(old || {}),
            id: itemId,
            kind: 'message',
            role: 'assistant',
            text:
              (typeof event.text === 'string'
                ? event.text
                : typeof event.content === 'string'
                  ? event.content
                  : '') || old?.text || '',
            isStreamingContent: false,
            ts
          }));
          return;
        }

        if (type === 'content.end') {
          const nextText = typeof event.text === 'string' ? event.text : '';
          if (nextText || source === 'history') {
            upsertEntry(itemId, (old) => ({
              ...(old || {}),
              id: itemId,
              kind: 'message',
              role: 'assistant',
              text: nextText || old?.text || '',
              isStreamingContent: false,
              ts
            }));
          }
        }
      }
    },
    [
      activateFrontendToolFromState,
      appendEntry,
      armPlanCollapse,
      clearStreamIdleTimer,
      executeAction,
      markStreamAlive,
      nextId,
      scheduleReasoningCollapse,
      upsertEntry
    ]
  );

  const stopStreaming = useCallback((reason = '') => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    clearStreamIdleTimer();
    streamLastEventAtRef.current = 0;
    setStreaming(false);
  }, [clearStreamIdleTimer]);

  const refreshAgents = useCallback(
    async (base = backendUrl, silent = false) => {
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
        }
      } catch (error) {
        setStatusText(`Agent 加载失败：${formatError(error)}`);
      } finally {
        if (!silent) {
          setLoadingAgents(false);
        }
      }
    },
    [backendUrl]
  );

  const refreshChats = useCallback(
    async (base = backendUrl, silent = false) => {
      if (!silent) {
        setLoadingChats(true);
      }

      try {
        const data = await fetchApiJson(base, '/api/chats');
        const list = Array.isArray(data) ? data : [];
        setChats(list);
        if (!silent) {
        }
      } catch (error) {
        setStatusText(`会话列表加载失败：${formatError(error)}`);
      } finally {
        if (!silent) {
          setLoadingChats(false);
        }
      }
    },
    [backendUrl]
  );

  const refreshAll = useCallback(
    async (base = backendUrl, silent = false) => {
      await Promise.all([refreshAgents(base, silent), refreshChats(base, silent)]);
    },
    [backendUrl, refreshAgents, refreshChats]
  );

  const loadChat = useCallback(
    async (targetChatId) => {
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
      } catch (error) {
        setStatusText(`会话载入失败：${formatError(error)}`);
      }
    },
    [applyEvent, backendUrl, resetTimeline, stopStreaming]
  );

  const startNewChat = useCallback(() => {
    stopStreaming();
    setChatId('');
    setDrawerOpen(false);
    resetTimeline();
  }, [resetTimeline, stopStreaming]);

  const sendMessage = useCallback(async () => {
    if (activeFrontendToolRef.current) {
      setStatusText('请先完成当前前端工具操作');
      return;
    }

    const message = String(composerText || '').trim();
    if (!message) {
      return;
    }

    if (streaming) {
      setStatusText('已有进行中的回答，请先停止');
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      clearStreamIdleTimer();
    }

    const agentKey = selectedAgentKey || getAgentKey(agents[0]);
    if (!agentKey) {
      setStatusText('请先选择 Agent');
      return;
    }

    const requestId = createRequestId('mobile');

    setComposerText('');
    setDrawerOpen(false);
    setAgentMenuOpen(false);

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
        (event) => { applyEvent(event, 'live'); },
        controller.signal
      );

      refreshChats(backendUrl, true);
    } catch (error) {
      if (controller.signal.aborted) {
      } else {
        clearStreamIdleTimer();
        appendEntry({
          id: nextId('system'),
          kind: 'message',
          role: 'system',
          text: formatError(error),
          ts: Date.now()
        });
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      clearStreamIdleTimer();
      setStreaming(false);
    }
  }, [
    agents,
    applyEvent,
    appendEntry,
    backendUrl,
    chatId,
    clearStreamIdleTimer,
    composerText,
    markStreamAlive,
    nextId,
    refreshChats,
    selectedAgentKey,
    streaming
  ]);

  const applyEndpoint = useCallback(async () => {
    const normalized = normalizeEndpointInput(endpointDraft);
    const nextBase = toBackendBaseUrl(normalized);
    setEndpointInput(normalized);
    setEndpointDraft(normalized);
    await persistSettings({ endpointInput: normalized });
    refreshAll(nextBase);
  }, [endpointDraft, persistSettings, refreshAll]);

  const pressSendScale = useCallback(
    (toValue) => {
      Animated.spring(sendScale, {
        toValue,
        useNativeDriver: true,
        speed: 38,
        bounciness: 5
      }).start();
    },
    [sendScale]
  );

  const toggleTheme = useCallback(async () => {
    const next = themeMode === 'light' ? 'dark' : 'light';
    await applyThemeMode(next);
  }, [applyThemeMode, themeMode]);

  const toggleToolExpanded = useCallback((toolItemId) => {
    setExpandedTools((prev) => ({
      ...prev,
      [toolItemId]: !prev[toolItemId]
    }));
  }, []);

  const toggleReasoning = useCallback((itemId) => {
    upsertEntry(itemId, (entry) => {
      if (!entry) return entry;
      return { ...entry, collapsed: !entry.collapsed };
    });
  }, [upsertEntry]);

  const [copyToast, setCopyToast] = useState(false);
  const copyToastTimer = useRef(null);

  const handleCopyText = useCallback(async (text) => {
    if (!text) return;
    try {
      await Clipboard.setStringAsync(String(text));
      if (copyToastTimer.current) clearTimeout(copyToastTimer.current);
      setCopyToast(true);
      copyToastTimer.current = setTimeout(() => setCopyToast(false), 1200);
    } catch (_e) {}
  }, []);

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
      if (fireworksTimerRef.current) {
        clearTimeout(fireworksTimerRef.current);
        fireworksTimerRef.current = null;
      }
      clearStreamIdleTimer();
      streamLastEventAtRef.current = 0;
      fireworksAnim.stopAnimation();
      clearReasoningTimers();
      clearPlanTimer();
    };
  }, [clearPlanTimer, clearReasoningTimers, clearStreamIdleTimer, fireworksAnim]);

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

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = Keyboard.addListener(showEvent, (event) => {
      const next = event?.endCoordinates?.height || 0;
      setKeyboardHeight(next);
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  const tailSignature = useMemo(() => {
    if (!timeline.length) {
      return 'empty';
    }
    const last = timeline[timeline.length - 1];
    const body = `${last.text || ''}${last.argsText || ''}${last.resultText || ''}${last.state || ''}${last.collapsed || ''}`;
    return `${last.id}:${body.length}`;
  }, [timeline]);

  useEffect(() => {
    if (!isAtBottomRef.current) {
      return undefined;
    }

    const timer = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 24);

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

  const activeAgentName = useMemo(() => {
    const found = agents.find((agent) => getAgentKey(agent) === selectedAgentKey);
    return getAgentName(found || agents[0]) || 'AGW';
  }, [agents, selectedAgentKey]);

  const agentBadgeLetter = activeAgentName.trim().charAt(0).toUpperCase() || 'A';

  const keyboardInset = Platform.OS === 'android' ? Math.max(0, keyboardHeight - insets.bottom) : 0;

  const collapsedPlanTask = useMemo(() => getCollapsedPlanTask(planState.tasks), [planState.tasks]);
  const planProgress = useMemo(() => getPlanProgress(planState.tasks), [planState.tasks]);

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

        <Animated.View style={[styles.mainShell, { transform: [{ translateX: mainTranslateX }] }]}>
          <KeyboardAvoidingView
            style={[styles.shell, { paddingBottom: keyboardInset }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
            pointerEvents={drawerOpen ? 'none' : 'auto'}
          >
            <View style={styles.topNavCompact}>
              <TouchableOpacity activeOpacity={0.72} style={styles.iconOnlyBtn} onPress={() => setDrawerOpen(true)}>
                <Text style={styles.iconOnlyBtnText}>≡</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.76}
                style={[styles.agentCompactBtn, { backgroundColor: theme.surfaceStrong }]}
                onPress={() => setAgentMenuOpen((prev) => !prev)}
              >
                <View style={[styles.agentCompactAvatar, { backgroundColor: theme.primary }]}>
                  <Text style={styles.agentCompactAvatarText}>{agentBadgeLetter}</Text>
                </View>
                <Text style={styles.agentCompactName} numberOfLines={1}>{activeAgentName}</Text>
                <Text style={styles.agentCompactArrow}>{agentMenuOpen ? '▴' : '▾'}</Text>
              </TouchableOpacity>

              <TouchableOpacity activeOpacity={0.72} style={styles.iconOnlyBtn} onPress={toggleTheme}>
                <Text style={styles.iconOnlyBtnText}>{theme.mode === 'light' ? '◐' : '◑'}</Text>
              </TouchableOpacity>
            </View>

            {agentMenuOpen ? (
              <View style={[styles.agentMenuCard, { backgroundColor: theme.surfaceStrong }]}>
                <ScrollView style={styles.agentMenuList} contentContainerStyle={styles.agentMenuListContent}>
                  {(agents.length ? agents : [{ key: '', name: '暂无 Agent' }]).map((agent) => {
                    const key = getAgentKey(agent);
                    const name = getAgentName(agent) || key || 'Agent';
                    const selected = key && key === selectedAgentKey;
                    return (
                      <TouchableOpacity
                        key={key || `empty-${name}`}
                        disabled={!key}
                        activeOpacity={0.78}
                        onPress={() => {
                          if (!key) {
                            return;
                          }
                          setSelectedAgentKey(key);
                          persistSettings({ selectedAgentKey: key });
                          setAgentMenuOpen(false);
                        }}
                        style={[
                          styles.agentMenuItem,
                          {
                            backgroundColor: selected ? theme.primarySoft : theme.surface
                          }
                        ]}
                      >
                        <Text style={[styles.agentMenuItemText, { color: selected ? theme.primaryDeep : theme.textSoft }]}>{name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {(statusText || loadingAgents || loadingChats) ? (
              <View style={styles.liveStatusLine}>
                <Text style={styles.liveStatusText} numberOfLines={1}>{statusText}</Text>
                {loadingAgents || loadingChats ? <ActivityIndicator size="small" color={theme.primary} /> : null}
              </View>
            ) : null}

            <FlatList
              ref={listRef}
              data={timeline}
              extraData={expandedTools}
              keyExtractor={(item) => item.id}
              style={styles.timelineList}
              contentContainerStyle={[styles.timelineContent, timeline.length === 0 ? styles.timelineContentEmpty : null]}
              onScroll={(event) => {
                const native = event.nativeEvent;
                const viewportBottom = native.contentOffset.y + native.layoutMeasurement.height;
                const distance = native.contentSize.height - viewportBottom;
                isAtBottomRef.current = distance < 36;
              }}
              scrollEventThrottle={16}
              renderItem={({ item }) => (
                <EntryRow
                  item={item}
                  styles={styles}
                  theme={theme}
                  contentWidth={window.width}
                  backendUrl={backendUrl}
                  onToggleTool={toggleToolExpanded}
                  toolExpanded={Boolean(expandedTools[item.id])}
                  onToggleReasoning={toggleReasoning}
                  onCopyText={handleCopyText}
                />
              )}
              ListEmptyComponent={
                <View style={[styles.emptyPanel, { backgroundColor: theme.surfaceStrong }]}>
                  <Text style={styles.emptyTitle}>开始一个完整对话</Text>
                  <Text style={styles.emptySubTitle}>左上角打开历史会话，或直接发送消息开始。</Text>
                </View>
              }
            />

            <View style={[styles.composerOuter, { paddingBottom: keyboardHeight > 0 ? (Platform.OS === 'ios' ? 0 : 10) : Math.max(insets.bottom, 10) }]}>
              {planState.tasks.length ? (
                <TouchableOpacity
                  activeOpacity={0.84}
                  onPress={() => {
                    clearPlanTimer();
                    setPlanState((prev) => ({ ...prev, expanded: !prev.expanded }));
                  }}
                  style={[styles.planCard, { backgroundColor: theme.surfaceStrong }]}
                >
                  {planState.expanded ? (
                    <View>
                      <View style={styles.planHead}>
                        <Text style={[styles.planTitle, { color: theme.text }]}>plan {planProgress.current}/{planProgress.total}</Text>
                        <Text style={[styles.planHint, { color: theme.textMute }]}>▾ 自动收起 1.5s</Text>
                      </View>
                      <View style={styles.planTaskList}>
                        {planState.tasks.map((task) => {
                          const tone = getTaskTone(task.status);
                          const toneColor =
                            tone === 'ok'
                              ? theme.ok
                              : tone === 'danger'
                                ? theme.danger
                                : tone === 'warn'
                                  ? theme.warn
                                  : theme.textMute;
                          return (
                            <View key={task.taskId} style={styles.planTaskRow}>
                              {tone === 'warn' ? (
                                <ActivityIndicator size="small" color={toneColor} style={styles.planTaskSpinner} />
                              ) : (
                                <View style={[styles.planTaskDot, { backgroundColor: toneColor }]}>
                                  {tone === 'danger' ? <Text style={styles.planTaskDotMark}>!</Text> : null}
                                </View>
                              )}
                              <Text style={[styles.planTaskText, { color: theme.textSoft }]} numberOfLines={2}>
                                {task.description}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  ) : (
                    <View style={styles.planCollapsedWrap}>
                      <Text style={[styles.planCollapsedTitle, { color: theme.textSoft }]}>plan</Text>
                      <Text style={[styles.planCollapsedText, { color: theme.text }]} numberOfLines={1}>
                        {planProgress.current}/{planProgress.total} ·{' '}
                        {collapsedPlanTask
                          ? collapsedPlanTask.description
                          : '暂无任务'}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              ) : null}

              <View style={[styles.composerCard, { backgroundColor: theme.surfaceStrong }]}>
                {activeFrontendTool ? (
                  <View style={styles.frontendToolContainer}>
                    {activeFrontendTool.loading ? (
                      <View style={styles.frontendToolLoading}>
                        <ActivityIndicator size="small" color={theme.primary} />
                        <Text style={[styles.frontendToolHint, { color: theme.textSoft }]}>加载前端工具...</Text>
                      </View>
                    ) : activeFrontendTool.loadError ? (
                      <View style={styles.frontendToolLoading}>
                        <Text style={[styles.frontendToolHint, { color: theme.danger }]}>
                          {activeFrontendTool.loadError}
                        </Text>
                      </View>
                    ) : activeFrontendTool.viewportHtml ? (
                      <WebView
                        ref={frontendToolWebViewRef}
                        originWhitelist={['*']}
                        source={{ html: activeFrontendTool.viewportHtml }}
                        style={styles.frontendToolWebView}
                        javaScriptEnabled
                        injectedJavaScript={WEBVIEW_BRIDGE_SCRIPT}
                        onMessage={handleFrontendToolMessage}
                        onLoad={handleFrontendToolWebViewLoad}
                        scrollEnabled
                        nestedScrollEnabled
                      />
                    ) : (
                      <View style={styles.frontendToolLoading}>
                        <Text style={[styles.frontendToolHint, { color: theme.textMute }]}>等待前端工具就绪...</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <>
                    <TextInput
                      value={composerText}
                      onChangeText={setComposerText}
                      placeholder={streaming ? '正在流式输出中，可点击停止' : '输入消息...'}
                      placeholderTextColor={theme.textMute}
                      editable={!streaming}
                      multiline
                      scrollEnabled
                      textAlignVertical="top"
                      style={[styles.composerInput, { backgroundColor: theme.surface }]}
                    />

                    <Animated.View style={[styles.inlineActionWrap, { transform: [{ scale: sendScale }] }]}>
                      {streaming ? (
                        <TouchableOpacity
                          activeOpacity={0.9}
                          style={[styles.inlineActionBtn, styles.inlineStopBtn, { backgroundColor: theme.danger }]}
                          onPress={() => stopStreaming('已手动停止')}
                        >
                          <View style={styles.stopSquare} />
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          activeOpacity={0.9}
                          style={styles.inlineActionBtn}
                          onPress={sendMessage}
                          onPressIn={() => pressSendScale(0.92)}
                          onPressOut={() => pressSendScale(1)}
                        >
                          <LinearGradient colors={[theme.primary, theme.primaryDeep]} style={styles.sendBtnGradient}>
                            <Text style={styles.sendBtnText}>↑</Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      )}
                    </Animated.View>
                  </>
                )}
              </View>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>

        {copyToast ? (
          <View style={styles.copyToast} pointerEvents="none">
            <Text style={styles.copyToastText}>已复制</Text>
          </View>
        ) : null}

        <View pointerEvents={drawerOpen ? 'auto' : 'none'} style={StyleSheet.absoluteFill}>
          <Animated.View style={[styles.drawerOverlay, { opacity: drawerAnim }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setDrawerOpen(false)} />
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
          >
            <View style={styles.drawerHead}>
              <Text style={styles.drawerTitle}>会话</Text>
              <TouchableOpacity activeOpacity={0.72} style={styles.drawerIconBtn} onPress={() => setDrawerOpen(false)}>
                <Text style={styles.drawerIconText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.drawerActionRow}>
              <TouchableOpacity activeOpacity={0.74} style={[styles.drawerActionBtn, { backgroundColor: theme.surfaceStrong }]} onPress={startNewChat}>
                <Text style={styles.drawerActionText}>+ 新会话</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.74} style={[styles.drawerActionBtn, { backgroundColor: theme.surfaceStrong }]} onPress={() => refreshChats(backendUrl)}>
                <Text style={styles.drawerActionText}>刷新</Text>
              </TouchableOpacity>
            </View>

            {settingsOpen ? (
              <View style={[styles.settingCard, { backgroundColor: theme.surfaceStrong }]}>
                <Text style={styles.settingLabel}>后端域名 / IP</Text>
                <TextInput
                  value={endpointDraft}
                  onChangeText={setEndpointDraft}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="agw.linlay.cc 或 192.168.1.8:8080"
                  placeholderTextColor={theme.textMute}
                  style={[styles.settingInput, { backgroundColor: theme.surface, color: theme.text }]}
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
              style={[styles.chatSearchInput, { backgroundColor: theme.surfaceStrong, color: theme.text }]}
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

            <View style={styles.drawerFooter}>
              <View style={styles.profileRow}>
                <View style={[styles.profileAvatar, { backgroundColor: theme.primary }]}>
                  <Text style={styles.profileAvatarText}>L</Text>
                </View>
                <Text style={styles.profileName}>Linlay</Text>
              </View>
              <TouchableOpacity activeOpacity={0.72} style={styles.drawerIconBtn} onPress={() => setSettingsOpen((prev) => !prev)}>
                <Text style={styles.drawerIconText}>⚙</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>

        {fireworksVisible ? (
          <View pointerEvents="none" style={styles.fireworksLayer}>
            {fireworkRockets.map((rocket) => (
              <Fragment key={rocket.id}>
                <Animated.View
                  style={[
                    styles.fireworkRocketTrail,
                    {
                      left: rocket.x,
                      top: rocket.y,
                      width: Math.max(1, rocket.size * 0.42),
                      height: rocket.tailLength,
                      borderRadius: Math.max(1, rocket.size * 0.2),
                      backgroundColor: rocket.color,
                      opacity: fireworksAnim.interpolate({
                        inputRange: [0, rocket.startT, rocket.endT, Math.min(0.995, rocket.endT + 0.03), 1],
                        outputRange: [0, 0, 0.36, 0, 0],
                        extrapolate: 'clamp'
                      }),
                      transform: [
                        {
                          translateX: fireworksAnim.interpolate({
                            inputRange: [0, rocket.startT, rocket.midT, rocket.endT, 1],
                            outputRange: [0, 0, rocket.midDx, rocket.dx, rocket.dx],
                            extrapolate: 'clamp'
                          })
                        },
                        {
                          translateY: fireworksAnim.interpolate({
                            inputRange: [0, rocket.startT, rocket.midT, rocket.endT, 1],
                            outputRange: [0, 0, rocket.midDy, rocket.dy, rocket.dy],
                            extrapolate: 'clamp'
                          })
                        },
                        { rotate: rocket.rotateDeg },
                        { translateY: -rocket.tailLength * 0.62 }
                      ]
                    }
                  ]}
                />
                <Animated.View
                  style={[
                    styles.fireworkRocket,
                    {
                      left: rocket.x,
                      top: rocket.y,
                      width: rocket.size,
                      height: rocket.size,
                      borderRadius: rocket.size / 2,
                      backgroundColor: rocket.color,
                      shadowColor: rocket.color,
                      opacity: fireworksAnim.interpolate({
                        inputRange: [0, rocket.startT, rocket.endT, Math.min(0.995, rocket.endT + 0.03), 1],
                        outputRange: [0, 0, 0.96, 0, 0],
                        extrapolate: 'clamp'
                      }),
                      transform: [
                        {
                          translateX: fireworksAnim.interpolate({
                            inputRange: [0, rocket.startT, rocket.midT, rocket.endT, 1],
                            outputRange: [0, 0, rocket.midDx, rocket.dx, rocket.dx],
                            extrapolate: 'clamp'
                          })
                        },
                        {
                          translateY: fireworksAnim.interpolate({
                            inputRange: [0, rocket.startT, rocket.midT, rocket.endT, 1],
                            outputRange: [0, 0, rocket.midDy, rocket.dy, rocket.dy],
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
              <Fragment key={spark.id}>
                <Animated.View
                  style={[
                    styles.fireworkSparkTrail,
                    {
                      left: spark.x,
                      top: spark.y,
                      width: spark.trailWidth,
                      height: spark.trailLength,
                      borderRadius: spark.trailWidth / 2,
                      backgroundColor: spark.color,
                      opacity: fireworksAnim.interpolate({
                        inputRange: [0, spark.startT, spark.peakT, spark.fadeT, spark.endT, 1],
                        outputRange: [0, 0, spark.trailOpacity, spark.trailOpacity * 0.28, 0, 0],
                        extrapolate: 'clamp'
                      }),
                      transform: [
                        {
                          translateX: fireworksAnim.interpolate({
                            inputRange: [0, spark.startT, spark.midT, spark.endT, 1],
                            outputRange: [0, 0, spark.midDx, spark.dx, spark.dx],
                            extrapolate: 'clamp'
                          })
                        },
                        {
                          translateY: fireworksAnim.interpolate({
                            inputRange: [0, spark.startT, spark.midT, spark.endT, 1],
                            outputRange: [0, 0, spark.midDy, spark.dy, spark.dy],
                            extrapolate: 'clamp'
                          })
                        },
                        { rotate: spark.rotateDeg },
                        { translateY: -spark.trailLength * 0.64 }
                      ]
                    }
                  ]}
                />
                <Animated.View
                  style={[
                    styles.fireworkSpark,
                    {
                      left: spark.x,
                      top: spark.y,
                      width: spark.size,
                      height: spark.size,
                      borderRadius: spark.size / 2,
                      backgroundColor: spark.color,
                      shadowColor: spark.color,
                      opacity: fireworksAnim.interpolate({
                        inputRange: [0, spark.startT, spark.peakT, spark.fadeT, spark.endT, 1],
                        outputRange: [0, 0, 1, 0.7, 0, 0],
                        extrapolate: 'clamp'
                      }),
                      transform: [
                        {
                          translateX: fireworksAnim.interpolate({
                            inputRange: [0, spark.startT, spark.midT, spark.endT, 1],
                            outputRange: [0, 0, spark.midDx, spark.dx, spark.dx],
                            extrapolate: 'clamp'
                          })
                        },
                        {
                          translateY: fireworksAnim.interpolate({
                            inputRange: [0, spark.startT, spark.midT, spark.endT, 1],
                            outputRange: [0, 0, spark.midDy, spark.dy, spark.dy],
                            extrapolate: 'clamp'
                          })
                        },
                        {
                          scale: fireworksAnim.interpolate({
                            inputRange: [0, spark.startT, spark.peakT, spark.endT, 1],
                            outputRange: [0.24, 0.24, 1, 0.32, 0.32],
                            extrapolate: 'clamp'
                          })
                        }
                      ]
                    }
                  ]}
                />
              </Fragment>
            ))}
          </View>
        ) : null}

        <Modal
          transparent
          visible={actionModal.visible}
          animationType="fade"
          onRequestClose={closeActionModal}
        >
          <View style={[styles.actionModalOverlay, { backgroundColor: theme.overlay }]}>
            <View style={[styles.actionModalCard, { backgroundColor: theme.surfaceStrong }]}>
              <Text style={[styles.actionModalTitle, { color: theme.text }]}>{actionModal.title || '提示'}</Text>
              <Text style={[styles.actionModalContent, { color: theme.textSoft }]}>
                {actionModal.content || ' '}
              </Text>
              <TouchableOpacity
                activeOpacity={0.82}
                style={[styles.actionModalBtn, { backgroundColor: theme.primarySoft }]}
                onPress={closeActionModal}
              >
                <Text style={[styles.actionModalBtnText, { color: theme.primaryDeep }]}>
                  {actionModal.closeText || '关闭'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
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
    mainShell: {
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
    topNavCompact: {
      marginTop: 5,
      marginHorizontal: 12,
      paddingHorizontal: 7,
      paddingVertical: 6,
      minHeight: 42,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8
    },
    iconOnlyBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: theme.surfaceSoft,
      alignItems: 'center',
      justifyContent: 'center'
    },
    iconOnlyBtnText: {
      color: theme.textSoft,
      fontFamily: FONT_SANS,
      fontSize: 15,
      fontWeight: '800'
    },
    agentCompactBtn: {
      flex: 1,
      minWidth: 0,
      height: 30,
      borderRadius: 999,
      paddingHorizontal: 9,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7
    },
    agentCompactAvatar: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center'
    },
    agentCompactAvatarText: {
      color: '#ffffff',
      fontFamily: FONT_SANS,
      fontSize: 11,
      fontWeight: '800'
    },
    agentCompactName: {
      flex: 1,
      minWidth: 0,
      color: theme.text,
      fontFamily: FONT_SANS,
      fontSize: 13,
      fontWeight: '700',
      textAlign: 'center'
    },
    agentCompactArrow: {
      color: theme.textMute,
      fontFamily: FONT_SANS,
      fontSize: 15,
      fontWeight: '700'
    },
    agentMenuCard: {
      marginHorizontal: 12,
      marginTop: 6,
      borderRadius: 12,
      maxHeight: 176,
      overflow: 'hidden'
    },
    agentMenuList: {
      flexGrow: 0
    },
    agentMenuListContent: {
      paddingVertical: 6,
      paddingHorizontal: 6,
      gap: 6
    },
    agentMenuItem: {
      borderRadius: 10,
      minHeight: 34,
      justifyContent: 'center',
      paddingHorizontal: 10
    },
    agentMenuItemText: {
      fontFamily: FONT_SANS,
      fontSize: 13,
      fontWeight: '700'
    },
    liveStatusLine: {
      marginHorizontal: 12,
      marginTop: 6,
      minHeight: 30,
      borderRadius: 10,
      backgroundColor: `${theme.surfaceStrong}dd`,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8
    },
    liveStatusText: {
      flex: 1,
      color: theme.textSoft,
      fontFamily: FONT_SANS,
      fontSize: 11.5,
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
      borderRadius: 14,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: theme.mode === 'dark' ? 0.15 : 0.06,
      shadowRadius: 10,
      elevation: 2,
      paddingHorizontal: 16,
      paddingVertical: 18
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
    timelineRail: {
      width: 12,
      alignSelf: 'stretch',
      alignItems: 'center',
      marginRight: 8
    },
    timelineLine: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: 1
    },
    timelineDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5
    },
    timelineIcon: {
      fontSize: 10,
      lineHeight: 14
    },
    timelineDotTool: {
      marginTop: 11
    },
    timelineDotReasoning: {
      marginTop: 8
    },
    timelineDotMessage: {
      marginTop: 10
    },
    timelineSpacer: {
      width: 20
    },
    toolRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 10
    },
    toolBody: {
      flex: 1
    },
    toolHead: {
      minHeight: 30,
      borderRadius: 11,
      paddingHorizontal: 8,
      paddingVertical: 5,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      alignSelf: 'flex-start',
      maxWidth: '94%'
    },
    toolToggleBtn: {
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.28)'
    },
    toolStateIconWrap: {
      width: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center'
    },
    toolToggleText: {
      fontFamily: FONT_MONO,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 13
    },
    toolKindGlyph: {
      fontFamily: FONT_SANS,
      fontSize: 12,
      fontWeight: '700',
      marginTop: -0.5
    },
    toolHeadText: {
      flex: 1,
      minWidth: 0,
      fontFamily: FONT_MONO,
      fontSize: 11.5,
      fontWeight: '700'
    },
    statusIconDot: {
      width: 16,
      height: 16,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center'
    },
    statusIconText: {
      fontFamily: FONT_MONO,
      fontSize: 10,
      fontWeight: '700'
    },
    toolExpandPanel: {
      marginTop: 6,
      borderRadius: 11,
      padding: 8
    },
    toolDetailBlock: {
      marginBottom: 8
    },
    toolDetailTitle: {
      fontFamily: FONT_MONO,
      fontSize: 10.5,
      fontWeight: '700',
      marginBottom: 3
    },
    toolDetailText: {
      fontFamily: FONT_MONO,
      fontSize: 11,
      lineHeight: 16,
      marginBottom: 8
    },
    reasoningRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 8
    },
    reasoningBody: {
      flex: 1,
      paddingTop: 1
    },
    reasoningLabel: {
      fontFamily: FONT_MONO,
      fontSize: 10,
      fontWeight: '700',
      marginBottom: 2
    },
    reasoningText: {
      fontFamily: FONT_SANS,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '500'
    },
    reasoningCollapsedText: {
      fontFamily: FONT_SANS,
      fontSize: 11.5,
      lineHeight: 17,
      fontWeight: '600'
    },
    userRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginBottom: 10
    },
    userBubbleWrap: {
      flex: 1,
      alignItems: 'flex-end'
    },
    userBubble: {
      maxWidth: '87%',
      borderRadius: 14,
      borderTopRightRadius: 8,
      paddingHorizontal: 11,
      paddingVertical: 8,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 9,
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
      marginTop: 4,
      textAlign: 'right',
      fontFamily: FONT_MONO,
      fontSize: 10.5,
      fontWeight: '700'
    },
    assistantRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 10
    },
    assistantFlowWrap: {
      flex: 1,
      paddingRight: 2
    },
    assistantBubblePanel: {
      paddingHorizontal: 10,
      paddingVertical: 9,
      marginBottom: 3
    },
    assistantStreamingText: {
      color: theme.text,
      fontFamily: FONT_SANS,
      fontSize: 15,
      lineHeight: 22,
      fontWeight: '500'
    },
    viewportWrap: {
      borderRadius: 11,
      padding: 8,
      marginBottom: 10
    },
    viewportTitle: {
      fontFamily: FONT_MONO,
      fontSize: 10.5,
      fontWeight: '700',
      marginBottom: 6
    },
    viewportBody: {
      borderRadius: 8,
      padding: 8,
      maxHeight: 260
    },
    systemRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 10
    },
    systemWrap: {
      flex: 1,
      alignItems: 'flex-start'
    },
    systemBadge: {
      borderRadius: 11,
      paddingHorizontal: 10,
      paddingVertical: 8
    },
    systemText: {
      fontFamily: FONT_SANS,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '600'
    },
    systemTime: {
      marginTop: 4,
      fontFamily: FONT_MONO,
      fontSize: 10.5,
      fontWeight: '700'
    },
    runEndRow: {
      marginBottom: 10,
      alignItems: 'center',
      justifyContent: 'center'
    },
    runEndText: {
      fontFamily: FONT_MONO,
      fontSize: 10.5,
      fontWeight: '600'
    },
    composerOuter: {
      paddingHorizontal: 12,
      paddingTop: 4
    },
    planCard: {
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 7,
      marginBottom: 7,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: theme.mode === 'dark' ? 0.16 : 0.05,
      shadowRadius: 8,
      elevation: 1
    },
    planHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    planTitle: {
      fontFamily: FONT_MONO,
      fontSize: 11,
      fontWeight: '800'
    },
    planHint: {
      fontFamily: FONT_SANS,
      fontSize: 10.5,
      fontWeight: '600'
    },
    planTaskList: {
      marginTop: 6,
      gap: 4
    },
    planTaskRow: {
      flexDirection: 'row',
      alignItems: 'flex-start'
    },
    planTaskSpinner: {
      width: 12,
      marginTop: 2
    },
    planTaskDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginTop: 4,
      alignItems: 'center',
      justifyContent: 'center'
    },
    planTaskDotMark: {
      color: '#ffffff',
      fontFamily: FONT_MONO,
      fontSize: 8,
      fontWeight: '800',
      lineHeight: 9
    },
    planTaskText: {
      flex: 1,
      marginLeft: 4,
      fontFamily: FONT_SANS,
      fontSize: 11.5,
      lineHeight: 17,
      fontWeight: '600'
    },
    planCollapsedWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8
    },
    planCollapsedTitle: {
      fontFamily: FONT_MONO,
      fontSize: 11,
      fontWeight: '800'
    },
    planCollapsedText: {
      flex: 1,
      fontFamily: FONT_SANS,
      fontSize: 11.5,
      fontWeight: '600'
    },
    composerCard: {
      borderRadius: 13,
      padding: 8,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: theme.mode === 'dark' ? 0.14 : 0.06,
      shadowRadius: 8,
      elevation: 1,
      position: 'relative'
    },
    frontendToolContainer: {
      minHeight: 120,
      maxHeight: 280,
      borderRadius: 11,
      overflow: 'hidden'
    },
    frontendToolLoading: {
      flex: 1,
      minHeight: 80,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      padding: 12
    },
    frontendToolWebView: {
      flex: 1,
      minHeight: 120,
      backgroundColor: 'transparent'
    },
    frontendToolHint: {
      fontFamily: FONT_SANS,
      fontSize: 12,
      fontWeight: '600',
      textAlign: 'center'
    },
    composerInput: {
      minHeight: 44,
      maxHeight: 146,
      borderRadius: 11,
      color: theme.text,
      fontFamily: FONT_SANS,
      fontSize: 15,
      lineHeight: 20,
      paddingLeft: 11,
      paddingTop: 10,
      paddingBottom: 10,
      paddingRight: 52,
      textAlignVertical: 'top'
    },
    inlineActionWrap: {
      position: 'absolute',
      right: 13,
      bottom: 12
    },
    inlineActionBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center'
    },
    inlineStopBtn: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.18,
      shadowRadius: 6,
      elevation: 1
    },
    inlineStopText: {
      fontFamily: FONT_MONO,
      fontSize: 14,
      fontWeight: '700'
    },
    stopSquare: {
      width: 10,
      height: 10,
      backgroundColor: '#ffffff',
      borderRadius: 2
    },
    sendBtnGradient: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center'
    },
    sendBtnText: {
      color: theme.sendIcon,
      fontFamily: FONT_SANS,
      fontSize: 15,
      fontWeight: '800',
      marginTop: -1
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
    drawerIconBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: theme.surfaceStrong,
      alignItems: 'center',
      justifyContent: 'center'
    },
    drawerIconText: {
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
      paddingBottom: 14
    },
    chatItem: {
      borderRadius: 11,
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
      paddingHorizontal: 12,
      paddingVertical: 16,
      alignItems: 'center'
    },
    emptyHistoryText: {
      color: theme.textMute,
      fontFamily: FONT_SANS,
      fontSize: 12,
      fontWeight: '600'
    },
    drawerFooter: {
      marginTop: 8,
      paddingTop: 10,
      paddingBottom: 6,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between'
    },
    profileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8
    },
    profileAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center'
    },
    profileAvatarText: {
      color: '#ffffff',
      fontFamily: FONT_SANS,
      fontSize: 12,
      fontWeight: '800'
    },
    profileName: {
      color: theme.text,
      fontFamily: FONT_SANS,
      fontSize: 13,
      fontWeight: '700'
    },
    fireworksLayer: {
      ...StyleSheet.absoluteFillObject
    },
    fireworkRocketTrail: {
      position: 'absolute'
    },
    fireworkRocket: {
      position: 'absolute',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.82,
      shadowRadius: 6
    },
    fireworkSparkTrail: {
      position: 'absolute'
    },
    fireworkSpark: {
      position: 'absolute',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.68,
      shadowRadius: 9
    },
    actionModalOverlay: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 22
    },
    actionModalCard: {
      width: '100%',
      maxWidth: 360,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 14,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.24,
      shadowRadius: 18,
      elevation: 8
    },
    actionModalTitle: {
      fontFamily: FONT_SANS,
      fontSize: 17,
      fontWeight: '700'
    },
    actionModalContent: {
      marginTop: 8,
      fontFamily: FONT_SANS,
      fontSize: 14,
      lineHeight: 21,
      fontWeight: '500'
    },
    actionModalBtn: {
      marginTop: 14,
      alignSelf: 'flex-end',
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 8
    },
    actionModalBtnText: {
      fontFamily: FONT_SANS,
      fontSize: 13,
      fontWeight: '700'
    },
    copyToast: {
      position: 'absolute',
      bottom: 120,
      alignSelf: 'center',
      backgroundColor: 'rgba(0,0,0,0.72)',
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 8
    },
    copyToastText: {
      color: '#ffffff',
      fontFamily: FONT_SANS,
      fontSize: 13,
      fontWeight: '600'
    }
  });
}
