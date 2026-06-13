import type { ChatMessageAttachment } from '../chatPersistence/types.ts';

export type ChatTimelineLifecycle = 'active' | 'complete' | 'error' | 'cancelled';

export type ChatTimelineNodeKind =
  | 'message'
  | 'reasoning'
  | 'planning'
  | 'tool'
  | 'awaiting'
  | 'run'
  | 'request'
  | 'artifact'
  | 'action'
  | 'plan'
  | 'task'
  | 'usage'
  | 'context';

export type ChatTimelineMessageRole = 'user' | 'assistant' | 'system';

export type ChatTimelineAwaitingMode = 'question' | 'approval' | 'form' | 'plan';

export type ChatTimelineDeliveryStatus = 'pending' | 'sent' | 'failed';

export type ChatTimelineAwaitingQuestionType =
  | 'text'
  | 'number'
  | 'select'
  | 'multi-select'
  | 'password'
  | 'date'
  | 'datetime';

export type ChatTimelineAwaitingQuestionOption = {
  label: string;
  description?: string;
  previewHtml?: string;
  value?: string;
};

export type ChatTimelineAwaitingQuestion = {
  id: string;
  type: ChatTimelineAwaitingQuestionType;
  header?: string;
  question: string;
  placeholder?: string;
  options?: ChatTimelineAwaitingQuestionOption[];
  allowFreeText?: boolean;
  freeTextPlaceholder?: string;
};

export type ChatTimelineAwaitingInteractiveQuestion = {
  kind: 'question';
  viewportType: string;
  viewportKey: string;
  timeout: number | null;
  agentKey: string;
  questions: ChatTimelineAwaitingQuestion[];
};

export type ChatTimelineAwaitingInteractive = ChatTimelineAwaitingInteractiveQuestion;

export type ChatTimelineAwaitingAnswerDisplayItem = {
  key: string;
  title: string;
  value: string;
};

export type ChatTimelineAwaitingAnswerSummary = {
  status: 'answered' | 'error';
  title: string;
  itemCount: number;
  items: ChatTimelineAwaitingAnswerDisplayItem[];
  copyText: string;
};

export type ChatTimelineBaseNode = {
  id: string;
  kind: ChatTimelineNodeKind;
  runId: string;
  createdAt: number;
  updatedAt: number;
  order: number;
  lifecycle: ChatTimelineLifecycle;
};

export type ChatTimelineMessageNode = ChatTimelineBaseNode & {
  kind: 'message';
  role: ChatTimelineMessageRole;
  content: string;
  messageId: string;
  clientMessageId: string | null;
  serverMessageId: string | null;
  deliveryStatus: ChatTimelineDeliveryStatus;
  errorReason: string | null;
  streaming: boolean;
  attachments: ChatMessageAttachment[];
};

export type ChatTimelineTextNode = ChatTimelineBaseNode & {
  kind:
    | 'reasoning'
    | 'planning'
    | 'request'
    | 'artifact'
    | 'action'
    | 'plan'
    | 'task'
    | 'usage'
    | 'context';
  title: string;
  body: string;
  status: string;
  streaming: boolean;
  usageSummary?: ChatTimelineUsageSummary | null;
};

export type ChatTimelineToolNode = ChatTimelineBaseNode & {
  kind: 'tool';
  toolId: string;
  toolName: string;
  toolLabel: string;
  description: string;
  title: string;
  status: string;
  argsText: string;
  resultText: string;
  body: string;
  streaming: boolean;
};

export type ChatTimelineAwaitingNode = ChatTimelineBaseNode & {
  kind: 'awaiting';
  awaitingId: string;
  prompt: string;
  answer: string;
  payloadText: string;
  mode: ChatTimelineAwaitingMode;
  status: 'ask' | 'answer';
  interactive: ChatTimelineAwaitingInteractive | null;
  answerSummary?: ChatTimelineAwaitingAnswerSummary | null;
};

export type ChatTimelineRunNode = ChatTimelineBaseNode & {
  kind: 'run';
  title: string;
  body: string;
  status: string;
  agentKey: string;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
};

