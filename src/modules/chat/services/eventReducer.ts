// @ts-nocheck
import { toDisplayText } from '../../../shared/utils/format';
import {
  ChatEvent,
  ChatRuntimeMaps,
  ChatState,
  TimelineEntry
} from '../types/chat';
import {
  FRONTEND_VIEWPORT_TYPES,
  isFrontendToolEvent,
  normalizeEventType,
  normalizePlanTask,
  normalizeTaskStatus,
  parseStructuredArgs,
  renderActionLabel,
  renderToolLabel
} from './eventNormalizer';

export interface ChatEffect {
  type: 'set_chat_id' | 'execute_action' | 'stream_end' | 'activate_frontend_tool';
  payload?: Record<string, unknown>;
}

export function createEmptyChatState(): ChatState {
  return {
    timeline: [],
    planState: {
      planId: '',
      tasks: [],
      expanded: false,
      lastTaskId: ''
    },
    activeFrontendTool: null,
    actionModal: {
      visible: false,
      title: '',
      content: '',
      closeText: '关闭'
    },
    chatId: '',
    statusText: '',
    streaming: false,
    expandedTools: {}
  };
}

export function createRuntimeMaps(): ChatRuntimeMaps {
  return {
    sequence: 0,
    contentIdMap: new Map(),
    toolIdMap: new Map(),
    actionIdMap: new Map(),
    reasoningIdMap: new Map(),
    actionStateMap: new Map(),
    toolStateMap: new Map(),
    runId: ''
  };
}

function nextId(runtime: ChatRuntimeMaps, prefix: string): string {
  runtime.sequence += 1;
  return `${prefix}:${runtime.sequence}`;
}

function upsertEntry(next: ChatState, id: string, builder: (old: TimelineEntry | null) => TimelineEntry | null): void {
  const index = next.timeline.findIndex((entry) => entry.id === id);
  if (index === -1) {
    const created = builder(null);
    if (created) next.timeline = [...next.timeline, created];
    return;
  }

  const replaced = builder(next.timeline[index]);
  if (!replaced) return;
  next.timeline = next.timeline.slice();
  next.timeline[index] = replaced;
}

function appendEntry(next: ChatState, entry: TimelineEntry): void {
  next.timeline = [...next.timeline, entry];
}

function resolveToolLabel(
  oldLabel: string,
  event: Record<string, unknown>,
  toolState?: { toolName?: string; toolKey?: string }
): string {
  const bestName = String(event.toolName || toolState?.toolName || '').trim();
  if (bestName) return bestName;

  const fallback = renderToolLabel({
    ...event,
    toolKey: String(event.toolKey || toolState?.toolKey || '')
  });

  if (!oldLabel || oldLabel === 'tool') {
    return fallback;
  }
  return oldLabel;
}

function resolveActionLabel(
  oldLabel: string,
  event: Record<string, unknown>,
  actionState?: { actionName?: string }
): string {
  const bestName = String(event.actionName || actionState?.actionName || '').trim();
  if (bestName) return bestName;
  const description = String(event.description || '').trim();
  if (description) return description;
  if (oldLabel && oldLabel !== 'action') return oldLabel;
  return renderActionLabel(event);
}

function parseEventTime(value: unknown): number | null {
  if (value == null || value === '') return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 0 && value < 1e11) return Math.floor(value * 1000);
    return value;
  }

  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return null;
    const numeric = Number(raw);
    if (!Number.isNaN(numeric)) {
      if (numeric > 0 && numeric < 1e11) return Math.floor(numeric * 1000);
      return numeric;
    }
    const parsed = new Date(raw).getTime();
    if (!Number.isNaN(parsed)) return parsed;
  }

  const parsed = new Date(value as string | number | Date).getTime();
  if (!Number.isNaN(parsed)) return parsed;
  return null;
}

function resolveEventTs(event: Record<string, unknown>, source: 'live' | 'history'): number {
  for (const key of ['timestamp', 'ts', 'time', 'createdAt', 'updatedAt', 'updateTime', 'startTime', 'startTimestamp']) {
    const ms = parseEventTime(event[key]);
    if (ms != null) return ms;
  }
  return source === 'live' ? Date.now() : parseEventTime(event.timestamp) || Date.now();
}

