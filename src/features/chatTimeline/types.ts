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
  | 'source'
  | 'action'
  | 'plan'
  | 'task'
  | 'usage'
  | 'context';

export type ChatTimelineMessageRole = 'user' | 'assistant' | 'system';

export type ChatTimelineAwaitingMode = 'question' | 'approval' | 'form' | 'plan';

export type ChatTimelineDeliveryStatus = 'pending' | 'sent' | 'failed';

export type ChatTimelineRuntimeStatus =
  | 'generating'
  | 'updating'
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'error'
  | 'tool_result';

export type ChatTimelineArtifactPreviewKind = 'image' | 'text' | 'pdf' | 'unsupported';

export type ChatTimelineArtifactStatus = 'processing' | 'ready' | 'failed';

export type ChatTimelinePlanStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type ChatTimelinePlanStep = {
  taskId: string;
  description: string;
  status: ChatTimelinePlanStatus;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
  errorReason: string;
};

export type ChatTimelineErrorDetail = {
  code: string;
  category: string;
  scope: string;
  status: number | null;
  retryable: boolean | null;
  message: string;
  diagnostics: unknown;
  raw: unknown;
  technicalText: string;
};

export type ChatTimelineSourceChunk = {
  chunkId: string;
  index: number;
  content: string;
  score?: number;
  timestamp?: number;
  path?: string;
  heading?: string;
  startLine?: number;
  endLine?: number;
  pageStart?: number;
  pageEnd?: number;
  slideStart?: number;
  slideEnd?: number;
  sourceType?: string;
  matchType?: string;
};

export type ChatTimelineSource = {
  id: string;
  name: string;
  title?: string;
  icon?: string;
  url?: string;
  link?: string;
  collectionId?: string;
  collectionName?: string;
  chunkIndexes: number[];
  minIndex: number;
  chunks: ChatTimelineSourceChunk[];
};

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
  recommended?: boolean;
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

export type ChatTimelineAwaitingApprovalDecision = 'approve' | 'reject' | 'approve_rule_run';

export type ChatTimelineAwaitingPlanDecision = 'approve' | 'reject';

export type ChatTimelineAwaitingApprovalOption = {
  label: string;
  description?: string;
  decision: ChatTimelineAwaitingApprovalDecision;
};

export type ChatTimelineAwaitingApproval = {
  id: string;
  command: string;
  ruleKey?: string;
  description?: string;
  options?: ChatTimelineAwaitingApprovalOption[];
  allowFreeText?: boolean;
  freeTextPlaceholder?: string;
};

export type ChatTimelineAwaitingForm = {
  id: string;
  action?: string;
  form?: Record<string, unknown> | null;
  title?: string;
};

export type ChatTimelineAwaitingPlanInput = {
  type: 'text';
  placeholder?: string;
  required?: boolean;
};

export type ChatTimelineAwaitingPlanOption = {
  label: string;
  description?: string;
  decision: ChatTimelineAwaitingPlanDecision;
  input?: ChatTimelineAwaitingPlanInput;
};

export type ChatTimelineAwaitingPlan = {
  id: string;
  planningId?: string;
  title?: string;
  options?: ChatTimelineAwaitingPlanOption[];
};

export type ChatTimelineAwaitingInteractiveBase = {
  viewportType: string;
  viewportKey: string;
  timeout: number | null;
  agentKey: string;
};

export type ChatTimelineAwaitingInteractiveQuestion = ChatTimelineAwaitingInteractiveBase & {
  kind: 'question';
  questions: ChatTimelineAwaitingQuestion[];
};

export type ChatTimelineAwaitingInteractiveApproval = ChatTimelineAwaitingInteractiveBase & {
  kind: 'approval';
  approvals: ChatTimelineAwaitingApproval[];
};

export type ChatTimelineAwaitingInteractiveForm = ChatTimelineAwaitingInteractiveBase & {
  kind: 'form';
  forms: ChatTimelineAwaitingForm[];
};

export type ChatTimelineAwaitingInteractivePlan = ChatTimelineAwaitingInteractiveBase & {
  kind: 'plan';
  plan: ChatTimelineAwaitingPlan;
};

export type ChatTimelineAwaitingInteractive =
  | ChatTimelineAwaitingInteractiveQuestion
  | ChatTimelineAwaitingInteractiveApproval
  | ChatTimelineAwaitingInteractiveForm
  | ChatTimelineAwaitingInteractivePlan;

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
  errorDetail?: ChatTimelineErrorDetail | null;
  streaming: boolean;
  attachments: ChatMessageAttachment[];
};

