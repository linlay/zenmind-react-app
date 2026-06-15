import {
  buildAssistantMessageId,
  buildFallbackAssistantMessageId,
  classifyChatProtocolEvent,
  extractEventText,
  normalizeEventType,
  toFiniteNumber,
  toText,
} from '../../core/api/services/chatEventProtocol.ts';
import type { ChatMessageItem } from '../chatPersistence/types.ts';
import {
  areChatAttachmentsEqual,
  createMessageAttachmentsFromReferences,
} from '../chatPersistence/chatAttachmentModels.ts';
import type {
  ChatTimelineAwaitingAnswerSummary,
  ChatTimelineAwaitingInteractive,
  ChatTimelineAwaitingMode,
  ChatTimelineAwaitingNode,
  ChatTimelineAwaitingQuestion,
  ChatTimelineAwaitingQuestionOption,
  ChatTimelineAwaitingQuestionType,
  ChatTimelineDeliveryStatus,
  ChatTimelineLifecycle,
  ChatTimelineMessageNode,
  ChatTimelineNode,
  ChatTimelineNodeKind,
  ChatTimelineRunNode,
  ChatTimelineState,
  ChatTimelineTextNode,
  ChatTimelineToolNode,
} from './types.ts';
import { buildChatTimelineUsageSummary, chatTimelineUsageSummaryEquals } from './usageSummary.ts';

export type MergeChatTimelineStateOptions = {
  preserveTerminalRunIds?: readonly string[];
};

const REASONING_PROCESS_TITLE = '思考过程';

function normalizeConversationId(conversationId: string): string {
  return String(conversationId || '').trim();
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return isObjectRecord(value) && !Array.isArray(value);
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (isObjectRecord(value)) {
    return Object.keys(value).length > 0;
  }
  return true;
}

function safeJson(value: unknown): string {
  if (!isObjectRecord(value) && !Array.isArray(value)) {
    return '';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

function formattedValueText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
    } catch {
      return trimmed;
    }
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (isObjectRecord(value) || Array.isArray(value)) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return '';
    }
  }
  return '';
}

function firstFormattedText(...values: unknown[]): string {
  for (const value of values) {
    const text = formattedValueText(value);
    if (text) {
      return text;
    }
  }
  return '';
}

function resolveTimestamp(event: Record<string, unknown>, fallback = Date.now()): number {
  return toFiniteNumber(
    event.timestamp || event.ts || event.time || event.createdAt || event.updatedAt,
    fallback
  );
}

function resolveOptionalTimestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const timestamp = toFiniteNumber(value, 0);
  return timestamp > 0 ? timestamp : null;
}

function resolveEventRunId(
  event: Record<string, unknown>,
  state: ChatTimelineState,
  current?: ChatTimelineNode
): string {
  return toText(event.runId) || current?.runId || state.activeRunId;
}

function resolveLifecycle(type: string): ChatTimelineLifecycle {
  if (type.endsWith('.error') || type.endsWith('.fail') || type.endsWith('.failed')) {
    return 'error';
  }
  if (type.endsWith('.cancel')) {
    return 'cancelled';
  }
  if (
    type.endsWith('.end') ||
    type.endsWith('.snapshot') ||
    type.endsWith('.result') ||
    type.endsWith('.complete') ||
    type.endsWith('.done')
  ) {
    return 'complete';
  }
  return 'active';
}

function resolveAwaitingMode(
  event: Record<string, unknown>,
  existingMode?: ChatTimelineAwaitingMode
): ChatTimelineAwaitingMode {
  const modeText = toText(event.mode).toLowerCase();
  const kindText = toText(event.kind).toLowerCase();
  if (modeText === 'plan' || hasValue(event.plan)) {
    return 'plan';
  }
  if (modeText === 'approval' || hasValue(event.approvals)) {
    return 'approval';
  }
  if (modeText === 'form' || hasValue(event.forms)) {
    return 'form';
  }
  if (modeText === 'question') {
    return 'question';
  }
  if (hasValue(event.fields) || hasValue(event.schema) || hasValue(event.form)) {
    return 'form';
  }
  if (
    hasValue(event.approveLabel) ||
    hasValue(event.rejectLabel) ||
    hasValue(event.requiresApproval) ||
    kindText === 'approval'
  ) {
    return 'approval';
  }
  return existingMode ?? 'question';
}

const AWAITING_QUESTION_TYPES = new Set<ChatTimelineAwaitingQuestionType>([
  'text',
  'number',
  'select',
  'multi-select',
  'password',
  'date',
  'datetime',
]);

function resolvePositiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function normalizeQuestionType(value: unknown): ChatTimelineAwaitingQuestionType | null {
  const type = toText(value).toLowerCase();
  return AWAITING_QUESTION_TYPES.has(type as ChatTimelineAwaitingQuestionType)
    ? (type as ChatTimelineAwaitingQuestionType)
    : null;
}

function readOptionalText(record: Record<string, unknown>, key: string): string {
  return toText(record[key]);
}

function normalizeQuestionOption(value: unknown): ChatTimelineAwaitingQuestionOption | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const label = readOptionalText(value, 'label');
  if (!label) {
    return null;
  }

  const description = readOptionalText(value, 'description');
  const previewHtml = readOptionalText(value, 'previewHtml');
  const optionValue = readOptionalText(value, 'value');

  return {
    label,
    ...(description ? { description } : {}),
    ...(previewHtml ? { previewHtml } : {}),
    ...(optionValue ? { value: optionValue } : {}),
  };
}

function normalizeQuestion(value: unknown, index: number): ChatTimelineAwaitingQuestion | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const type = normalizeQuestionType(value.type);
  const question = toText(value.question || value.header || value.title);
  if (!type || !question) {
    return null;
  }

  const id = readOptionalText(value, 'id') || `q${index + 1}`;
  const header = readOptionalText(value, 'header');
  const placeholder = readOptionalText(value, 'placeholder');
  const freeTextPlaceholder = readOptionalText(value, 'freeTextPlaceholder');
  const options = Array.isArray(value.options)
    ? value.options
        .map(normalizeQuestionOption)
        .filter((option): option is ChatTimelineAwaitingQuestionOption => Boolean(option))
    : [];

  return {
    id,
    type,
    ...(header ? { header } : {}),
    question,
    ...(placeholder ? { placeholder } : {}),
    ...(options.length > 0 ? { options } : {}),
    ...(value.allowFreeText === true ? { allowFreeText: true } : {}),
    ...(freeTextPlaceholder ? { freeTextPlaceholder } : {}),
  };
}

function normalizeInteractiveQuestion(value: unknown): ChatTimelineAwaitingInteractive | null {
  if (!isObjectRecord(value) || value.kind !== 'question' || !Array.isArray(value.questions)) {
    return null;
  }

  const questions = value.questions
    .map(normalizeQuestion)
    .filter((question): question is ChatTimelineAwaitingQuestion => Boolean(question));
  if (questions.length === 0) {
    return null;
  }

  return {
    kind: 'question',
    viewportType: readOptionalText(value, 'viewportType'),
    viewportKey: readOptionalText(value, 'viewportKey'),
    timeout: resolvePositiveNumber(value.timeout),
    agentKey: readOptionalText(value, 'agentKey'),
    questions,
  };
}

function normalizeAwaitingInteractive(
  event: Record<string, unknown>,
  current?: ChatTimelineAwaitingNode
): ChatTimelineAwaitingInteractive | null {
  const direct = normalizeInteractiveQuestion(event.interactive);
  if (direct) {
    return direct;
  }

  if (!Array.isArray(event.questions)) {
    return current?.interactive ?? null;
  }

  const questions = event.questions
    .map(normalizeQuestion)
    .filter((question): question is ChatTimelineAwaitingQuestion => Boolean(question));
  if (questions.length === 0) {
    return current?.interactive ?? null;
  }

  return {
    kind: 'question',
    viewportType: readOptionalText(event, 'viewportType'),
    viewportKey: readOptionalText(event, 'viewportKey'),
    timeout: resolvePositiveNumber(event.timeout),
    agentKey: readOptionalText(event, 'agentKey'),
    questions,
  };
}

function formatDecisionLabel(raw: unknown): string {
  switch (toText(raw)) {
    case 'approve':
      return '同意';
    case 'approve_rule_run':
      return '同意（本次运行同规则都放行）';
    case 'reject':
      return '拒绝';
    default:
      return toText(raw);
  }
}

function displayTitleFromRecord(record: Record<string, unknown>, fallback: string): string {
  return (
    toText(record.question) ||
    toText(record.title) ||
    toText(record.description) ||
    toText(record.command) ||
    toText(record.action) ||
    toText(record.id) ||
    fallback
  );
}