export type ChatTimelineNode =
  | ChatTimelineMessageNode
  | ChatTimelineTextNode
  | ChatTimelineToolNode
  | ChatTimelineAwaitingNode
  | ChatTimelineRunNode;

export type ChatTimelineAwaitingState = {
  id: string;
  awaitingId: string;
  runId: string;
  createdAt: number;
  prompt: string;
  answer: string;
  payloadText: string;
  mode: ChatTimelineAwaitingMode;
  status: 'ask' | 'answer';
  interactive: ChatTimelineAwaitingInteractive | null;
  answerSummary?: ChatTimelineAwaitingAnswerSummary | null;
  updatedAt: number;
};

export type ChatTimelineRuntimeEntryKind = Exclude<ChatTimelineNodeKind, 'message'>;

export type ChatTimelineRuntimeEntry = {
  id: string;
  kind: ChatTimelineRuntimeEntryKind;
  title: string;
  body: string;
  status: string;
  lifecycle: ChatTimelineLifecycle;
  updatedAt: number;
  streaming: boolean;
};

export type ChatTimelineRuntimeState = {
  conversationId: string;
  entries: ChatTimelineRuntimeEntry[];
  awaiting: ChatTimelineAwaitingState | null;
  usageLabel: string;
  updatedAt: number;
};

export type ChatTimelineUsageStats = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  reasoningTokens: number | null;
  cacheHitTokens: number | null;
  cacheMissTokens: number | null;
  llmChatCompletionCount: number | null;
  toolCallCount: number | null;
  estimatedCost: ChatTimelineUsageEstimatedCost | null;
};

export type ChatTimelineUsageEstimatedCost = {
  currency: string;
  inputCacheHit: number | null;
  inputCacheMiss: number | null;
  output: number | null;
  total: number | null;
};

export type ChatTimelineUsageContextWindow = {
  currentSize: number | null;
  maxSize: number | null;
  estimatedNextCallSize: number | null;
  percent: number | null;
};

export type ChatTimelineUsageSummary = {
  label: string;
  modelKey: string;
  contextWindow: ChatTimelineUsageContextWindow;
  current: ChatTimelineUsageStats;
  run: ChatTimelineUsageStats;
  chat: ChatTimelineUsageStats;
  compact: ChatTimelineUsageStats | null;
  updatedAt: number;
};

export type ChatTimelineAssistantReplyFooter = {
  copyText: string;
  timestamp: number;
  durationMs: number | null;
  errorReason: string | null;
};

export type ChatTimelineState = {
  conversationId: string;
  orderedNodeIds: string[];
  nodesById: Record<string, ChatTimelineNode>;
  activeRunId: string;
  awaiting: ChatTimelineAwaitingState | null;
  usageLabel: string;
  usageSummary: ChatTimelineUsageSummary | null;
  updatedAt: number;
  revision: number;
  nextOrder: number;
};

export type ChatTimelineDisplayItemKind =
  | 'user-query'
  | 'assistant-content'
  | 'reasoning'
  | 'planning'
  | 'tool'
  | 'tool-group'
  | 'awaiting'
  | 'artifact'
  | 'action'
  | 'plan'
  | 'task'
  | 'context'
  | 'request'
  | 'system-message';

export type ChatTimelineNodeDisplayItem = {
  key: string;
  kind: Exclude<ChatTimelineDisplayItemKind, 'tool-group'>;
  node: ChatTimelineNode;
  nodeId: string;
  runId: string;
  isFirstInRun: boolean;
  isLastInRun: boolean;
  groupIndex: number;
  assistantReplyFooter?: ChatTimelineAssistantReplyFooter | null;
};

export type ChatTimelineToolGroupDisplayItem = {
  key: string;
  kind: 'tool-group';
  node: ChatTimelineToolNode;
  nodes: ChatTimelineToolNode[];
  nodeId: string;
  runId: string;
  isFirstInRun: boolean;
  isLastInRun: boolean;
  groupIndex: number;
  toolName: string;
  toolLabel: string;
  count: number;
  assistantReplyFooter?: ChatTimelineAssistantReplyFooter | null;
};

export type ChatTimelineDisplayItem =
  | ChatTimelineNodeDisplayItem
  | ChatTimelineToolGroupDisplayItem;
