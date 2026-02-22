export type EventSourceType = 'live' | 'history';

export interface PlanTask {
  taskId: string;
  description: string;
  status: 'init' | 'running' | 'done' | 'failed';
}

export interface PlanState {
  planId: string;
  tasks: PlanTask[];
  expanded: boolean;
  lastTaskId: string;
}

export interface FrontendToolState {
  runId?: string;
  toolId: string;
  toolKey: string;
  toolType: string;
  toolName: string;
  toolTimeout?: number | null;
  toolParams?: Record<string, unknown> | null;
  paramsReady: boolean;
  paramsError: string;
  argsText: string;
  missingChunkIndexes?: number[];
  chunkGapDetected?: boolean;
  toolInitDispatched: boolean;
  userInteracted?: boolean;
  initAttempt?: number;
  initLastSentAtMs?: number;
  viewportHtml: string | null;
  loading: boolean;
  loadError: string;
}

export interface TimelineBase {
  id: string;
  kind: 'message' | 'tool' | 'action' | 'reasoning';
  ts: number;
}

export interface MessageEntry extends TimelineBase {
  kind: 'message';
  role: 'user' | 'assistant' | 'system';
  text: string;
  variant?: 'run_end';
  tone?: 'ok' | 'warn' | 'danger' | 'neutral';
  isStreamingContent?: boolean;
}

export interface ToolEntry extends TimelineBase {
  kind: 'tool';
  label: string;
  argsText: string;
  resultText: string;
  state: 'init' | 'running' | 'done' | 'failed';
}

export interface ActionEntry extends TimelineBase {
  kind: 'action';
  actionName: string;
  label: string;
  description: string;
  argsText: string;
  resultText: string;
  state: 'init' | 'running' | 'done' | 'failed';
}

export interface ReasoningEntry extends TimelineBase {
  kind: 'reasoning';
  text: string;
  collapsed: boolean;
  startTs?: number;
  endTs?: number;
}

export type TimelineEntry = MessageEntry | ToolEntry | ActionEntry | ReasoningEntry;

export interface ActionModalState {
  visible: boolean;
  title: string;
  content: string;
  closeText: string;
}

export interface ChatRuntimeMaps {
  sequence: number;
  contentIdMap: Map<string, string>;
  toolIdMap: Map<string, string>;
  actionIdMap: Map<string, string>;
  reasoningIdMap: Map<string, string>;
  actionStateMap: Map<
    string,
    { actionName: string; argsText: string; resultText: string; executed: boolean }
  >;
  toolStateMap: Map<
    string,
    {
      toolId: string;
      argsBuffer: string;
      toolName: string;
      toolType: string;
      toolKey: string;
      toolTimeout: number | null;
      toolParams: Record<string, unknown> | null;
      argsChunksByIndex: Record<number, string>;
      maxChunkIndex: number;
      hasChunkGap: boolean;
      missingChunkIndexes: number[];
      runId: string;
    }
  >;
  runId: string;
}

export interface ChatState {
  timeline: TimelineEntry[];
  planState: PlanState;
  activeFrontendTool: FrontendToolState | null;
  actionModal: ActionModalState;
  chatId: string;
  statusText: string;
  streaming: boolean;
  expandedTools: Record<string, boolean>;
}

export type ChatEvent = Record<string, unknown>;