function formatStructuredItems(items: unknown, fallbackTitle: string): string {
  if (!Array.isArray(items)) {
    return formattedValueText(items);
  }
  return items
    .map((item, index) => {
      if (!isObjectRecord(item)) {
        return formattedValueText(item);
      }
      const title = displayTitleFromRecord(item, `${fallbackTitle} ${index + 1}`);
      const decision = formatDecisionLabel(item.decision);
      const answer = firstFormattedText(
        item.answer,
        item.form,
        item.value,
        item.reason,
        item.description
      );
      const details = [decision, answer].filter(Boolean).join(' · ');
      return details ? `${title}\n${details}` : title;
    })
    .filter(Boolean)
    .join('\n\n');
}

function readAwaitingPrompt(
  event: Record<string, unknown>,
  mode: ChatTimelineAwaitingMode,
  current?: ChatTimelineAwaitingNode
): string {
  const direct = firstFormattedText(event.prompt, event.question, event.message, event.content);
  if (direct) {
    return direct;
  }
  if (mode === 'plan' && isObjectRecord(event.plan)) {
    return toText(event.plan.title) || '实施此计划？';
  }
  if (mode === 'approval' && Array.isArray(event.approvals)) {
    const firstApproval = event.approvals.find(isObjectRecord);
    if (firstApproval) {
      return toText(firstApproval.description) || toText(firstApproval.command) || '等待审批';
    }
  }
  if (mode === 'form' && Array.isArray(event.forms)) {
    const firstForm = event.forms.find(isObjectRecord);
    if (firstForm) {
      return toText(firstForm.title) || toText(firstForm.action) || '等待表单';
    }
  }
  return current?.prompt || '';
}

function readAwaitingPayloadText(
  event: Record<string, unknown>,
  mode: ChatTimelineAwaitingMode,
  current?: ChatTimelineAwaitingNode
): string {
  if (mode === 'plan' && isObjectRecord(event.plan)) {
    const options = Array.isArray(event.plan.options)
      ? event.plan.options
          .map((option) => {
            if (!isObjectRecord(option)) {
              return formattedValueText(option);
            }
            return [toText(option.label), formatDecisionLabel(option.decision)]
              .filter(Boolean)
              .join(' · ');
          })
          .filter(Boolean)
          .join('\n')
      : '';
    const text = [toText(event.plan.title), options].filter(Boolean).join('\n');
    return text || current?.payloadText || '';
  }
  if (mode === 'approval') {
    return formatStructuredItems(event.approvals, '审批') || current?.payloadText || '';
  }
  if (mode === 'form') {
    return (
      formatStructuredItems(event.forms, '表单') ||
      firstFormattedText(event.form, event.fields, event.schema) ||
      current?.payloadText ||
      ''
    );
  }
  if (mode === 'question' && Array.isArray(event.questions)) {
    return formatStructuredItems(event.questions, '问题') || current?.payloadText || '';
  }
  return (
    firstFormattedText(event.payload, event.answers, event.params) || current?.payloadText || ''
  );
}

function getAwaitingQuestionById(
  current: ChatTimelineAwaitingNode | undefined,
  id: string
): ChatTimelineAwaitingQuestion | null {
  const questions =
    current?.interactive?.kind === 'question' ? current.interactive.questions || [] : [];
  if (!id) {
    return null;
  }
  return questions.find((question) => question.id === id) ?? null;
}

function getAwaitingQuestionByIndex(
  current: ChatTimelineAwaitingNode | undefined,
  index: number
): ChatTimelineAwaitingQuestion | null {
  const questions =
    current?.interactive?.kind === 'question' ? current.interactive.questions || [] : [];
  return questions[index] ?? null;
}

function getQuestionOptionDisplayValue(
  question: ChatTimelineAwaitingQuestion | null,
  value: unknown
): string {
  const answer = formattedValueText(value);
  if (!answer || !question?.options?.length) {
    return answer;
  }
  const option = question.options.find((item) => (item.value || item.label) === answer);
  return option?.label || answer;
}

function formatAwaitingAnswerValue(
  item: Record<string, unknown>,
  question: ChatTimelineAwaitingQuestion | null
): string {
  if (question?.type === 'password' && (item.answer !== undefined || Array.isArray(item.answers))) {
    return '••••••';
  }

  if (typeof item.decision === 'string' && item.decision.trim()) {
    const decisionLabel = formatDecisionLabel(item.decision);
    const reason = toText(item.reason);
    return [decisionLabel, reason].filter(Boolean).join(' · ');
  }

  if (item.form !== undefined) {
    return formattedValueText(item.form) || '（无回答内容）';
  }

  if (typeof item.action === 'string' && item.action.trim()) {
    return item.action.trim();
  }

  if (item.answer !== undefined && item.answer !== null) {
    return getQuestionOptionDisplayValue(question, item.answer) || '（无回答内容）';
  }

  if (Array.isArray(item.answers)) {
    const answers = item.answers
      .map((answer) => getQuestionOptionDisplayValue(question, answer))
      .filter(Boolean);
    return answers.join(', ') || '（无回答内容）';
  }

  return toText(item.reason) || '（无回答内容）';
}

function formatAwaitingAnswerTitle(
  item: Record<string, unknown>,
  question: ChatTimelineAwaitingQuestion | null,
  index: number
): string {
  return (
    question?.question ||
    toText(item.question) ||
    toText(item.title) ||
    toText(item.planningId) ||
    toText(item.command) ||
    toText(item.action) ||
    toText(item.id) ||
    `回答 ${index + 1}`
  );
}

function readAwaitingAnswerItems(event: Record<string, unknown>): Record<string, unknown>[] {
  const arrays = [event.answers, event.params, event.approvals, event.forms];
  for (const value of arrays) {
    if (Array.isArray(value)) {
      return value.filter(isPlainRecord);
    }
  }
  if (isPlainRecord(event.plan)) {
    return [event.plan];
  }
  return [];
}

function awaitingAnswerErrorTitle(event: Record<string, unknown>): string {
  const error = isPlainRecord(event.error) ? event.error : {};
  switch (toText(error.code)) {
    case 'user_dismissed':
      return '已取消';
    case 'timeout':
      return '等待已超时';
    case 'invalid_submit':
      return '提交失败';
    default:
      return '等待异常';
  }
}

function buildAwaitingAnswerSummary(
  event: Record<string, unknown>,
  current?: ChatTimelineAwaitingNode
): ChatTimelineAwaitingAnswerSummary | null {
  const isError = toText(event.status) === 'error';
  if (isError) {
    const error = isPlainRecord(event.error) ? event.error : {};
    const title = awaitingAnswerErrorTitle(event);
    const value = firstFormattedText(error.message, error.code, event.error) || title;
    return {
      status: 'error',
      title,
      itemCount: 1,
      items: [{ key: `error:${toText(error.code) || 'unknown'}`, title: '状态', value }],
      copyText: `状态\n${value}`,
    };
  }

  const firstQuestion = getAwaitingQuestionByIndex(current, 0);
  const rawItems = readAwaitingAnswerItems(event);
  const normalizedItems =
    rawItems.length > 0
      ? rawItems
      : firstQuestion && (event.answer !== undefined || Array.isArray(event.answers))
        ? [
            {
              id: firstQuestion?.id || 'answer',
              ...(event.answer !== undefined ? { answer: event.answer } : {}),
              ...(Array.isArray(event.answers) ? { answers: event.answers } : {}),
            },
          ]
        : [];
  if (normalizedItems.length === 0) {
    return null;
  }
  const items =
    normalizedItems.length > 0
      ? normalizedItems.map((item, index) => {
          const id = toText(item.id);
          const question =
            getAwaitingQuestionById(current, id) ?? getAwaitingQuestionByIndex(current, index);
          const title = formatAwaitingAnswerTitle(item, question, index);
          return {
            key: `${id || title}:${index}`,
            title,
            value: formatAwaitingAnswerValue(item, question),
          };
        })
      : [];
  const copyText = items.map((item) => `${item.title}\n${item.value}`).join('\n\n');

  return {
    status: 'answered',
    title: `已提交 ${items.length} 项回答`,
    itemCount: items.length,
    items,
    copyText,
  };
}

