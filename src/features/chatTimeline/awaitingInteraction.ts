import {
  normalizeEventType,
  normalizeAwaitingTimeoutMs,
  toText,
} from '../../core/api/services/chatEventProtocol.ts';
import type {
  ChatTimelineAwaitingAnswerSummary,
  ChatTimelineAwaitingApproval,
  ChatTimelineAwaitingApprovalDecision,
  ChatTimelineAwaitingApprovalOption,
  ChatTimelineAwaitingForm,
  ChatTimelineAwaitingInteractive,
  ChatTimelineAwaitingMode,
  ChatTimelineAwaitingNode,
  ChatTimelineAwaitingPlan,
  ChatTimelineAwaitingPlanDecision,
  ChatTimelineAwaitingPlanInput,
  ChatTimelineAwaitingPlanOption,
  ChatTimelineAwaitingQuestion,
  ChatTimelineAwaitingQuestionOption,
  ChatTimelineAwaitingQuestionType,
} from './types.ts';
import {
  firstTimelineEventText,
  formatTimelineEventValue,
  hasTimelineEventValue,
  isTimelineObjectRecord,
} from './timelineEventFormat.ts';

export type NormalizedChatTimelineAwaitingEvent = {
  mode: ChatTimelineAwaitingMode;
  status: ChatTimelineAwaitingNode['status'];
  prompt: string;
  payloadText: string;
  interactive: ChatTimelineAwaitingInteractive | null;
  answer: string;
  answerSummary: ChatTimelineAwaitingAnswerSummary | null;
};