function resolveEndTs(event: Record<string, unknown>, source: 'live' | 'history'): number {
  for (const key of ['completedAt', 'finishedAt', 'endTime', 'endTimestamp', 'timestamp', 'ts']) {
    const ms = parseEventTime(event[key]);
    if (ms != null) return ms;
  }
  return resolveEventTs(event, source);
}

export function reduceChatEvent(
  prev: ChatState,
  rawEvent: ChatEvent,
  source: 'live' | 'history',
  runtime: ChatRuntimeMaps
): { next: ChatState; effects: ChatEffect[] } {
  if (!rawEvent || typeof rawEvent !== 'object') {
    return { next: prev, effects: [] };
  }

  const event = rawEvent as Record<string, unknown>;
  const effects: ChatEffect[] = [];
  const next: ChatState = {
    ...prev,
    timeline: [...prev.timeline],
    planState: { ...prev.planState, tasks: [...prev.planState.tasks] },
    expandedTools: { ...prev.expandedTools }
  };

  if (event.chatId) {
    const chatId = String(event.chatId);
    next.chatId = chatId;
    effects.push({ type: 'set_chat_id', payload: { chatId } });
  }

  const ts = resolveEventTs(event, source);
  const type = normalizeEventType(event.type);

  if (type === 'request.query') {
    const requestId = String(event.requestId || nextId(runtime, 'request'));
    const itemId = `message:user:${requestId}`;
    upsertEntry(next, itemId, (old) => ({
      ...(old || {}),
      id: itemId,
      kind: 'message',
      role: 'user',
      text: String(event.message || ''),
      ts
    }) as TimelineEntry);
    return { next, effects };
  }

  if (type === 'chat.start') {
    return { next, effects };
  }

  if (type === 'run.start') {
    if (event.runId) {
      runtime.runId = String(event.runId);
    }
    return { next, effects };
  }

  if (type === 'run.complete' || type === 'run.cancel') {
    next.streaming = false;
    next.activeFrontendTool = null;

    const finishedRunId = String(event.runId || runtime.runId || '');
    const itemId = finishedRunId ? `run:end:${finishedRunId}` : nextId(runtime, 'run_end');
    const endTs = resolveEndTs(event, source);

    upsertEntry(next, itemId, (old) => ({
      ...(old || {}),
      id: itemId,
      kind: 'message',
      role: 'system',
      variant: 'run_end',
      tone: type === 'run.cancel' ? 'warn' : 'ok',
      text: type === 'run.cancel' ? '本次运行已取消' : '本次运行结束',
      ts: endTs
    }) as TimelineEntry);

    effects.push({ type: 'stream_end' });
    return { next, effects };
  }

  if (type === 'run.error') {
    next.streaming = false;
    next.activeFrontendTool = null;
    appendEntry(next, {
      id: nextId(runtime, 'system'),
      kind: 'message',
      role: 'system',
      text: `run.error: ${toDisplayText(event.error || event)}`,
      ts
    });
    effects.push({ type: 'stream_end' });
    return { next, effects };
  }

  if (type === 'plan.update') {
    const tasks = Array.isArray(event.plan)
      ? event.plan.map((task, index) => normalizePlanTask((task || {}) as Record<string, unknown>, index))
      : [];
    next.planState = {
      ...next.planState,
      planId: String(event.planId || next.planState.planId || ''),
      tasks,
      expanded: next.planState.expanded,
      lastTaskId: tasks.find((task) => task.status === 'running')?.taskId || next.planState.lastTaskId
    };
    return { next, effects };
  }

  if (type === 'task.start' || type === 'task.end' || type === 'task.complete' || type === 'task.fail' || type === 'task.cancel') {
    const taskId = String(event.taskId || '');
    if (!taskId) {
      return { next, effects };
    }
    const idx = next.planState.tasks.findIndex((task) => task.taskId === taskId);
    const description = String(event.description || event.taskName || taskId);

    const resolvedStatus = type === 'task.start'
      ? 'running'
      : type === 'task.fail'
        ? 'failed'
        : type === 'task.cancel'
          ? 'done'
          : normalizeTaskStatus(event.status || (event.error ? 'failed' : 'done'));

    if (idx === -1) {
      next.planState.tasks.push({
        taskId,
        description,
        status: resolvedStatus
      });
    } else {
      next.planState.tasks[idx] = {
        ...next.planState.tasks[idx],
        description,
        status: resolvedStatus
      };
    }

    next.planState.lastTaskId = taskId;
    return { next, effects };
  }

  if ((type === 'action.start' || type === 'action.snapshot') && event.actionId) {
    const actionId = String(event.actionId);
    const actionName = String(event.actionName || '').trim();
    const description = String(event.description || '').trim();
    let itemId = runtime.actionIdMap.get(actionId);
    if (!itemId) {
      itemId = nextId(runtime, 'action');
      runtime.actionIdMap.set(actionId, itemId);
    }

    const actionState = runtime.actionStateMap.get(actionId) || {
      actionName,
      argsText: '',
      resultText: '',
      executed: false
    };
    actionState.actionName = actionName || actionState.actionName || '';
    runtime.actionStateMap.set(actionId, actionState);

    upsertEntry(next, itemId, (old) => ({
      ...(old || {}),
      id: itemId,
      kind: 'action',
      actionName: actionState.actionName,
      label: resolveActionLabel(String((old as Record<string, unknown> | null)?.label || ''), event, actionState),
      description: description || String((old as Record<string, unknown> | null)?.description || ''),
      argsText: String((old as Record<string, unknown> | null)?.argsText || actionState.argsText || ''),
      resultText: String((old as Record<string, unknown> | null)?.resultText || actionState.resultText || ''),
      state: 'running',
      ts
    }) as TimelineEntry);

    return { next, effects };
  }

  if (type === 'action.args' && event.actionId) {
    const actionId = String(event.actionId);
    let itemId = runtime.actionIdMap.get(actionId);
    if (!itemId) {
      itemId = nextId(runtime, 'action');
      runtime.actionIdMap.set(actionId, itemId);
    }

    const deltaText = String(event.delta || '');
    const stateInRef = runtime.actionStateMap.get(actionId) || {
      actionName: String(event.actionName || '').trim(),
      argsText: '',
      resultText: '',
      executed: false
    };
    stateInRef.argsText = `${stateInRef.argsText || ''}${deltaText}`;
    runtime.actionStateMap.set(actionId, stateInRef);

    upsertEntry(next, itemId, (old) => ({
      ...(old || {}),
      id: itemId,
      kind: 'action',
      actionName: String((old as Record<string, unknown> | null)?.actionName || stateInRef.actionName || ''),
      label: resolveActionLabel(String((old as Record<string, unknown> | null)?.label || ''), event, stateInRef),
      description: String((old as Record<string, unknown> | null)?.description || event.description || ''),
      argsText: `${String((old as Record<string, unknown> | null)?.argsText || '')}${deltaText}`,
      resultText: String((old as Record<string, unknown> | null)?.resultText || ''),
      state: String((old as Record<string, unknown> | null)?.state || 'running') as 'init' | 'running' | 'done' | 'failed',
      ts
    }) as TimelineEntry);

    return { next, effects };
  }

  if (type === 'action.result' && event.actionId) {
    const actionId = String(event.actionId);
    let itemId = runtime.actionIdMap.get(actionId);
    if (!itemId) {
      itemId = nextId(runtime, 'action');
      runtime.actionIdMap.set(actionId, itemId);
    }

    const nextResult = toDisplayText(Object.prototype.hasOwnProperty.call(event, 'result') ? event.result : event.output);
    const stateInRef = runtime.actionStateMap.get(actionId) || {
      actionName: String(event.actionName || '').trim(),
      argsText: '',
      resultText: '',
      executed: false
    };
    stateInRef.resultText = nextResult || stateInRef.resultText || '';
    runtime.actionStateMap.set(actionId, stateInRef);

    upsertEntry(next, itemId, (old) => ({
      ...(old || {}),
      id: itemId,
      kind: 'action',
      actionName: String((old as Record<string, unknown> | null)?.actionName || stateInRef.actionName || ''),
      label: resolveActionLabel(String((old as Record<string, unknown> | null)?.label || ''), event, stateInRef),
      description: String((old as Record<string, unknown> | null)?.description || event.description || ''),
      argsText: String((old as Record<string, unknown> | null)?.argsText || stateInRef.argsText || ''),
      resultText: nextResult || String((old as Record<string, unknown> | null)?.resultText || ''),
      state: event.error ? 'failed' : (String((old as Record<string, unknown> | null)?.state || 'running') as 'init' | 'running' | 'done' | 'failed'),
      ts
    }) as TimelineEntry);

    return { next, effects };
  }

  if (type === 'action.end' && event.actionId) {
    const actionId = String(event.actionId);
    let itemId = runtime.actionIdMap.get(actionId);
    if (!itemId) {
      itemId = nextId(runtime, 'action');
      runtime.actionIdMap.set(actionId, itemId);
    }

    const stateInRef = runtime.actionStateMap.get(actionId) || {
      actionName: String(event.actionName || '').trim(),
      argsText: '',
      resultText: '',
      executed: false
    };
    stateInRef.actionName = String(event.actionName || stateInRef.actionName || '').trim();
    runtime.actionStateMap.set(actionId, stateInRef);

    upsertEntry(next, itemId, (old) => ({
      ...(old || {}),
      id: itemId,
      kind: 'action',
      actionName: String((old as Record<string, unknown> | null)?.actionName || stateInRef.actionName || ''),
      label: resolveActionLabel(String((old as Record<string, unknown> | null)?.label || ''), event, stateInRef),
      description: String((old as Record<string, unknown> | null)?.description || event.description || ''),
      argsText: String((old as Record<string, unknown> | null)?.argsText || stateInRef.argsText || ''),
      resultText: String((old as Record<string, unknown> | null)?.resultText || stateInRef.resultText || ''),
      state: event.error ? 'failed' : String((old as Record<string, unknown> | null)?.state) === 'failed' ? 'failed' : 'done',
      ts
    }) as TimelineEntry);

    if (source === 'live' && !stateInRef.executed) {
      stateInRef.executed = true;
      runtime.actionStateMap.set(actionId, stateInRef);
      effects.push({
        type: 'execute_action',
        payload: {
          actionName: stateInRef.actionName,
          args: parseStructuredArgs(stateInRef.argsText) || undefined
        }
      });
    }

    return { next, effects };
  }

  if ((type === 'tool.start' || type === 'tool.snapshot') && event.toolId) {
    const toolId = String(event.toolId);
    let itemId = runtime.toolIdMap.get(toolId);
    if (!itemId) {
      itemId = nextId(runtime, 'tool');
      runtime.toolIdMap.set(toolId, itemId);
    }

    const toolState = runtime.toolStateMap.get(toolId) || {
      toolId,
      argsBuffer: '',
      toolName: '',
      toolType: '',
      toolKey: '',
      toolTimeout: null,
      toolParams: null,
      runId: ''
    };
    toolState.toolName = String(event.toolName || toolState.toolName || '');
    toolState.toolType = String(event.toolType || toolState.toolType || '');
    toolState.toolKey = String(event.toolKey || toolState.toolKey || '');
    toolState.toolTimeout = (event.toolTimeout as number | null | undefined) ?? toolState.toolTimeout;
    toolState.runId = String(event.runId || toolState.runId || runtime.runId);

    if (event.toolParams && typeof event.toolParams === 'object') {
      toolState.toolParams = event.toolParams as Record<string, unknown>;
    }

    // 从 snapshot 事件中提取 argsText（历史加载时 tool.snapshot 携带完整参数）
    let snapshotArgsText = '';
    if (typeof event.arguments === 'string' && event.arguments) {
      snapshotArgsText = event.arguments;
    } else if (event.toolParams && typeof event.toolParams === 'object') {
      try { snapshotArgsText = JSON.stringify(event.toolParams); } catch {}
    }
    if (snapshotArgsText && !toolState.argsBuffer) {
      toolState.argsBuffer = snapshotArgsText;
    }

    runtime.toolStateMap.set(toolId, toolState);

    upsertEntry(next, itemId, (old) => ({
      ...(old || {}),
      id: itemId,
      kind: 'tool',
      label: resolveToolLabel(String((old as Record<string, unknown> | null)?.label || ''), event, toolState),
      argsText: String((old as Record<string, unknown> | null)?.argsText || snapshotArgsText || ''),
      resultText: String((old as Record<string, unknown> | null)?.resultText || ''),
      state: 'running',
      ts
    }) as TimelineEntry);

    if (source === 'live' && isFrontendToolEvent({ toolType: toolState.toolType, toolKey: toolState.toolKey })) {
      effects.push({
        type: 'activate_frontend_tool',
        payload: {
          runId: toolState.runId || runtime.runId,
          toolId: toolState.toolId,
          toolKey: toolState.toolKey,
          toolType: toolState.toolType,
          toolName: toolState.toolName || toolState.toolKey,
          toolTimeout: toolState.toolTimeout,
          toolParams: toolState.toolParams || undefined
        }
      });
    }

    return { next, effects };
  }

  if (type === 'tool.args' && event.toolId) {
    const toolId = String(event.toolId);
    let itemId = runtime.toolIdMap.get(toolId);
    if (!itemId) {
      itemId = nextId(runtime, 'tool');
      runtime.toolIdMap.set(toolId, itemId);
    }

    const deltaText = String(event.delta || '');
    const toolState = runtime.toolStateMap.get(toolId) || {
      toolId,
      argsBuffer: '',
      toolName: '',
      toolType: '',
      toolKey: '',
      toolTimeout: null,
      toolParams: null,
      runId: runtime.runId
    };
    toolState.argsBuffer = (toolState.argsBuffer || '') + deltaText;

    if (!toolState.toolParams) {
      try {
        const parsed = JSON.parse(toolState.argsBuffer) as Record<string, unknown>;
        if (parsed && typeof parsed === 'object') {
          toolState.toolParams = parsed;
        }
      } catch {
        // noop
      }
    }

    runtime.toolStateMap.set(toolId, toolState);

    upsertEntry(next, itemId, (old) => ({
      ...(old || {}),
      id: itemId,
      kind: 'tool',
      label: resolveToolLabel(String((old as Record<string, unknown> | null)?.label || ''), event, toolState),
      argsText: `${String((old as Record<string, unknown> | null)?.argsText || '')}${deltaText}`,
      resultText: String((old as Record<string, unknown> | null)?.resultText || ''),
      state: String((old as Record<string, unknown> | null)?.state || 'running') as 'init' | 'running' | 'done' | 'failed',
      ts
    }) as TimelineEntry);

    return { next, effects };
  }

  if (type === 'tool.result' && event.toolId) {
    const toolId = String(event.toolId);
    let itemId = runtime.toolIdMap.get(toolId);
    if (!itemId) {
      itemId = nextId(runtime, 'tool');
      runtime.toolIdMap.set(toolId, itemId);
    }

    const nextResult = toDisplayText(Object.prototype.hasOwnProperty.call(event, 'result') ? event.result : event.output);
    const toolState = runtime.toolStateMap.get(toolId);
    upsertEntry(next, itemId, (old) => ({
      ...(old || {}),
      id: itemId,
      kind: 'tool',
      label: resolveToolLabel(String((old as Record<string, unknown> | null)?.label || ''), event, toolState),
      argsText: String((old as Record<string, unknown> | null)?.argsText || ''),
      resultText: nextResult || String((old as Record<string, unknown> | null)?.resultText || ''),
      state: event.error
        ? 'failed'
        : (nextResult || String((old as Record<string, unknown> | null)?.resultText || ''))
          ? 'done'
          : (String((old as Record<string, unknown> | null)?.state || 'running') as 'init' | 'running' | 'done' | 'failed'),
      ts
    }) as TimelineEntry);

    return { next, effects };
  }

  if (type === 'tool.end' && event.toolId) {
    const toolId = String(event.toolId);
    let itemId = runtime.toolIdMap.get(toolId);
    if (!itemId) {
      itemId = nextId(runtime, 'tool');
      runtime.toolIdMap.set(toolId, itemId);
    }

    const toolState = runtime.toolStateMap.get(toolId);
    upsertEntry(next, itemId, (old) => ({
      ...(old || {}),
      id: itemId,
      kind: 'tool',
      label: resolveToolLabel(String((old as Record<string, unknown> | null)?.label || ''), event, toolState),
      argsText: String((old as Record<string, unknown> | null)?.argsText || ''),
      resultText: String((old as Record<string, unknown> | null)?.resultText || ''),
      state: event.error ? 'failed' : String((old as Record<string, unknown> | null)?.state) === 'failed' ? 'failed' : 'done',
      ts
    }) as TimelineEntry);

    return { next, effects };
  }

  if (type.startsWith('reasoning.') && (event.reasoningId || event.runId || event.contentId)) {
    const reasoningId = String(event.reasoningId || event.runId || event.contentId);
    let itemId = runtime.reasoningIdMap.get(reasoningId);
    if (!itemId) {
      itemId = nextId(runtime, 'reasoning');
      runtime.reasoningIdMap.set(reasoningId, itemId);
    }

    if (type === 'reasoning.start') {
      upsertEntry(next, itemId, (old) => ({
        ...(old || {}),
        id: itemId,
        kind: 'reasoning',
        text: String(event.text || ''),
        collapsed: false,
        startTs: Date.now(),
        ts
      }) as TimelineEntry);
      return { next, effects };
    }

    if (type === 'reasoning.delta') {
      upsertEntry(next, itemId, (old) => ({
        ...(old || {}),
        id: itemId,
        kind: 'reasoning',
        text: `${String((old as Record<string, unknown> | null)?.text || '')}${String(event.delta || '')}`,
        collapsed: false,
        ts
      }) as TimelineEntry);
      return { next, effects };
    }

    if (type === 'reasoning.end') {
      upsertEntry(next, itemId, (old) => ({
        ...(old || {}),
        id: itemId,
        kind: 'reasoning',
        collapsed: false,
        endTs: Date.now(),
        ts
      }) as TimelineEntry);
      return { next, effects };
    }

    if (type === 'reasoning.snapshot') {
      upsertEntry(next, itemId, (old) => ({
        ...(old || {}),
        id: itemId,
        kind: 'reasoning',
        text: String(event.text || event.content || ''),
        collapsed: true,
        startTs: resolveEventTs(event, source),
        endTs: resolveEndTs(event, source),
        ts
      }) as TimelineEntry);
      return { next, effects };
    }
  }

  if (
    (type === 'content.start' || type === 'content.delta' || type === 'content.snapshot' || type === 'content.end') &&
    (event.contentId || event.runId || event.messageId || event.requestId)
  ) {
    const contentId = String(event.contentId || event.runId || event.messageId || event.requestId);
    let itemId = runtime.contentIdMap.get(contentId);
    if (!itemId) {
      itemId = nextId(runtime, 'assistant');
      runtime.contentIdMap.set(contentId, itemId);
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

      upsertEntry(next, itemId, (old) => ({
        ...(old || {}),
        id: itemId,
        kind: 'message',
        role: 'assistant',
        text: seedText || String((old as Record<string, unknown> | null)?.text || ''),
        isStreamingContent: source === 'live',
        ts
      }) as TimelineEntry);
      return { next, effects };
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

      upsertEntry(next, itemId, (old) => ({
        ...(old || {}),
        id: itemId,
        kind: 'message',
        role: 'assistant',
        text: `${String((old as Record<string, unknown> | null)?.text || '')}${deltaText}`,
        isStreamingContent: source === 'live',
        ts
      }) as TimelineEntry);
      return { next, effects };
    }

    if (type === 'content.snapshot') {
      upsertEntry(next, itemId, (old) => ({
        ...(old || {}),
        id: itemId,
        kind: 'message',
        role: 'assistant',
        text:
          (typeof event.text === 'string'
            ? event.text
            : typeof event.content === 'string'
              ? event.content
              : '') || String((old as Record<string, unknown> | null)?.text || ''),
        isStreamingContent: false,
        ts
      }) as TimelineEntry);
      return { next, effects };
    }

    if (type === 'content.end') {
      const nextText = typeof event.text === 'string' ? event.text : '';
      upsertEntry(next, itemId, (old) => ({
        ...(old || {}),
        id: itemId,
        kind: 'message',
        role: 'assistant',
        text: nextText || String((old as Record<string, unknown> | null)?.text || ''),
        isStreamingContent: false,
        ts
      }) as TimelineEntry);
      return { next, effects };
    }
  }

  if (source === 'live' && type && FRONTEND_VIEWPORT_TYPES.has(type)) {
    // reserved extension point
  }

  return { next, effects };
}