function readAwaitingAnswerText(
  event: Record<string, unknown>,
  mode: ChatTimelineAwaitingMode,
  current?: ChatTimelineAwaitingNode,
  answerSummary?: ChatTimelineAwaitingAnswerSummary | null
): string {
  const summary = answerSummary ?? buildAwaitingAnswerSummary(event, current);
  if (summary && (summary.copyText || summary.status === 'error')) {
    return summary.copyText || summary.title;
  }
  if (toText(event.status) === 'error') {
    const error = isObjectRecord(event.error) ? event.error : {};
    return firstFormattedText(error.message, error.code, event.error) || '等待异常';
  }
  if (mode === 'plan' && isObjectRecord(event.plan)) {
    const title = toText(event.plan.title) || '实施此计划？';
    const decision = formatDecisionLabel(event.plan.decision);
    return [title, decision].filter(Boolean).join('\n');
  }
  if (mode === 'approval') {
    return (
      formatStructuredItems(event.approvals, '审批') ||
      firstFormattedText(event.answer, event.answers, event.message, event.content, event.text) ||
      current?.answer ||
      ''
    );
  }
  if (mode === 'form') {
    return (
      formatStructuredItems(event.forms, '表单') ||
      firstFormattedText(
        event.answer,
        event.answers,
        event.form,
        event.fields,
        event.message,
        event.text
      ) ||
      current?.answer ||
      ''
    );
  }
  return (
    firstFormattedText(
      event.answer,
      event.answers,
      event.params,
      event.message,
      event.content,
      event.text
    ) ||
    current?.answer ||
    ''
  );
}

function bodyFromEvent(event: Record<string, unknown>): string {
  const text = extractEventText(event);
  if (text) {
    return text;
  }

  const argsJson = firstFormattedText(event.args, event.arguments);
  if (argsJson) {
    return argsJson;
  }

  const resultJson = firstFormattedText(event.result, event.output);
  if (resultJson) {
    return resultJson;
  }

  const payloadJson = safeJson(event.payload);
  if (payloadJson) {
    return payloadJson;
  }

  const fallbackFields = [
    event.summary,
    event.details,
    event.reason,
    event.error,
    event.prompt,
    event.answer,
    event.path,
    event.url,
    event.name,
    event.title,
    event.toolName,
  ];
  const firstScalar = fallbackFields.find((value) => typeof value === 'string' && value.trim());
  return typeof firstScalar === 'string' ? firstScalar.trim() : '';
}

function nodeKey(
  conversationId: string,
  event: Record<string, unknown>,
  kind: ChatTimelineNodeKind,
  fallback: string
): string {
  const type = normalizeEventType(event.type);
  const runId = toText(event.runId);
  const stableId =
    toText(event.contentId) ||
    toText(event.reasoningId) ||
    toText(event.toolCallId) ||
    toText(event.toolId) ||
    toText(event.planId) ||
    toText(event.taskId) ||
    toText(event.artifactId) ||
    toText(event.awaitingId) ||
    toText(event.requestId) ||
    toText(event.id) ||
    toText(event.name) ||
    toText(event.title) ||
    fallback ||
    type;
  return `${kind}:${conversationId}:${runId || 'run'}:${stableId}`;
}

function reasoningStableId(event: Record<string, unknown>): string {
  return toText(event.contentId) || toText(event.reasoningId);
}

function reasoningRunNodeKey(conversationId: string, event: Record<string, unknown>): string {
  const runId = toText(event.runId);
  return `reasoning:${conversationId}:${runId || 'run'}:reasoning`;
}

function reasoningNodeKey(conversationId: string, event: Record<string, unknown>): string {
  const runId = toText(event.runId);
  return `reasoning:${conversationId}:${runId || 'run'}:${reasoningStableId(event) || 'reasoning'}`;
}

function findReasoningNodeIdForEvent(
  state: ChatTimelineState,
  conversationId: string,
  event: Record<string, unknown>,
  eventBody: string
): string {
  const id = reasoningNodeKey(conversationId, event);
  const direct = state.nodesById[id];
  if (direct?.kind === 'reasoning') {
    return id;
  }

  const runScopedId = reasoningRunNodeKey(conversationId, event);
  const runScoped = state.nodesById[runScopedId];
  if (runScoped?.kind === 'reasoning') {
    return runScopedId;
  }

  const runId = resolveEventRunId(event, state);
  const body = eventBody.trim();
  if (!runId || !body) {
    return id;
  }

  for (const nodeId of state.orderedNodeIds) {
    const node = state.nodesById[nodeId];
    if (node?.kind === 'reasoning' && node.runId === runId && node.body.trim() === body) {
      return nodeId;
    }
  }

  return id;
}

function reasoningTitleForEvent(
  event: Record<string, unknown>,
  lifecycle: ChatTimelineLifecycle,
  current?: ChatTimelineTextNode
): string {
  if (lifecycle !== 'active') {
    return REASONING_PROCESS_TITLE;
  }
  return (
    toText(event.reasoningLabel) ||
    toText(event.title || event.name) ||
    current?.title ||
    REASONING_PROCESS_TITLE
  );
}

function contentNodeKey(conversationId: string, event: Record<string, unknown>): string {
  return `message:${conversationId}:local:${buildAssistantMessageId(conversationId, event)}`;
}

function contentNodeFallbackKey(conversationId: string, event: Record<string, unknown>): string {
  return `message:${conversationId}:local:${buildFallbackAssistantMessageId(
    conversationId,
    event.runId
  )}`;
}

function toolNodeKey(conversationId: string, event: Record<string, unknown>): string {
  const stableId =
    toText(event.toolCallId) || toText(event.toolId) || toText(event.id) || toText(event.requestId);
  if (stableId) {
    return `tool:${conversationId}:${stableId}`;
  }
  return nodeKey(conversationId, event, 'tool', 'tool');
}

function requestNodeKey(conversationId: string, event: Record<string, unknown>): string {
  const requestId = toText(event.requestId) || toText(event.messageId) || 'request';
  return `message:${conversationId}:request:${requestId}`;
}

function findLocalUserMessageNodeByRequestId(
  state: ChatTimelineState,
  requestId: string
): ChatTimelineMessageNode | undefined {
  if (!requestId) {
    return undefined;
  }

  for (let index = state.orderedNodeIds.length - 1; index >= 0; index -= 1) {
    const node = state.nodesById[state.orderedNodeIds[index]];
    if (
      node?.kind === 'message' &&
      node.role === 'user' &&
      (node.clientMessageId === requestId || node.messageId === requestId)
    ) {
      return node;
    }
  }

  return undefined;
}

function findMessageNodeIdByIdentity(
  state: ChatTimelineState,
  identity: {
    messageId?: string | null;
    serverMessageId?: string | null;
    clientMessageId?: string | null;
  }
): string {
  const messageId = toText(identity.messageId);
  const serverMessageId = toText(identity.serverMessageId);
  const clientMessageId = toText(identity.clientMessageId);
  if (!messageId && !serverMessageId && !clientMessageId) {
    return '';
  }

  const matches = (node: ChatTimelineNode | undefined) =>
    node?.kind === 'message' &&
    ((messageId && node.messageId === messageId) ||
      (serverMessageId && node.serverMessageId === serverMessageId) ||
      (clientMessageId && node.clientMessageId === clientMessageId));

  for (let index = state.orderedNodeIds.length - 1; index >= 0; index -= 1) {
    const nodeId = state.orderedNodeIds[index];
    if (matches(state.nodesById[nodeId])) {
      return nodeId;
    }
  }

  return '';
}

function getTimelineNodeIdentityKeys(node: ChatTimelineNode): string[] {
  const keys = [`id:${node.id}`];
  if (node.kind === 'message') {
    if (node.messageId) {
      keys.push(`message:${node.messageId}`);
    }
    if (node.serverMessageId) {
      keys.push(`server:${node.serverMessageId}`);
    }
    if (node.clientMessageId) {
      keys.push(`client:${node.clientMessageId}`);
    }
  }
  return keys;
}

function buildTimelineNodeIdentityIndex(state: ChatTimelineState): Map<string, string> {
  const index = new Map<string, string>();
  state.orderedNodeIds.forEach((nodeId) => {
    const node = state.nodesById[nodeId];
    if (!node) {
      return;
    }
    getTimelineNodeIdentityKeys(node).forEach((key) => {
      if (!index.has(key)) {
        index.set(key, nodeId);
      }
    });
  });
  return index;
}

function findMatchingTimelineNodeId(
  index: ReadonlyMap<string, string>,
  node: ChatTimelineNode
): string {
  for (const key of getTimelineNodeIdentityKeys(node)) {
    const nodeId = index.get(key);
    if (nodeId) {
      return nodeId;
    }
  }
  return '';
}

function findSingletonActiveAssistantContentNode(
  state: ChatTimelineState,
  runId: string
): ChatTimelineMessageNode | undefined {
  let candidate: ChatTimelineMessageNode | undefined;

  for (const nodeId of state.orderedNodeIds) {
    const node = state.nodesById[nodeId];
    if (
      node?.kind !== 'message' ||
      node.role !== 'assistant' ||
      node.runId !== runId ||
      !isActiveTimelineNode(node)
    ) {
      continue;
    }

    if (candidate) {
      return undefined;
    }
    candidate = node;
  }

  return candidate;
}