const AWAITING_QUESTION_TYPES = new Set<ChatTimelineAwaitingQuestionType>([
  'text',
  'number',
  'select',
  'multi-select',
  'password',
  'date',
  'datetime',
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return isTimelineObjectRecord(value) && !Array.isArray(value);
}

function readOptionalText(record: Record<string, unknown>, key: string): string {
  return toText(record[key]);
}

function cloneRecord(value: unknown): Record<string, unknown> | null {
  return isPlainRecord(value) ? { ...value } : value === null ? null : null;
}

function isPlanAwaitingRecord(record: Record<string, unknown>): boolean {
  const modeText = toText(record.mode).toLowerCase();
  const kindText = toText(record.kind).toLowerCase();
  const viewportKeyText = toText(record.viewportKey).toLowerCase();
  return (
    modeText === 'plan' ||
    kindText === 'plan' ||
    viewportKeyText === 'plan' ||
    hasTimelineEventValue(record.plan)
  );
}

function resolveAwaitingMode(
  event: Record<string, unknown>,
  existingMode?: ChatTimelineAwaitingMode
): ChatTimelineAwaitingMode {
  const modeText = toText(event.mode).toLowerCase();
  const kindText = toText(event.kind).toLowerCase();
  const interactive = isPlainRecord(event.interactive) ? event.interactive : null;
  if (isPlanAwaitingRecord(event) || (interactive && isPlanAwaitingRecord(interactive))) {
    return 'plan';
  }
  if (modeText === 'approval' || hasTimelineEventValue(event.approvals)) {
    return 'approval';
  }
  if (modeText === 'form' || hasTimelineEventValue(event.forms)) {
    return 'form';
  }
  if (modeText === 'question') {
    return 'question';
  }
  if (
    hasTimelineEventValue(event.fields) ||
    hasTimelineEventValue(event.schema) ||
    hasTimelineEventValue(event.form)
  ) {
    return 'form';
  }
  if (
    hasTimelineEventValue(event.approveLabel) ||
    hasTimelineEventValue(event.rejectLabel) ||
    hasTimelineEventValue(event.requiresApproval) ||
    kindText === 'approval'
  ) {
    return 'approval';
  }
  return existingMode ?? 'question';
}

function normalizeQuestionType(value: unknown): ChatTimelineAwaitingQuestionType | null {
  const type = toText(value).toLowerCase();
  return AWAITING_QUESTION_TYPES.has(type as ChatTimelineAwaitingQuestionType)
    ? (type as ChatTimelineAwaitingQuestionType)
    : null;
}

function normalizeQuestionOption(value: unknown): ChatTimelineAwaitingQuestionOption | null {
  if (!isPlainRecord(value)) {
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
    ...(value.recommended === true ? { recommended: true } : {}),
  };
}

function normalizeQuestion(value: unknown, index: number): ChatTimelineAwaitingQuestion | null {
  if (!isPlainRecord(value)) {
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

function isApprovalDecision(value: unknown): value is ChatTimelineAwaitingApprovalDecision {
  return value === 'approve' || value === 'reject' || value === 'approve_rule_run';
}

function normalizeApprovalOption(value: unknown): ChatTimelineAwaitingApprovalOption | null {
  if (!isPlainRecord(value)) {
    return null;
  }
  const label = readOptionalText(value, 'label');
  const decision = readOptionalText(value, 'decision');
  if (!label || !isApprovalDecision(decision)) {
    return null;
  }
  const description = readOptionalText(value, 'description');
  return {
    label,
    decision,
    ...(description ? { description } : {}),
  };
}

function normalizeApproval(value: unknown, index: number): ChatTimelineAwaitingApproval | null {
  if (!isPlainRecord(value)) {
    return null;
  }

  const command = readOptionalText(value, 'command') || readOptionalText(value, 'description') || readOptionalText(value, 'id');
  const id = readOptionalText(value, 'id') || command || `approval-${index + 1}`;
  if (!id || !command) {
    return null;
  }
  const ruleKey = readOptionalText(value, 'ruleKey');
  const description = readOptionalText(value, 'description');
  const freeTextPlaceholder = readOptionalText(value, 'freeTextPlaceholder');
  const options = Array.isArray(value.options)
    ? value.options
        .map(normalizeApprovalOption)
        .filter((option): option is ChatTimelineAwaitingApprovalOption => Boolean(option))
    : [];

  return {
    id,
    command,
    ...(ruleKey ? { ruleKey } : {}),
    ...(description ? { description } : {}),
    ...(options.length > 0 ? { options } : {}),
    ...(value.allowFreeText === true ? { allowFreeText: true } : {}),
    ...(freeTextPlaceholder ? { freeTextPlaceholder } : {}),
  };
}

function normalizeForms(
  value: unknown,
  fallbackAction = '',
  fallbackForm?: Record<string, unknown> | null
): ChatTimelineAwaitingForm[] {
  if (!Array.isArray(value)) {
    if (!fallbackAction) {
      return [];
    }
    return [
      {
        id: fallbackAction,
        action: fallbackAction,
        form: fallbackForm ?? null,
      },
    ];
  }

  const normalized = value
    .map((item, index): ChatTimelineAwaitingForm | null => {
      if (!isPlainRecord(item)) {
        return null;
      }
      const action = readOptionalText(item, 'action') || fallbackAction;
      const id = readOptionalText(item, 'id') || action || `form-${index + 1}`;
      if (!id) {
        return null;
      }
      const title = readOptionalText(item, 'title');
      return {
        id,
        ...(action ? { action } : {}),
        ...(title ? { title } : {}),
        form: cloneRecord(item.form),
      };
    })
    .filter((form): form is ChatTimelineAwaitingForm => Boolean(form));

  if (normalized.length > 0 || !fallbackAction) {
    return normalized;
  }

  return [
    {
      id: fallbackAction,
      action: fallbackAction,
      form: fallbackForm ?? null,
    },
  ];
}

function isPlanDecision(value: unknown): value is ChatTimelineAwaitingPlanDecision {
  return value === 'approve' || value === 'reject';
}

function normalizePlanInput(value: unknown): ChatTimelineAwaitingPlanInput | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }
  const type = readOptionalText(value, 'type');
  if (type !== 'text') {
    return undefined;
  }
  const placeholder = readOptionalText(value, 'placeholder');
  return {
    type: 'text',
    ...(placeholder ? { placeholder } : {}),
    ...(typeof value.required === 'boolean' ? { required: value.required } : {}),
  };
}

function normalizePlanOption(value: unknown): ChatTimelineAwaitingPlanOption | null {
  if (!isPlainRecord(value)) {
    return null;
  }
  const label = readOptionalText(value, 'label');
  const decision = readOptionalText(value, 'decision');
  if (!label || !isPlanDecision(decision)) {
    return null;
  }
  const description = readOptionalText(value, 'description');
  const input = normalizePlanInput(value.input);
  return {
    label,
    decision,
    ...(description ? { description } : {}),
    ...(input ? { input } : {}),
  };
}

function normalizePlan(
  value: unknown,
  fallback?: Record<string, unknown>
): ChatTimelineAwaitingPlan | null {
  const source = isPlainRecord(value)
    ? value
    : fallback &&
        (isPlanAwaitingRecord(fallback) ||
          hasTimelineEventValue(fallback.planningId) ||
          hasTimelineEventValue(fallback.options) ||
          hasTimelineEventValue(fallback.title) ||
          hasTimelineEventValue(fallback.id))
      ? fallback
      : null;

  if (!source) {
    return null;
  }
  const id = readOptionalText(source, 'id') || readOptionalText(source, 'planId') || 'confirm';
  const planningId = readOptionalText(source, 'planningId');
  const title = readOptionalText(source, 'title');
  const options = Array.isArray(source.options)
    ? source.options
        .map(normalizePlanOption)
        .filter((option): option is ChatTimelineAwaitingPlanOption => Boolean(option))
    : [];
  return {
    id,
    ...(planningId ? { planningId } : {}),
    ...(title ? { title } : {}),
    ...(options.length > 0 ? { options } : {}),
  };
}

function readCommonInteraction(
  record: Record<string, unknown>,
  event: Record<string, unknown>
) {
  return {
    viewportType: readOptionalText(record, 'viewportType') || readOptionalText(event, 'viewportType'),
    viewportKey: readOptionalText(record, 'viewportKey') || readOptionalText(event, 'viewportKey'),
    timeout: normalizeAwaitingTimeoutMs(record.timeout ?? event.timeout),
    agentKey: readOptionalText(record, 'agentKey') || readOptionalText(event, 'agentKey'),
  };
}

function normalizeDirectInteractive(
  value: unknown,
  event: Record<string, unknown>
): ChatTimelineAwaitingInteractive | null {
  if (!isPlainRecord(value)) {
    return null;
  }
  const kind = readOptionalText(value, 'kind');
  const common = readCommonInteraction(value, event);
  if (kind === 'question' && Array.isArray(value.questions)) {
    const questions = value.questions
      .map(normalizeQuestion)
      .filter((question): question is ChatTimelineAwaitingQuestion => Boolean(question));
    return questions.length > 0 ? { kind: 'question', ...common, questions } : null;
  }
  if (kind === 'approval' && Array.isArray(value.approvals)) {
    const approvals = value.approvals
      .map(normalizeApproval)
      .filter((approval): approval is ChatTimelineAwaitingApproval => Boolean(approval));
    return approvals.length > 0 ? { kind: 'approval', ...common, approvals } : null;
  }
  if (kind === 'form') {
    const fallbackAction =
      readOptionalText(value, 'action') ||
      readOptionalText(event, 'action') ||
      common.viewportKey;
    const forms = normalizeForms(value.forms, fallbackAction, cloneRecord(value.form ?? event.form));
    return forms.length > 0 || common.viewportKey ? { kind: 'form', ...common, forms } : null;
  }
  if (kind === 'plan') {
    const plan = normalizePlan(value.plan ?? event.plan, value);
    return plan ? { kind: 'plan', ...common, plan } : null;
  }
  return null;
}

function normalizeAwaitingInteractive(
  event: Record<string, unknown>,
  mode: ChatTimelineAwaitingMode,
  current?: ChatTimelineAwaitingNode
): ChatTimelineAwaitingInteractive | null {
  const direct = normalizeDirectInteractive(event.interactive, event);
  if (direct) {
    return direct;
  }

  const common = readCommonInteraction(event, event);
  if (mode === 'question') {
    const questions = Array.isArray(event.questions)
      ? event.questions
          .map(normalizeQuestion)
          .filter((question): question is ChatTimelineAwaitingQuestion => Boolean(question))
      : [];
    if (questions.length > 0) {
      return { kind: 'question', ...common, questions };
    }
  }

  if (mode === 'approval') {
    const approvals = Array.isArray(event.approvals)
      ? event.approvals
          .map(normalizeApproval)
          .filter((approval): approval is ChatTimelineAwaitingApproval => Boolean(approval))
      : [];
    if (approvals.length > 0) {
      return { kind: 'approval', ...common, approvals };
    }
  }

  if (mode === 'form') {
    const fallbackAction =
      readOptionalText(event, 'action') ||
      readOptionalText(event, 'viewportKey') ||
      readOptionalText(event, 'id');
    const forms = normalizeForms(event.forms, fallbackAction, cloneRecord(event.form));
    if (forms.length > 0 || common.viewportKey) {
      return { kind: 'form', ...common, forms };
    }
  }

  if (mode === 'plan') {
    const plan = normalizePlan(event.plan, event);
    if (plan) {
      return { kind: 'plan', ...common, plan };
    }
  }

  return current?.interactive?.kind === mode ? current.interactive : null;
}

export function formatAwaitingDecisionLabel(raw: unknown): string {
  return toText(raw);
}

function displayTitleFromRecord(record: Record<string, unknown>): string {
  return (
    toText(record.question) ||
    toText(record.title) ||
    toText(record.description) ||
    toText(record.command) ||
    toText(record.action) ||
    toText(record.id)
  );
}

function formatStructuredItems(items: unknown): string {
  if (!Array.isArray(items)) {
    return formatTimelineEventValue(items);
  }
  return items
    .map((item, index) => {
      if (!isTimelineObjectRecord(item)) {
        return formatTimelineEventValue(item);
      }
      const title = displayTitleFromRecord(item);
      const decision = formatAwaitingDecisionLabel(item.decision);
      const answer = firstTimelineEventText(
        item.answer,
        item.form,
        item.value,
        item.reason,
        item.description
      );
      const details = [decision, answer].filter(Boolean).join(' · ');
      if (title && details) {
        return `${title}\n${details}`;
      }
      return title || details || formatTimelineEventValue(item);
    })
    .filter(Boolean)
    .join('\n\n');
}

function readAwaitingPrompt(
  event: Record<string, unknown>,
  mode: ChatTimelineAwaitingMode,
  current?: ChatTimelineAwaitingNode
): string {
  const direct = firstTimelineEventText(event.prompt, event.question, event.message, event.content);
  if (direct) {
    return direct;
  }
  if (mode === 'plan' && isPlainRecord(event.plan)) {
    return toText(event.plan.title) || current?.prompt || '';
  }
  if (mode === 'approval' && Array.isArray(event.approvals)) {
    const firstApproval = event.approvals.find(isTimelineObjectRecord);
    if (firstApproval) {
      return toText(firstApproval.description) || toText(firstApproval.command) || current?.prompt || '';
    }
  }
  if (mode === 'form' && Array.isArray(event.forms)) {
    const firstForm = event.forms.find(isTimelineObjectRecord);
    if (firstForm) {
      return toText(firstForm.title) || toText(firstForm.action) || current?.prompt || '';
    }
  }
  return current?.prompt || '';
}

function readAwaitingPayloadText(
  event: Record<string, unknown>,
  mode: ChatTimelineAwaitingMode,
  current?: ChatTimelineAwaitingNode
): string {
  if (mode === 'plan' && isPlainRecord(event.plan)) {
    const options = Array.isArray(event.plan.options)
      ? event.plan.options
          .map((option) => {
            if (!isTimelineObjectRecord(option)) {
              return formatTimelineEventValue(option);
            }
            return [toText(option.label), formatAwaitingDecisionLabel(option.decision)]
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
    return formatStructuredItems(event.approvals) || current?.payloadText || '';
  }
  if (mode === 'form') {
    return (
      formatStructuredItems(event.forms) ||
      firstTimelineEventText(event.form, event.fields, event.schema) ||
      current?.payloadText ||
      ''
    );
  }
  if (mode === 'question' && Array.isArray(event.questions)) {
    return formatStructuredItems(event.questions) || current?.payloadText || '';
  }
  return firstTimelineEventText(event.payload, event.answers, event.params) || current?.payloadText || '';
}

function getQuestionById(
  current: ChatTimelineAwaitingNode | undefined,
  id: string
): ChatTimelineAwaitingQuestion | null {
  const questions = current?.interactive?.kind === 'question' ? current.interactive.questions || [] : [];
  if (!id) {
    return null;
  }
  return questions.find((question) => question.id === id) ?? null;
}

function getQuestionByIndex(
  current: ChatTimelineAwaitingNode | undefined,
  index: number
): ChatTimelineAwaitingQuestion | null {
  const questions = current?.interactive?.kind === 'question' ? current.interactive.questions || [] : [];
  return questions[index] ?? null;
}

function getQuestionOptionDisplayValue(
  question: ChatTimelineAwaitingQuestion | null,
  value: unknown
): string {
  const answer = formatTimelineEventValue(value);
  if (!answer || !question?.options?.length) {
    return answer;
  }
  const option = question.options.find((item) => (item.value || item.label) === answer);
  return option?.label || answer;
}

function getAwaitingItemTitle(
  current: ChatTimelineAwaitingNode | undefined,
  item: Record<string, unknown>,
  index: number
): string {
  const id = toText(item.id);
  const question = getQuestionById(current, id) ?? getQuestionByIndex(current, index);
  if (question) {
    return question.question;
  }
  if (current?.interactive?.kind === 'approval') {
    const approval = current.interactive.approvals.find((entry) => entry.id === id);
    if (approval) {
      return approval.description || approval.command;
    }
  }
  if (current?.interactive?.kind === 'form') {
    const form = current.interactive.forms.find((entry) => entry.id === id);
    if (form) {
      return form.title || form.action || form.id;
    }
  }
  if (current?.interactive?.kind === 'plan') {
    return current.interactive.plan.title || toText(item.planningId) || current.interactive.plan.id;
  }
  return (
    toText(item.question) ||
    toText(item.title) ||
    toText(item.planningId) ||
    toText(item.command) ||
    toText(item.action) ||
    id
  );
}

function formatAwaitingAnswerValue(
  item: Record<string, unknown>,
  question: ChatTimelineAwaitingQuestion | null
): string {
  if (question?.type === 'password' && (item.answer !== undefined || Array.isArray(item.answers))) {
    return '••••••';
  }

  if (typeof item.decision === 'string' && item.decision.trim()) {
    const decisionLabel = formatAwaitingDecisionLabel(item.decision);
    const reason = toText(item.reason);
    const form = item.form !== undefined ? formatTimelineEventValue(item.form) : '';
    return [decisionLabel, reason, form].filter(Boolean).join(' · ');
  }

  if (item.form !== undefined) {
    return formatTimelineEventValue(item.form);
  }

  if (typeof item.action === 'string' && item.action.trim()) {
    return item.action.trim();
  }

  if (item.answer !== undefined && item.answer !== null) {
    return getQuestionOptionDisplayValue(question, item.answer);
  }

  if (Array.isArray(item.answers)) {
    const answers = item.answers
      .map((answer) => getQuestionOptionDisplayValue(question, answer))
      .filter(Boolean);
    return answers.join(', ');
  }

  return toText(item.reason);
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

function buildAwaitingAnswerSummary(
  event: Record<string, unknown>,
  current?: ChatTimelineAwaitingNode
): ChatTimelineAwaitingAnswerSummary | null {
  const isError = toText(event.status) === 'error';
  if (isError) {
    const error = isPlainRecord(event.error) ? event.error : {};
    const code = toText(error.code);
    const value = firstTimelineEventText(error.message, error.code, event.error);
    return {
      status: 'error',
      title: code,
      itemCount: 1,
      items: [{ key: `error:${code || 'unknown'}`, title: code, value }],
      copyText: '',
    };
  }

  const firstQuestion = getQuestionByIndex(current, 0);
  const rawItems = readAwaitingAnswerItems(event);
  const normalizedItems =
    rawItems.length > 0
      ? rawItems
      : firstQuestion && (event.answer !== undefined || Array.isArray(event.answers))
        ? [
            {
              id: firstQuestion.id || 'answer',
              ...(event.answer !== undefined ? { answer: event.answer } : {}),
              ...(Array.isArray(event.answers) ? { answers: event.answers } : {}),
            },
          ]
        : [];
  if (normalizedItems.length === 0) {
    return null;
  }
  const items = normalizedItems.map((item, index) => {
    const id = toText(item.id);
    const question = getQuestionById(current, id) ?? getQuestionByIndex(current, index);
    const title = getAwaitingItemTitle(current, item, index);
    return {
      key: `${id || title || 'item'}:${index}`,
      title,
      value: formatAwaitingAnswerValue(item, question),
    };
  });

  return {
    status: 'answered',
    title: '',
    itemCount: items.length,
    items,
    copyText: '',
  };
}

function answerTextFromSummary(summary: ChatTimelineAwaitingAnswerSummary | null): string {
  if (!summary?.items.length) {
    return '';
  }
  return summary.items
    .map((item) => {
      if (item.title && item.value) {
        return `${item.title}\n${item.value}`;
      }
      return item.title || item.value;
    })
    .filter(Boolean)
    .join('\n\n');
}

function readAwaitingAnswerText(
  event: Record<string, unknown>,
  mode: ChatTimelineAwaitingMode,
  current?: ChatTimelineAwaitingNode,
  answerSummary?: ChatTimelineAwaitingAnswerSummary | null
): string {
  const summary = answerSummary ?? buildAwaitingAnswerSummary(event, current);
  if (summary?.copyText) {
    return summary.copyText;
  }
  const summaryText = answerTextFromSummary(summary ?? null);
  if (summaryText) {
    return summaryText;
  }
  if (toText(event.status) === 'error') {
    const error = isTimelineObjectRecord(event.error) ? event.error : {};
    return firstTimelineEventText(error.message, error.code, event.error);
  }
  if (mode === 'plan' && isPlainRecord(event.plan)) {
    const title =
      toText(event.plan.title) ||
      (current?.interactive?.kind === 'plan' ? current.interactive.plan.title : '');
    const decision = formatAwaitingDecisionLabel(event.plan.decision);
    return [title, decision].filter(Boolean).join('\n');
  }
  if (mode === 'approval') {
    return (
      formatStructuredItems(event.approvals) ||
      firstTimelineEventText(event.answer, event.answers, event.message, event.content, event.text) ||
      current?.answer ||
      ''
    );
  }
  if (mode === 'form') {
    return (
      formatStructuredItems(event.forms) ||
      firstTimelineEventText(
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
    firstTimelineEventText(
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

export function normalizeChatTimelineAwaitingEvent(input: {
  event: Record<string, unknown>;
  current?: ChatTimelineAwaitingNode;
  fallbackAnswer?: string;
}): NormalizedChatTimelineAwaitingEvent {
  const { event, current, fallbackAnswer = '' } = input;
  const type = normalizeEventType(event.type);
  const mode = resolveAwaitingMode(event, current?.mode);
  const status: ChatTimelineAwaitingNode['status'] = type === 'awaiting.answer' ? 'answer' : 'ask';
  const prompt = readAwaitingPrompt(event, mode, current);
  const payloadText = readAwaitingPayloadText(event, mode, current);
  const interactive = normalizeAwaitingInteractive(event, mode, current);
  const answerSummary = status === 'answer' ? buildAwaitingAnswerSummary(event, current) : null;
  const answer = answerSummary
    ? answerSummary.copyText ||
      readAwaitingAnswerText(event, mode, current, answerSummary) ||
      fallbackAnswer
    : status === 'answer'
      ? readAwaitingAnswerText(event, mode, current, answerSummary) || fallbackAnswer
      : current?.answer || fallbackAnswer;

  return {
    mode,
    status,
    prompt,
    payloadText,
    interactive,
    answer,
    answerSummary,
  };
}

function signatureText(value: unknown): string {
  return String(value ?? '').trim();
}

function optionSignature(
  options:
    | readonly {
        label: string;
        value?: string;
        description?: string;
        previewHtml?: string;
        decision?: string;
      }[]
    | undefined
): string {
  return (options || [])
    .map((option) =>
      [
        signatureText(option.label),
        signatureText(option.value),
        signatureText(option.description),
        signatureText(option.previewHtml),
        signatureText(option.decision),
      ].join('\u001f')
    )
    .join('\u001e');
}

export function getAwaitingInteractiveSignature(
  interactive: ChatTimelineAwaitingInteractive | null | undefined
): string {
  if (!interactive) {
    return '';
  }

  const common = [
    interactive.kind,
    signatureText(interactive.agentKey),
    signatureText(interactive.viewportType),
    signatureText(interactive.viewportKey),
    signatureText(getAwaitingInteractiveTimeout(interactive)),
  ];
  if (interactive.kind === 'question') {
    return [
      ...common,
      interactive.questions
        .map((question) =>
          [
            signatureText(question.id),
            signatureText(question.type),
            signatureText(question.header),
            signatureText(question.question),
            signatureText(question.placeholder),
            question.allowFreeText === true ? '1' : '0',
            signatureText(question.freeTextPlaceholder),
            optionSignature(question.options),
          ].join('\u001f')
        )
        .join('\u001d'),
    ].join('\u001c');
  }
  if (interactive.kind === 'approval') {
    return [
      ...common,
      interactive.approvals
        .map((approval) =>
          [
            signatureText(approval.id),
            signatureText(approval.command),
            signatureText(approval.ruleKey),
            signatureText(approval.description),
            approval.allowFreeText === true ? '1' : '0',
            signatureText(approval.freeTextPlaceholder),
            optionSignature(approval.options),
          ].join('\u001f')
        )
        .join('\u001d'),
    ].join('\u001c');
  }
  if (interactive.kind === 'form') {
    return [
      ...common,
      interactive.forms
        .map((form) =>
          [
            signatureText(form.id),
            signatureText(form.action),
            signatureText(form.title),
            formatTimelineEventValue(form.form),
          ].join('\u001f')
        )
        .join('\u001d'),
    ].join('\u001c');
  }
  return [
    ...common,
    signatureText(interactive.plan.id),
    signatureText(interactive.plan.planningId),
    signatureText(interactive.plan.title),
    (interactive.plan.options || [])
      .map((option) =>
        [
          signatureText(option.label),
          signatureText(option.description),
          signatureText(option.decision),
          signatureText(option.input?.type),
          signatureText(option.input?.placeholder),
          option.input?.required === true ? '1' : '0',
        ].join('\u001f')
      )
      .join('\u001d'),
  ].join('\u001c');
}

export function getAwaitingAnswerSummarySignature(
  summary: ChatTimelineAwaitingAnswerSummary | null | undefined
): string {
  if (!summary) {
    return '';
  }
  return [
    summary.status,
    summary.title,
    summary.itemCount,
    summary.copyText,
    summary.items.map((item) => [item.key, item.title, item.value].join('\u001f')).join('\u001e'),
  ].join('\u001c');
}

export function getAwaitingInteractiveTimeout(
  interactive: ChatTimelineAwaitingInteractive | null | undefined
): number | null {
  return normalizeAwaitingTimeoutMs(interactive?.timeout);
}