export type ChatTimelineTextNode = ChatTimelineBaseNode & {
  kind: 'reasoning' | 'planning' | 'request' | 'action' | 'task' | 'usage' | 'context';
  title: string;
  body: string;
  status: ChatTimelineRuntimeStatus | string;
  streaming: boolean;
  usageSummary?: ChatTimelineUsageSummary | null;
};

export type ChatTimelineArtifactNode = ChatTimelineBaseNode & {
  kind: 'artifact';
  artifactId: string;
  name: string;
  mimeType: string;
  resourceUrl: string;
  sha256: string;
  sizeBytes: number;
  previewKind: ChatTimelineArtifactPreviewKind;
  status: ChatTimelineArtifactStatus;
  summary: string;
  errorReason: string;
};

export type ChatTimelinePlanNode = ChatTimelineBaseNode & {
  kind: 'plan';
  planId: string;
  title: string;
  summary: string;
  status: ChatTimelinePlanStatus;
  steps: ChatTimelinePlanStep[];
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
  errorReason: string;
};

export type ChatTimelineToolNode = ChatTimelineBaseNode & {
  kind: 'tool';
  agentKey: string;
  toolId: string;
  toolName: string;
  toolLabel: string;
  toolType: string;
  viewportKey: string;
  toolTimeoutMs: number | null;
  toolParams: Record<string, unknown>;
  frontendToolState: ChatTimelineFrontendToolState | null;
  description: string;
  title: string;
  status: ChatTimelineRuntimeStatus | string;
  argsText: string;
  resultText: string;
  body: string;
  streaming: boolean;
};

export type ChatTimelineFrontendToolResolution = 'submitted' | 'close' | 'done' | 'timeout';

export type ChatTimelineFrontendToolState =
  | { status: 'active' }
  | {
      status: 'resolved';
      reason: ChatTimelineFrontendToolResolution;
      resolvedAt: number;
    };

export type ChatTimelineActiveFrontendTool = {
  key: string;
  conversationId: string;
  runId: string;
  agentKey: string;
  toolId: string;
  toolName: string;
  toolLabel: string;
  toolType: 'html' | 'qlc';
  viewportKey: string;
  toolTimeoutMs: number | null;
  toolParams: Record<string, unknown>;
  description: string;
  createdAt: number;
};

export type ChatTimelineSourceNode = ChatTimelineBaseNode & {
  kind: 'source';
  publishId: string;
  sourceKind: string;
  query: string;
  sourceCount: number;
  chunkCount: number;
  sources: ChatTimelineSource[];
  errorDetail: ChatTimelineErrorDetail | null;
  malformed: boolean;
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
  status: ChatTimelineRuntimeStatus | string;
  agentKey: string;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
};

export type ChatTimelineNode =
  | ChatTimelineMessageNode
  | ChatTimelineTextNode
  | ChatTimelineArtifactNode
  | ChatTimelinePlanNode
  | ChatTimelineToolNode
  | ChatTimelineSourceNode
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

export type ChatTimelineRuntimeEntryKind = Exclude<ChatTimelineNodeKind, 'message' | 'source'>;

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
  reasoningEffort: string;
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
  activeReasoningNodeIdsByRun: Record<string, string>;
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
  | 'assistant-reply-footer'
  | 'reasoning'
  | 'planning'
  | 'tool'
  | 'tool-group'
  | 'awaiting'
  | 'artifact'
  | 'source'
  | 'action'
  | 'plan'
  | 'task'
  | 'context'
  | 'request'
  | 'system-message';

export type ChatTimelineNodeDisplayItem = {
  key: string;
  kind: Exclude<ChatTimelineDisplayItemKind, 'tool-group' | 'assistant-reply-footer'>;
  node: ChatTimelineNode;
  nodeId: string;
  runId: string;
  isFirstInRun: boolean;
  isLastInRun: boolean;
  groupIndex: number;
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
};

export type ChatTimelineAssistantReplyFooterDisplayItem = {
  key: string;
  kind: 'assistant-reply-footer';
  runId: string;
  footer: ChatTimelineAssistantReplyFooter;
};

export type ChatTimelineDisplayItem =
  | ChatTimelineNodeDisplayItem
  | ChatTimelineToolGroupDisplayItem
  | ChatTimelineAssistantReplyFooterDisplayItem;