function findContentMessageNode(
  state: ChatTimelineState,
  conversationId: string,
  event: Record<string, unknown>
): ChatTimelineMessageNode | undefined {
  const direct = state.nodesById[contentNodeKey(conversationId, event)];
  if (direct?.kind === 'message' && direct.role === 'assistant') {
    return direct;
  }

  const identityMatchId = findMessageNodeIdByIdentity(state, {
    messageId: buildAssistantMessageId(conversationId, event),
    serverMessageId: toText(event.serverMessageId),
  });
  const identityMatch = identityMatchId ? state.nodesById[identityMatchId] : undefined;
  if (identityMatch?.kind === 'message' && identityMatch.role === 'assistant') {
    return identityMatch;
  }

  const fallback = state.nodesById[contentNodeFallbackKey(conversationId, event)];
  if (fallback?.kind === 'message' && fallback.role === 'assistant') {
    return fallback;
  }

  const runId = toText(event.runId);
  return runId ? findSingletonActiveAssistantContentNode(state, runId) : undefined;
}

function getTimelineNodeContentLength(node: ChatTimelineNode): number {
  if (node.kind === 'message') {
    const attachments = node.attachments || [];
    return (
      node.content.length +
      attachments.reduce((total, attachment) => total + attachment.name.length, 0)
    );
  }
  if (node.kind === 'tool') {
    return (
      node.title.length +
      node.body.length +
      node.argsText.length +
      node.resultText.length +
      node.status.length
    );
  }
  if (node.kind === 'awaiting') {
    return (
      node.prompt.length +
      node.payloadText.length +
      node.answer.length +
      safeJson(node.interactive).length +
      safeJson(node.answerSummary).length
    );
  }
  if (node.kind === 'run') {
    return node.title.length + node.body.length + node.status.length;
  }
  return node.title.length + node.body.length + node.status.length;
}

function isActiveTimelineNode(node: ChatTimelineNode): boolean {
  return node.lifecycle === 'active' || ('streaming' in node && Boolean(node.streaming));
}

function isTerminalRunNode(node: ChatTimelineNode | undefined, runId: string): boolean {
  return Boolean(
    runId &&
      node?.kind === 'run' &&
      node.runId === runId &&
      node.lifecycle !== 'active'
  );
}

function isTerminalTimelineNodeForRun(
  node: ChatTimelineNode | undefined,
  runId: string
): boolean {
  return Boolean(runId && node?.runId === runId && !isActiveTimelineNode(node));
}

function closeTimelineNodeForLocalStop(node: ChatTimelineNode, updatedAt: number): ChatTimelineNode {
  const nextUpdatedAt = Math.max(node.updatedAt, updatedAt);
  if (node.kind === 'run') {
    return {
      ...node,
      status: '已取消',
      lifecycle: 'cancelled',
      updatedAt: nextUpdatedAt,
    };
  }
  return closeTimelineNodeForRun(node, 'cancelled', updatedAt);
}

function hasIncomingMessageAtOrAfter(
  incomingState: ChatTimelineState,
  current: ChatTimelineMessageNode
): boolean {
  return incomingState.orderedNodeIds.some((nodeId) => {
    const node = incomingState.nodesById[nodeId];
    return (
      node?.kind === 'message' &&
      node.role === current.role &&
      node.createdAt >= current.createdAt &&
      node.content.trim().length > 0
    );
  });
}

function shouldPreferCurrentTimelineNode(
  current: ChatTimelineNode,
  incoming: ChatTimelineNode
): boolean {
  if (current.kind !== incoming.kind) {
    return false;
  }

  const currentLength = getTimelineNodeContentLength(current);
  const incomingLength = getTimelineNodeContentLength(incoming);
  if (currentLength > incomingLength) {
    return true;
  }

  if (current.kind === 'message' && incoming.kind === 'message') {
    const currentIsUnconfirmedLocal =
      current.deliveryStatus !== 'sent' &&
      Boolean(current.clientMessageId && !current.serverMessageId);
    if (currentIsUnconfirmedLocal && !incoming.serverMessageId) {
      return true;
    }
  }

  return (
    isActiveTimelineNode(current) &&
    isActiveTimelineNode(incoming) &&
    current.updatedAt >= incoming.updatedAt
  );
}

function shouldPreserveUnmatchedTimelineNode(
  current: ChatTimelineNode,
  incomingState: ChatTimelineState
): boolean {
  if (isActiveTimelineNode(current)) {
    return true;
  }

  if (current.kind !== 'message') {
    return false;
  }

  if (current.deliveryStatus !== 'sent' && current.clientMessageId && !current.serverMessageId) {
    return true;
  }

  if (!current.content.trim()) {
    return false;
  }

  if (hasIncomingMessageAtOrAfter(incomingState, current)) {
    return false;
  }

  return current.role === 'assistant' || current.updatedAt >= incomingState.updatedAt;
}

function hasActiveRunNode(
  nodeIds: readonly string[],
  nodesById: Readonly<Record<string, ChatTimelineNode>>,
  runId: string
): boolean {
  if (!runId) {
    return false;
  }
  return nodeIds.some((nodeId) => {
    const node = nodesById[nodeId];
    return node?.runId === runId && isActiveTimelineNode(node);
  });
}

function findLatestActiveTimelineRunId(state: ChatTimelineState): string {
  for (let index = state.orderedNodeIds.length - 1; index >= 0; index -= 1) {
    const node = state.nodesById[state.orderedNodeIds[index]];
    if (!node || !isActiveTimelineNode(node) || !node.runId) {
      continue;
    }
    return node.runId;
  }
  return '';
}

function hasTerminalRunNode(state: ChatTimelineState, runId: string): boolean {
  if (!runId) {
    return false;
  }
  return state.orderedNodeIds.some((nodeId) => isTerminalRunNode(state.nodesById[nodeId], runId));
}

function hasTerminalTimelineNodeForRun(state: ChatTimelineState, runId: string): boolean {
  if (!runId) {
    return false;
  }
  return state.orderedNodeIds.some((nodeId) =>
    isTerminalTimelineNodeForRun(state.nodesById[nodeId], runId)
  );
}

function getTerminalRunUpdatedAt(state: ChatTimelineState, runId: string): number {
  let updatedAt = 0;
  state.orderedNodeIds.forEach((nodeId) => {
    const node = state.nodesById[nodeId];
    if (isTerminalTimelineNodeForRun(node, runId)) {
      updatedAt = Math.max(updatedAt, node.updatedAt);
    }
  });
  return updatedAt || state.updatedAt;
}

function buildProtectedTerminalRunIds(
  currentState: ChatTimelineState,
  incomingState: ChatTimelineState,
  options: MergeChatTimelineStateOptions | undefined
): Set<string> | null {
  const runIds = options?.preserveTerminalRunIds;
  if (!runIds?.length) {
    return null;
  }

  let protectedRunIds: Set<string> | null = null;
  runIds.forEach((runIdInput) => {
    const runId = toText(runIdInput);
    if (
      runId &&
      (hasTerminalTimelineNodeForRun(currentState, runId) ||
        !hasActiveRunNode(currentState.orderedNodeIds, currentState.nodesById, runId)) &&
      !hasTerminalRunNode(incomingState, runId)
    ) {
      protectedRunIds ??= new Set<string>();
      protectedRunIds.add(runId);
    }
  });
  return protectedRunIds;
}

function shouldPreserveProtectedTerminalNode(
  current: ChatTimelineNode,
  incoming: ChatTimelineNode | undefined,
  protectedRunIds: ReadonlySet<string> | null
): boolean {
  return Boolean(
    current.runId &&
      protectedRunIds?.has(current.runId) &&
      !isActiveTimelineNode(current) &&
      (!incoming || isActiveTimelineNode(incoming))
  );
}

function resolveMergedAwaiting(
  nodesById: Readonly<Record<string, ChatTimelineNode>>,
  incomingState: ChatTimelineState,
  currentState: ChatTimelineState
): ChatTimelineState['awaiting'] {
  if (incomingState.awaiting && nodesById[incomingState.awaiting.id]?.kind === 'awaiting') {
    return incomingState.awaiting;
  }
  if (currentState.awaiting && nodesById[currentState.awaiting.id]?.kind === 'awaiting') {
    return currentState.awaiting;
  }
  return null;
}

function didNodeChange(left: ChatTimelineNode | undefined, right: ChatTimelineNode): boolean {
  if (!left) {
    return true;
  }
  if (
    left.kind !== right.kind ||
    left.runId !== right.runId ||
    left.createdAt !== right.createdAt ||
    left.updatedAt !== right.updatedAt ||
    left.order !== right.order ||
    left.lifecycle !== right.lifecycle
  ) {
    return true;
  }
  if (left.kind === 'message' && right.kind === 'message') {
    return (
      left.role !== right.role ||
      left.content !== right.content ||
      left.messageId !== right.messageId ||
      left.clientMessageId !== right.clientMessageId ||
      left.serverMessageId !== right.serverMessageId ||
      left.deliveryStatus !== right.deliveryStatus ||
      left.errorReason !== right.errorReason ||
      left.streaming !== right.streaming ||
      !areChatAttachmentsEqual(left.attachments, right.attachments)
    );
  }
  if (left.kind === 'tool' && right.kind === 'tool') {
    return (
      left.toolId !== right.toolId ||
      left.toolName !== right.toolName ||
      left.toolLabel !== right.toolLabel ||
      left.description !== right.description ||
      left.title !== right.title ||
      left.status !== right.status ||
      left.argsText !== right.argsText ||
      left.resultText !== right.resultText ||
      left.body !== right.body ||
      left.streaming !== right.streaming
    );
  }
  if (left.kind === 'awaiting' && right.kind === 'awaiting') {
    return (
      left.prompt !== right.prompt ||
      left.answer !== right.answer ||
      left.payloadText !== right.payloadText ||
      left.mode !== right.mode ||
      left.status !== right.status ||
      safeJson(left.interactive) !== safeJson(right.interactive) ||
      safeJson(left.answerSummary) !== safeJson(right.answerSummary)
    );
  }
  if (left.kind === 'run' && right.kind === 'run') {
    return (
      left.title !== right.title ||
      left.body !== right.body ||
      left.status !== right.status ||
      left.agentKey !== right.agentKey ||
      left.startedAt !== right.startedAt ||
      left.completedAt !== right.completedAt ||
      left.durationMs !== right.durationMs
    );
  }
  if (
    left.kind !== 'message' &&
    left.kind !== 'tool' &&
    left.kind !== 'awaiting' &&
    left.kind !== 'run' &&
    right.kind !== 'message' &&
    right.kind !== 'tool' &&
    right.kind !== 'awaiting' &&
    right.kind !== 'run'
  ) {
    return (
      left.title !== right.title ||
      left.body !== right.body ||
      left.status !== right.status ||
      left.streaming !== right.streaming ||
      !chatTimelineUsageSummaryEquals(left.usageSummary ?? null, right.usageSummary ?? null)
    );
  }
  return true;
}

function upsertNode(state: ChatTimelineState, node: ChatTimelineNode): ChatTimelineState {
  const current = state.nodesById[node.id];
  if (!didNodeChange(current, node)) {
    return state;
  }

  const orderedNodeIds = current ? state.orderedNodeIds : [...state.orderedNodeIds, node.id];
  return {
    ...state,
    orderedNodeIds,
    nodesById: {
      ...state.nodesById,
      [node.id]: node,
    },
    updatedAt: Math.max(state.updatedAt, node.updatedAt),
    revision: state.revision + 1,
    nextOrder: current ? state.nextOrder : state.nextOrder + 1,
  };
}

function isStreamingTimelineNode(node: ChatTimelineNode): boolean {
  return 'streaming' in node && node.streaming;
}

function terminalStatusFromLifecycle(lifecycle: Exclude<ChatTimelineLifecycle, 'active'>): string {
  switch (lifecycle) {
    case 'error':
      return '出错';
    case 'cancelled':
      return '已取消';
    case 'complete':
    default:
      return '已完成';
  }
}

function closeTimelineNodeForRun(
  node: ChatTimelineNode,
  lifecycle: Exclude<ChatTimelineLifecycle, 'active'>,
  updatedAt: number
): ChatTimelineNode {
  const nextUpdatedAt = Math.max(node.updatedAt, updatedAt);

  if (node.kind === 'message') {
    return {
      ...node,
      streaming: false,
      lifecycle,
      updatedAt: nextUpdatedAt,
    };
  }

  if (node.kind === 'tool') {
    return {
      ...node,
      status: terminalStatusFromLifecycle(lifecycle),
      streaming: false,
      lifecycle,
      updatedAt: nextUpdatedAt,
    };
  }

  if (node.kind === 'awaiting') {
    return {
      ...node,
      lifecycle,
      updatedAt: nextUpdatedAt,
    };
  }

  if (node.kind === 'run') {
    return node;
  }

  return {
    ...node,
    title: node.kind === 'reasoning' ? REASONING_PROCESS_TITLE : node.title,
    status: terminalStatusFromLifecycle(lifecycle),
    streaming: false,
    lifecycle,
    updatedAt: nextUpdatedAt,
  };
}

function isDuplicateAwaitingAsk(
  state: ChatTimelineState,
  current: ChatTimelineAwaitingNode | undefined,
  awaiting: {
    id: string;
    awaitingId: string;
    runId: string;
    prompt: string;
    payloadText: string;
    mode: ChatTimelineAwaitingMode;
    status: 'ask' | 'answer';
    interactive: ChatTimelineAwaitingInteractive | null;
  }
): boolean {
  return (
    awaiting.status === 'ask' &&
    current?.status === 'ask' &&
    current.id === awaiting.id &&
    current.awaitingId === awaiting.awaitingId &&
    current.runId === awaiting.runId &&
    current.prompt === awaiting.prompt &&
    current.payloadText === awaiting.payloadText &&
    current.mode === awaiting.mode &&
    safeJson(current.interactive) === safeJson(awaiting.interactive) &&
    state.awaiting?.id === awaiting.id &&
    state.awaiting.awaitingId === awaiting.awaitingId &&
    state.awaiting.runId === awaiting.runId &&
    state.awaiting.prompt === awaiting.prompt &&
    state.awaiting.payloadText === awaiting.payloadText &&
    state.awaiting.mode === awaiting.mode &&
    state.awaiting.status === awaiting.status &&
    safeJson(state.awaiting.interactive) === safeJson(awaiting.interactive)
  );
}

function closeActiveNodesForRun(
  state: ChatTimelineState,
  runId: string,
  lifecycle: Exclude<ChatTimelineLifecycle, 'active'>,
  updatedAt: number
): ChatTimelineState {
  if (!runId) {
    return state;
  }

  return closeActiveTimelineNodes(state, runId, lifecycle, updatedAt);
}

function closeActiveTimelineNodes(
  state: ChatTimelineState,
  runId: string,
  lifecycle: Exclude<ChatTimelineLifecycle, 'active'>,
  updatedAt: number
): ChatTimelineState {
  let nextNodesById: ChatTimelineState['nodesById'] | null = null;
  let nextUpdatedAt = state.updatedAt;

  state.orderedNodeIds.forEach((nodeId) => {
    const node = state.nodesById[nodeId];
    if (
      !node ||
      node.kind === 'run' ||
      (runId && node.runId !== runId) ||
      (node.lifecycle !== 'active' && !isStreamingTimelineNode(node))
    ) {
      return;
    }

    const nextNode = closeTimelineNodeForRun(node, lifecycle, updatedAt);
    if (!didNodeChange(node, nextNode)) {
      return;
    }

    if (!nextNodesById) {
      nextNodesById = { ...state.nodesById };
    }
    nextNodesById[nodeId] = nextNode;
    nextUpdatedAt = Math.max(nextUpdatedAt, nextNode.updatedAt);
  });

  if (!nextNodesById) {
    return state;
  }

  return {
    ...state,
    nodesById: nextNodesById,
    updatedAt: nextUpdatedAt,
    revision: state.revision + 1,
  };
}

function closeActiveTimelineNodesForLocalStop(
  state: ChatTimelineState,
  runId: string,
  updatedAt: number
): ChatTimelineState {
  let nextNodesById: ChatTimelineState['nodesById'] | null = null;
  let nextUpdatedAt = state.updatedAt;

  state.orderedNodeIds.forEach((nodeId) => {
    const node = state.nodesById[nodeId];
    if (
      !node ||
      (runId ? node.runId !== runId : Boolean(node.runId)) ||
      !isActiveTimelineNode(node)
    ) {
      return;
    }

    const nextNode = closeTimelineNodeForLocalStop(node, updatedAt);
    if (!didNodeChange(node, nextNode)) {
      return;
    }

    if (!nextNodesById) {
      nextNodesById = { ...state.nodesById };
    }
    nextNodesById[nodeId] = nextNode;
    nextUpdatedAt = Math.max(nextUpdatedAt, nextNode.updatedAt);
  });

  if (!nextNodesById) {
    return state;
  }

  return {
    ...state,
    nodesById: nextNodesById,
    updatedAt: nextUpdatedAt,
    revision: state.revision + 1,
  };
}

export function getChatTimelineActiveRunId(state: ChatTimelineState): string {
  return findLatestActiveTimelineRunId(state) || state.activeRunId;
}

function hasActiveTimelineNodes(state: ChatTimelineState): boolean {
  return state.orderedNodeIds.some((nodeId) => {
    const node = state.nodesById[nodeId];
    return Boolean(node && isActiveTimelineNode(node));
  });
}

function resolveLocalStopRunId(state: ChatTimelineState, requestedRunId: string): string {
  if (requestedRunId && hasActiveRunNode(state.orderedNodeIds, state.nodesById, requestedRunId)) {
    return requestedRunId;
  }
  return findLatestActiveTimelineRunId(state);
}

function clearActiveRunIdForLocalStop(
  state: ChatTimelineState,
  updatedAt: number
): ChatTimelineState {
  if (!state.activeRunId) {
    return state;
  }

  return {
    ...state,
    activeRunId: '',
    updatedAt: Math.max(state.updatedAt, updatedAt),
    revision: state.revision + 1,
  };
}

function appendText(current: string, delta: string, snapshot?: string): string {
  if (snapshot !== undefined) {
    return snapshot || current;
  }
  return delta ? `${current}${delta}` : current;
}

function createOrder(state: ChatTimelineState, current?: ChatTimelineNode): number {
  return current?.order ?? state.nextOrder;
}

export function createChatTimelineState(conversationId: string): ChatTimelineState {
  return {
    conversationId: normalizeConversationId(conversationId),
    orderedNodeIds: [],
    nodesById: {},
    activeRunId: '',
    awaiting: null,
    usageLabel: '',
    usageSummary: null,
    updatedAt: 0,
    revision: 0,
    nextOrder: 0,
  };
}

function applyRequestEvent(
  state: ChatTimelineState,
  conversationId: string,
  event: Record<string, unknown>
): ChatTimelineState {
  const requestId = toText(event.requestId) || toText(event.messageId);
  const id = requestNodeKey(conversationId, event);
  const current =
    findLocalUserMessageNodeByRequestId(state, requestId) ??
    (state.nodesById[id] as ChatTimelineMessageNode | undefined);
  const createdAt = resolveTimestamp(event, current?.updatedAt ?? Date.now() + state.nextOrder);
  const content = toText(event.message || event.content || event.text);
  const messageId = current?.messageId ?? `remote:user:${requestId || id}`;
  const attachments = createMessageAttachmentsFromReferences({
    conversationId,
    messageId,
    references: event.references,
    createdAt,
  });
  if (!content && attachments.length === 0) {
    return state;
  }

  return upsertNode(state, {
    id: current?.id ?? id,
    kind: 'message',
    role: 'user',
    content,
    messageId,
    clientMessageId: current?.clientMessageId ?? null,
    serverMessageId: toText(event.serverMessageId) || current?.serverMessageId || null,
    deliveryStatus: 'sent',
    errorReason: null,
    streaming: false,
    attachments: attachments.length > 0 ? attachments : current?.attachments || [],
    runId: toText(event.runId) || current?.runId || '',
    createdAt: current?.createdAt ?? createdAt,
    updatedAt: Math.max(current?.updatedAt ?? 0, createdAt),
    order: createOrder(state, current),
    lifecycle: 'complete',
  });
}

function applyContentEvent(
  state: ChatTimelineState,
  conversationId: string,
  event: Record<string, unknown>
): ChatTimelineState {
  const type = normalizeEventType(event.type);
  const lifecycle = resolveLifecycle(type);
  const createdAt = resolveTimestamp(event, Date.now() + state.nextOrder);
  const current = findContentMessageNode(state, conversationId, event);
  const id = current?.id ?? contentNodeKey(conversationId, event);
  const messageId = current?.messageId ?? buildAssistantMessageId(conversationId, event);
  const text = extractEventText(event);
  const snapshot =
    type === 'content.snapshot' || type === 'content.end' || type === 'content.start'
      ? text
      : undefined;
  const nextContent = current
    ? appendText(current.content, type === 'content.delta' ? text : '', snapshot)
    : type === 'content.delta'
      ? text
      : text || '';

  if (!nextContent) {
    return state;
  }

  return upsertNode(state, {
    id,
    kind: 'message',
    role: 'assistant',
    content: nextContent,
    messageId,
    clientMessageId: null,
    serverMessageId: toText(event.serverMessageId) || current?.serverMessageId || null,
    deliveryStatus: 'sent',
    errorReason: null,
    streaming: lifecycle === 'active',
    attachments: current?.attachments || [],
    runId: toText(event.runId),
    createdAt: current?.createdAt ?? createdAt,
    updatedAt: Math.max(current?.updatedAt ?? 0, createdAt),
    order: createOrder(state, current),
    lifecycle,
  });
}

function applyRuntimeTextEvent(
  state: ChatTimelineState,
  conversationId: string,
  event: Record<string, unknown>,
  kind: ChatTimelineTextNode['kind'],
  usageSummary: ChatTimelineTextNode['usageSummary'] = null
): ChatTimelineState {
  const type = normalizeEventType(event.type);
  const updatedAt = resolveTimestamp(event, Date.now() + state.nextOrder);
  const eventBody = bodyFromEvent(event);
  const id =
    kind === 'reasoning'
      ? findReasoningNodeIdForEvent(state, conversationId, event, eventBody)
      : nodeKey(conversationId, event, kind, kind);
  const current = state.nodesById[id] as ChatTimelineTextNode | undefined;
  const lifecycle = resolveLifecycle(type);
  const delta = type.endsWith('.delta') ? eventBody : '';
  const snapshot =
    type.endsWith('.snapshot') || type.endsWith('.end') || type.endsWith('.result')
      ? eventBody
      : undefined;
  const body = current ? appendText(current.body, delta, snapshot) : eventBody;
  const suffix = type.split('.').at(-1) || '';
  const title =
    kind === 'reasoning'
      ? reasoningTitleForEvent(event, lifecycle, current)
      : kind === 'planning'
        ? '规划'
        : kind === 'usage'
          ? '用量统计'
          : toText(event.title || event.name) || kind;

  return upsertNode(state, {
    id,
    kind,
    title,
    body,
    status:
      suffix === 'start'
        ? '生成中'
        : lifecycle === 'complete'
          ? '已完成'
          : lifecycle === 'error'
            ? '出错'
            : lifecycle === 'cancelled'
              ? '已取消'
              : '更新中',
    streaming: lifecycle === 'active',
    runId: resolveEventRunId(event, state, current),
    createdAt: current?.createdAt ?? updatedAt,
    updatedAt,
    order: createOrder(state, current),
    lifecycle,
    ...(kind === 'usage' ? { usageSummary } : {}),
  });
}

function applyToolEvent(
  state: ChatTimelineState,
  conversationId: string,
  event: Record<string, unknown>
): ChatTimelineState {
  const type = normalizeEventType(event.type);
  const updatedAt = resolveTimestamp(event, Date.now() + state.nextOrder);
  const id = toolNodeKey(conversationId, event);
  const current = state.nodesById[id] as ChatTimelineToolNode | undefined;
  const lifecycle = resolveLifecycle(type);
  const toolId = toText(event.toolCallId || event.toolId) || current?.toolId || '';
  const toolName = toText(event.toolName || event.name) || current?.toolName || '';
  const toolLabel = toText(event.toolLabel || event.title) || current?.toolLabel || '';
  const description = toText(event.description) || current?.description || '';
  const argsText =
    firstFormattedText(event.args, event.arguments, event.input, event.params) ||
    (type.endsWith('.args') ? bodyFromEvent(event) : current?.argsText || '');
  const resultText =
    firstFormattedText(event.result, event.output, event.error) ||
    (type.endsWith('.result') || type.endsWith('.end')
      ? bodyFromEvent(event)
      : current?.resultText || '');
  const body =
    resultText ||
    argsText ||
    description ||
    bodyFromEvent(event) ||
    current?.body ||
    toolName ||
    toolLabel;

  return upsertNode(state, {
    id,
    kind: 'tool',
    toolId,
    toolName,
    toolLabel,
    description,
    title: toolLabel || toolName || current?.title || '工具调用',
    status:
      lifecycle === 'complete'
        ? type.endsWith('.result')
          ? '结果返回'
          : '已完成'
        : lifecycle === 'error'
          ? '出错'
          : '运行中',
    argsText,
    resultText,
    body,
    streaming: lifecycle === 'active',
    runId: resolveEventRunId(event, state, current),
    createdAt: current?.createdAt ?? updatedAt,
    updatedAt,
    order: createOrder(state, current),
    lifecycle,
  });
}

function applyAwaitingEvent(
  state: ChatTimelineState,
  conversationId: string,
  event: Record<string, unknown>
): ChatTimelineState {
  const type = normalizeEventType(event.type);
  const updatedAt = resolveTimestamp(event, Date.now() + state.nextOrder);
  const id =
    nodeKey(conversationId, event, 'awaiting', 'awaiting') ||
    state.awaiting?.id ||
    `awaiting:${conversationId}`;
  const current = state.nodesById[id] as ChatTimelineAwaitingNode | undefined;
  const awaitingId =
    toText(event.awaitingId) || current?.awaitingId || state.awaiting?.awaitingId || id;
  const mode = resolveAwaitingMode(event, current?.mode ?? state.awaiting?.mode);
  const prompt =
    readAwaitingPrompt(event, mode, current) ||
    state.awaiting?.prompt ||
    (mode === 'approval'
      ? '等待审批'
      : mode === 'form'
        ? '等待表单'
        : mode === 'plan'
          ? '等待计划确认'
          : '等待回复');
  const payloadText = readAwaitingPayloadText(event, mode, current);
  const interactive = normalizeAwaitingInteractive(event, current);
  const status: ChatTimelineAwaitingNode['status'] = type === 'awaiting.answer' ? 'answer' : 'ask';
  const answerSummary = status === 'answer' ? buildAwaitingAnswerSummary(event, current) : null;
  const answer = answerSummary
    ? answerSummary.copyText ||
      readAwaitingAnswerText(event, mode, current, answerSummary) ||
      state.awaiting?.answer ||
      ''
    : status === 'answer'
      ? readAwaitingAnswerText(event, mode, current, answerSummary) || state.awaiting?.answer || ''
      : current?.answer || state.awaiting?.answer || '';
  const runId = resolveEventRunId(event, state, current);
  const awaiting = {
    id,
    awaitingId,
    runId,
    createdAt: current?.createdAt ?? updatedAt,
    prompt,
    answer,
    payloadText,
    mode,
    status,
    interactive,
    answerSummary,
    updatedAt,
  };
  if (isDuplicateAwaitingAsk(state, current, awaiting)) {
    return state;
  }

  const nextNode: ChatTimelineAwaitingNode = {
    id,
    kind: 'awaiting',
    awaitingId,
    prompt,
    answer,
    payloadText,
    mode,
    status,
    interactive,
    answerSummary,
    runId,
    createdAt: awaiting.createdAt,
    updatedAt,
    order: createOrder(state, current),
    lifecycle: status === 'answer' ? 'complete' : 'active',
  };
  const nextState = upsertNode(state, nextNode);

  if (
    nextState.awaiting?.id === awaiting.id &&
    nextState.awaiting?.awaitingId === awaiting.awaitingId &&
    nextState.awaiting?.runId === awaiting.runId &&
    nextState.awaiting?.prompt === awaiting.prompt &&
    nextState.awaiting?.answer === awaiting.answer &&
    nextState.awaiting?.payloadText === awaiting.payloadText &&
    nextState.awaiting?.mode === awaiting.mode &&
    nextState.awaiting?.status === awaiting.status &&
    nextState.awaiting?.createdAt === awaiting.createdAt &&
    safeJson(nextState.awaiting?.interactive) === safeJson(awaiting.interactive) &&
    safeJson(nextState.awaiting?.answerSummary) === safeJson(awaiting.answerSummary) &&
    nextState.awaiting?.updatedAt === awaiting.updatedAt
  ) {
    return nextState;
  }

  return {
    ...nextState,
    awaiting,
    updatedAt: Math.max(nextState.updatedAt, updatedAt),
    revision: nextState.revision + 1,
  };
}

function applyRunEvent(
  state: ChatTimelineState,
  conversationId: string,
  event: Record<string, unknown>
): ChatTimelineState {
  const type = normalizeEventType(event.type);
  const updatedAt = resolveTimestamp(event, Date.now() + state.nextOrder);
  const id = nodeKey(conversationId, event, 'run', 'run');
  const current = state.nodesById[id] as ChatTimelineRunNode | undefined;
  const lifecycle = resolveLifecycle(type);
  const runId = toText(event.runId);
  const startedAt =
    type === 'run.start'
      ? updatedAt
      : (current?.startedAt ?? resolveOptionalTimestamp(event.startedAt));
  const completedAt =
    type === 'run.complete' || type === 'run.cancel' || type === 'run.error'
      ? updatedAt
      : (current?.completedAt ?? resolveOptionalTimestamp(event.completedAt));
  const durationMs =
    startedAt && completedAt ? Math.max(0, completedAt - startedAt) : (current?.durationMs ?? null);
  const nextState = upsertNode(state, {
    id,
    kind: 'run',
    title: '运行状态',
    body: bodyFromEvent(event) || (runId ? `runId: ${runId}` : type),
    status:
      type === 'run.start'
        ? '运行中'
        : type === 'run.complete'
          ? '已完成'
          : type === 'run.cancel'
            ? '已取消'
            : '出错',
    agentKey: toText(event.agentKey) || current?.agentKey || '',
    runId,
    startedAt,
    completedAt,
    durationMs,
    createdAt: current?.createdAt ?? updatedAt,
    updatedAt,
    order: createOrder(state, current),
    lifecycle,
  });
  const activeRunId = type === 'run.start' ? runId || state.activeRunId : '';
  const stateWithActiveRunId =
    nextState.activeRunId === activeRunId
      ? nextState
      : {
          ...nextState,
          activeRunId,
          revision: nextState.revision + 1,
        };
  return lifecycle === 'active'
    ? stateWithActiveRunId
    : closeActiveNodesForRun(
        stateWithActiveRunId,
        runId || state.activeRunId,
        lifecycle,
        updatedAt
      );
}

export function applyChatTimelineLocalCancel(
  currentStateInput: ChatTimelineState | null | undefined,
  conversationIdInput: string,
  input: {
    runId?: string | null;
    reason?: string;
    timestamp?: number;
  } = {}
): ChatTimelineState {
  const conversationId = normalizeConversationId(conversationIdInput);
  const state =
    currentStateInput && currentStateInput.conversationId === conversationId
      ? currentStateInput
      : createChatTimelineState(conversationId);
  const updatedAt = Number.isFinite(Number(input.timestamp)) ? Number(input.timestamp) : Date.now();
  const requestedRunId = toText(input.runId);
  const runId = resolveLocalStopRunId(state, requestedRunId);

  if (!runId && !requestedRunId && !hasActiveTimelineNodes(state)) {
    return state;
  }

  return clearActiveRunIdForLocalStop(
    closeActiveTimelineNodesForLocalStop(state, runId, updatedAt),
    updatedAt
  );
}

export function applyChatTimelineEvent(
  currentStateInput: ChatTimelineState | null | undefined,
  conversationIdInput: string,
  rawEvent: Record<string, unknown>
): ChatTimelineState {
  const conversationId = normalizeConversationId(conversationIdInput);
  const state =
    currentStateInput && currentStateInput.conversationId === conversationId
      ? currentStateInput
      : createChatTimelineState(conversationId);
  const event: Record<string, unknown> = {
    ...rawEvent,
    type: normalizeEventType(rawEvent.type),
  };
  const type = normalizeEventType(event.type);
  const family = classifyChatProtocolEvent(event);

  if (type === 'request.query') {
    return applyRequestEvent(state, conversationId, event);
  }
  if (family === 'request') {
    return applyRuntimeTextEvent(state, conversationId, event, 'request');
  }
  if (family === 'assistant_content') {
    return applyContentEvent(state, conversationId, event);
  }
  if (family === 'run') {
    return applyRunEvent(state, conversationId, event);
  }
  if (family === 'awaiting') {
    return applyAwaitingEvent(state, conversationId, event);
  }
  if (family === 'tool') {
    return applyToolEvent(state, conversationId, event);
  }
  if (family === 'reasoning' || family === 'planning') {
    return applyRuntimeTextEvent(state, conversationId, event, family);
  }
  if (
    family === 'artifact' ||
    family === 'action' ||
    family === 'plan' ||
    family === 'task' ||
    family === 'context'
  ) {
    const kind = family === 'context' ? 'context' : family;
    return applyRuntimeTextEvent(state, conversationId, event, kind);
  }
  if (family === 'usage') {
    const updatedAt = resolveTimestamp(event, Date.now() + state.nextOrder);
    const usageSummary = buildChatTimelineUsageSummary(event, updatedAt);
    const usageLabel = usageSummary.label;
    const nextState = applyRuntimeTextEvent(
      state,
      conversationId,
      { ...event, text: usageLabel || bodyFromEvent(event) },
      'usage',
      usageSummary
    );
    return nextState.usageLabel === usageLabel &&
      chatTimelineUsageSummaryEquals(nextState.usageSummary, usageSummary)
      ? nextState
      : {
          ...nextState,
          usageLabel,
          usageSummary,
          revision: nextState.revision + 1,
        };
  }

  return state;
}

export function applyChatTimelineMessage(
  currentStateInput: ChatTimelineState | null | undefined,
  message: ChatMessageItem
): ChatTimelineState {
  const conversationId = normalizeConversationId(message.conversationId);
  const state =
    currentStateInput && currentStateInput.conversationId === conversationId
      ? currentStateInput
      : createChatTimelineState(conversationId);
  const id = `message:${conversationId}:local:${message.messageId}`;
  const current = state.nodesById[id] as ChatTimelineMessageNode | undefined;
  return upsertNode(state, {
    id,
    kind: 'message',
    role: message.role,
    content: message.content,
    messageId: message.messageId,
    clientMessageId: message.clientMessageId,
    serverMessageId: message.serverMessageId,
    deliveryStatus: message.deliveryStatus as ChatTimelineDeliveryStatus,
    errorReason: message.errorReason,
    streaming: message.streamStatus === 'streaming',
    attachments: message.attachments || [],
    runId: '',
    createdAt: message.createdAt,
    updatedAt: message.createdAt,
    order: createOrder(state, current),
    lifecycle: message.streamStatus === 'streaming' ? 'active' : 'complete',
  });
}

export function patchChatTimelineMessage(
  currentState: ChatTimelineState,
  messageId: string,
  patch: Partial<
    Pick<
      ChatMessageItem,
      | 'content'
      | 'createdAt'
      | 'deliveryStatus'
      | 'errorReason'
      | 'serverMessageId'
      | 'streamStatus'
      | 'attachments'
    >
  >
): ChatTimelineState {
  const targetId = findMessageNodeIdByIdentity(currentState, {
    messageId,
    serverMessageId: patch.serverMessageId,
  });
  if (!targetId) {
    return currentState;
  }

  const current = currentState.nodesById[targetId] as ChatTimelineMessageNode;
  return upsertNode(currentState, {
    ...current,
    content: patch.content ?? current.content,
    createdAt: patch.createdAt ?? current.createdAt,
    updatedAt: Math.max(current.updatedAt, patch.createdAt ?? current.updatedAt),
    deliveryStatus: (patch.deliveryStatus ?? current.deliveryStatus) as ChatTimelineDeliveryStatus,
    errorReason: patch.errorReason ?? current.errorReason,
    serverMessageId: patch.serverMessageId ?? current.serverMessageId,
    attachments: patch.attachments ?? current.attachments,
    streaming:
      patch.streamStatus !== undefined ? patch.streamStatus === 'streaming' : current.streaming,
    lifecycle:
      patch.streamStatus === 'streaming'
        ? 'active'
        : patch.streamStatus === 'done'
          ? 'complete'
          : current.lifecycle,
  });
}

export function applyChatTimelineStreamDelta(
  currentState: ChatTimelineState,
  input: {
    messageId: string;
    createdAt: number;
    delta: string;
    snapshotText?: string;
  }
): ChatTimelineState {
  const targetId = findMessageNodeIdByIdentity(currentState, {
    messageId: input.messageId,
  });
  if (!targetId) {
    return currentState;
  }

  const current = currentState.nodesById[targetId] as ChatTimelineMessageNode;
  return upsertNode(currentState, {
    ...current,
    content:
      input.snapshotText !== undefined
        ? input.snapshotText
        : `${current.content}${String(input.delta || '')}`,
    updatedAt: Math.max(current.updatedAt, input.createdAt),
    streaming: true,
    lifecycle: 'active',
  });
}

export function mergeChatTimelineState(
  currentStateInput: ChatTimelineState | null | undefined,
  incomingState: ChatTimelineState,
  options?: MergeChatTimelineStateOptions
): ChatTimelineState {
  if (
    !currentStateInput ||
    currentStateInput.conversationId !== incomingState.conversationId ||
    (currentStateInput.orderedNodeIds.length <= 0 && !options?.preserveTerminalRunIds?.length)
  ) {
    return incomingState;
  }

  const protectedTerminalRunIds = buildProtectedTerminalRunIds(
    currentStateInput,
    incomingState,
    options
  );
  const incomingIndex = buildTimelineNodeIdentityIndex(incomingState);
  let orderedNodeIds = incomingState.orderedNodeIds;
  let orderedNodeIdSet: Set<string> | null = null;
  let orderedNodeIndexById: Map<string, number> | null = null;
  let nodesById = incomingState.nodesById;
  let changed = false;

  const ensureWritableState = () => {
    if (!changed) {
      orderedNodeIds = [...incomingState.orderedNodeIds];
      orderedNodeIdSet = new Set(orderedNodeIds);
      orderedNodeIndexById = new Map(
        orderedNodeIds.map((orderedNodeId, index) => [orderedNodeId, index])
      );
      nodesById = { ...incomingState.nodesById };
      changed = true;
    }
  };

  const preserveNode = (node: ChatTimelineNode, matchedIncomingId: string) => {
    ensureWritableState();
    const nodeIdSet = orderedNodeIdSet!;
    const nodeIndexById = orderedNodeIndexById!;

    if (matchedIncomingId && matchedIncomingId !== node.id) {
      const matchedIndex = nodeIndexById.get(matchedIncomingId) ?? -1;
      if (matchedIndex >= 0) {
        orderedNodeIds[matchedIndex] = node.id;
        nodeIdSet.delete(matchedIncomingId);
        nodeIndexById.delete(matchedIncomingId);
        nodeIndexById.set(node.id, matchedIndex);
      }
      delete nodesById[matchedIncomingId];
    }

    if (!nodeIdSet.has(node.id)) {
      nodeIndexById.set(node.id, orderedNodeIds.length);
      orderedNodeIds.push(node.id);
      nodeIdSet.add(node.id);
    }
    nodesById[node.id] = node;
  };

  currentStateInput.orderedNodeIds.forEach((nodeId) => {
    const currentNode = currentStateInput.nodesById[nodeId];
    if (!currentNode) {
      return;
    }

    const matchedIncomingId = findMatchingTimelineNodeId(incomingIndex, currentNode);
    const incomingNode = matchedIncomingId ? incomingState.nodesById[matchedIncomingId] : undefined;
    const shouldPreserve =
      shouldPreserveProtectedTerminalNode(currentNode, incomingNode, protectedTerminalRunIds) ||
      (incomingNode
        ? shouldPreferCurrentTimelineNode(currentNode, incomingNode)
        : shouldPreserveUnmatchedTimelineNode(currentNode, incomingState));

    if (shouldPreserve) {
      preserveNode(currentNode, matchedIncomingId);
    }
  });

  protectedTerminalRunIds?.forEach((runId) => {
    const closedAt = getTerminalRunUpdatedAt(currentStateInput, runId);
    orderedNodeIds.forEach((nodeId) => {
      const node = nodesById[nodeId];
      if (
        !node ||
        node.runId !== runId ||
        !isActiveTimelineNode(node)
      ) {
        return;
      }

      ensureWritableState();
      const writableNode = nodesById[nodeId] ?? node;
      const nextNode = closeTimelineNodeForLocalStop(
        writableNode,
        Math.max(closedAt, writableNode.updatedAt)
      );
      if (didNodeChange(writableNode, nextNode)) {
        nodesById[nodeId] = nextNode;
      }
    });
  });

  if (!changed) {
    return incomingState;
  }

  const incomingActiveRunId = toText(incomingState.activeRunId);
  const currentActiveRunId = toText(currentStateInput.activeRunId);
  const canUseCurrentActiveRunId =
    currentActiveRunId &&
    !protectedTerminalRunIds?.has(currentActiveRunId) &&
    hasActiveRunNode(orderedNodeIds, nodesById, currentActiveRunId);
  const activeRunId =
    (incomingActiveRunId && !protectedTerminalRunIds?.has(incomingActiveRunId)
      ? incomingActiveRunId
      : '') ||
    (canUseCurrentActiveRunId ? currentActiveRunId : '');
  const usageSummary = incomingState.usageSummary ?? currentStateInput.usageSummary;
  const usageLabel =
    incomingState.usageLabel || usageSummary?.label || currentStateInput.usageLabel;

  return {
    ...incomingState,
    orderedNodeIds,
    nodesById,
    activeRunId,
    awaiting: resolveMergedAwaiting(nodesById, incomingState, currentStateInput),
    usageLabel,
    usageSummary,
    updatedAt: Math.max(incomingState.updatedAt, currentStateInput.updatedAt),
    revision: Math.max(incomingState.revision, currentStateInput.revision) + 1,
    nextOrder: Math.max(
      incomingState.nextOrder,
      currentStateInput.nextOrder,
      orderedNodeIds.length
    ),
  };
}

export function deriveChatTimelineState(
  conversationId: string,
  rawEvents: readonly unknown[]
): ChatTimelineState {
  let state = createChatTimelineState(conversationId);

  rawEvents.forEach((rawEvent) => {
    const event =
      rawEvent && typeof rawEvent === 'object' ? (rawEvent as Record<string, unknown>) : {};
    state = applyChatTimelineEvent(state, conversationId, event);
  });

  return state;
}

export function deriveChatTimelineStateFromMessages(
  conversationId: string,
  messages: readonly ChatMessageItem[]
): ChatTimelineState {
  return [...messages]
    .sort((left, right) => left.createdAt - right.createdAt)
    .reduce<ChatTimelineState>(
      (state, message) => applyChatTimelineMessage(state, message),
      createChatTimelineState(conversationId)
    );
}
