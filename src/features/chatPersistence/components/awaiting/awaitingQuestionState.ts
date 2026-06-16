import type { AwaitingQuestionSubmitParamData } from '../../../../core/api/services/chatApi';
import { defaultT, type TFunction } from '../../../../shared/i18n/translate.ts';
import type { ChatTimelineAwaitingQuestion, ChatTimelineAwaitingQuestionOption } from '../../../chatTimeline/index.ts';

export type AwaitingQuestionDraft = AwaitingQuestionSubmitParamData;

export function hasAwaitingQuestions(questions: readonly ChatTimelineAwaitingQuestion[] | null | undefined): boolean {
  return Array.isArray(questions) && questions.length > 0;
}

export function createAwaitingQuestionDrafts(
  questions: readonly ChatTimelineAwaitingQuestion[] | null | undefined
): AwaitingQuestionDraft[] {
  return (questions || []).map((question) => ({ id: question.id }));
}

function signatureText(value: unknown): string {
  return String(value ?? '').trim();
}

export function getAwaitingQuestionsSignature(
  questions: readonly ChatTimelineAwaitingQuestion[] | null | undefined
): string {
  return (questions || [])
    .map((question) =>
      [
        signatureText(question.id),
        signatureText(question.type),
        signatureText(question.header),
        signatureText(question.question),
        signatureText(question.placeholder),
        question.allowFreeText === true ? '1' : '0',
        signatureText(question.freeTextPlaceholder),
        getSelectOptions(question)
          .map((option) =>
            [
              signatureText(option.label),
              signatureText(option.value),
              signatureText(option.description),
              signatureText(option.previewHtml)
            ].join('\u001f')
          )
          .join('\u001e')
      ].join('\u001f')
    )
    .join('\u001d');
}

export function reconcileAwaitingQuestionDrafts(
  questions: readonly ChatTimelineAwaitingQuestion[] | null | undefined,
  values: readonly AwaitingQuestionDraft[] | null | undefined
): AwaitingQuestionDraft[] {
  const normalizedQuestions = questions || [];
  const normalizedValues = values || [];
  const valueById = new Map(normalizedValues.map((value) => [value.id, value]));
  let changed = normalizedValues.length !== normalizedQuestions.length;

  const nextValues = normalizedQuestions.map((question, index) => {
    const current = valueById.get(question.id);
    if (!current) {
      changed = true;
      return { id: question.id };
    }
    if (normalizedValues[index] !== current) {
      changed = true;
    }
    return current;
  });

  return changed ? nextValues : (normalizedValues as AwaitingQuestionDraft[]);
}

export function getAwaitingQuestionHeading(question: ChatTimelineAwaitingQuestion): string {
  return String(question.question || question.header || '').trim();
}

export function getAwaitingQuestionPrompt(question: ChatTimelineAwaitingQuestion): string {
  const heading = getAwaitingQuestionHeading(question);
  const header = String(question.header || '').trim();
  if (!header || header === heading) {
    return '';
  }
  return header;
}

export function getAwaitingQuestionPlaceholder(question: ChatTimelineAwaitingQuestion): string {
  if (isSelectQuestionType(question)) {
    return question.freeTextPlaceholder || '';
  }
  return question.placeholder || '';
}

export function isSelectQuestionType(question: ChatTimelineAwaitingQuestion): boolean {
  return question.type === 'select' || question.type === 'multi-select';
}

export function isMultiSelectQuestionType(question: ChatTimelineAwaitingQuestion): boolean {
  return question.type === 'multi-select';
}

export function shouldAutoAdvanceAwaitingQuestion(question: ChatTimelineAwaitingQuestion): boolean {
  return question.type === 'select';
}

export function isDateQuestionType(question: ChatTimelineAwaitingQuestion): boolean {
  return question.type === 'date' || question.type === 'datetime';
}

export function getAwaitingDateFormat(question: ChatTimelineAwaitingQuestion): string {
  return question.type === 'datetime' ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD';
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function parseAwaitingDateAnswer(question: ChatTimelineAwaitingQuestion, answer: unknown): Date | null {
  if (!isDateQuestionType(question) || typeof answer !== 'string') {
    return null;
  }

  if (question.type === 'date') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(answer.trim());
    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    return isValidDateParts(year, month, day) ? new Date(year, month - 1, day) : null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2}) ([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.exec(answer.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hours = Number(match[4]);
  const minutes = Number(match[5]);
  const seconds = Number(match[6]);
  return isValidDateParts(year, month, day) ? new Date(year, month - 1, day, hours, minutes, seconds) : null;
}

export function formatAwaitingDateAnswer(question: ChatTimelineAwaitingQuestion, date: Date): string {
  const year = date.getFullYear();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());
  const dateText = `${year}-${month}-${day}`;
  if (question.type !== 'datetime') {
    return dateText;
  }

  const hours = padDatePart(date.getHours());
  const minutes = padDatePart(date.getMinutes());
  const seconds = padDatePart(date.getSeconds());
  return `${dateText} ${hours}:${minutes}:${seconds}`;
}

export function isValidAwaitingDateAnswer(question: ChatTimelineAwaitingQuestion, answer: unknown): boolean {
  return parseAwaitingDateAnswer(question, answer) !== null;
}

export function getSelectOptionValue(option: ChatTimelineAwaitingQuestionOption): string {
  return option.value ?? option.label;
}

export function getSelectOptions(question: ChatTimelineAwaitingQuestion): ChatTimelineAwaitingQuestionOption[] {
  return Array.isArray(question.options) ? question.options : [];
}

function getSelectOptionValues(question: ChatTimelineAwaitingQuestion): string[] {
  return getSelectOptions(question).map(getSelectOptionValue);
}

export function getSelectedOptionAnswers(
  question: ChatTimelineAwaitingQuestion,
  value: AwaitingQuestionDraft | undefined
): string[] {
  const optionValues = new Set(getSelectOptionValues(question));
  if (isMultiSelectQuestionType(question)) {
    return (value?.answers || []).filter((item) => optionValues.has(item));
  }
  return typeof value?.answer === 'string' && optionValues.has(value.answer) ? [value.answer] : [];
}

export function getSelectFreeTextAnswer(
  question: ChatTimelineAwaitingQuestion,
  value: AwaitingQuestionDraft | undefined
): string {
  const optionValues = new Set(getSelectOptionValues(question));
  if (isMultiSelectQuestionType(question)) {
    return (value?.answers || []).find((item) => item && !optionValues.has(item)) || '';
  }
  return typeof value?.answer === 'string' && !optionValues.has(value.answer) ? value.answer : '';
}

function hasTextAnswer(value: AwaitingQuestionDraft | undefined): boolean {
  return typeof value?.answer === 'string' && value.answer.trim().length > 0;
}

function hasNumberAnswer(value: AwaitingQuestionDraft | undefined): boolean {
  if (typeof value?.answer === 'number') {
    return Number.isFinite(value.answer);
  }
  if (typeof value?.answer === 'string' && value.answer.trim()) {
    return Number.isFinite(Number(value.answer));
  }
  return false;
}

export function getAwaitingAnswerError(
  question: ChatTimelineAwaitingQuestion,
  value: AwaitingQuestionDraft | undefined,
  t: TFunction = defaultT
): string | null {
  if (question.type === 'text' || question.type === 'password') {
    return hasTextAnswer(value) ? null : t('awaiting.error.textRequired');
  }
  if (question.type === 'number') {
    return hasNumberAnswer(value) ? null : t('awaiting.error.numberRequired');
  }
  if (question.type === 'date' || question.type === 'datetime') {
    return isValidAwaitingDateAnswer(question, value?.answer)
      ? null
      : t('awaiting.error.dateRequired', { format: getAwaitingDateFormat(question) });
  }
  if (question.type === 'multi-select') {
    const answers = buildQuestionSubmitParams([question], value ? [value] : [])[0]?.answers;
    return Array.isArray(answers) && answers.length > 0 ? null : t('awaiting.error.multiSelectRequired');
  }
  if (question.type === 'select') {
    return hasTextAnswer(value) ? null : t('awaiting.error.selectRequired');
  }
  return null;
}

export function findAwaitingAnswerError(
  questions: readonly ChatTimelineAwaitingQuestion[] | null | undefined,
  values: readonly AwaitingQuestionDraft[] | null | undefined,
  t: TFunction = defaultT
): { index: number; message: string } | null {
  const normalizedQuestions = questions || [];
  const normalizedValues = values || [];

  for (let index = 0; index < normalizedQuestions.length; index += 1) {
    const message = getAwaitingAnswerError(normalizedQuestions[index], normalizedValues[index], t);
    if (message) {
      return { index, message };
    }
  }
  return null;
}

export function buildQuestionSubmitParams(
  questions: readonly ChatTimelineAwaitingQuestion[] | null | undefined,
  values: readonly AwaitingQuestionDraft[] | null | undefined
): AwaitingQuestionSubmitParamData[] {
  const normalizedQuestions = questions || [];
  const normalizedValues = values || [];

  return normalizedQuestions.map((question, index) => {
    const value = normalizedValues[index];
    const next: AwaitingQuestionSubmitParamData = { id: question.id };

    if (question.type === 'number') {
      const numeric = Number(value?.answer);
      if (Number.isFinite(numeric)) {
        next.answer = numeric;
      }
      return next;
    }

    if (typeof value?.answer === 'string' && value.answer.trim()) {
      next.answer = value.answer.trim();
      return next;
    }

    if (typeof value?.answer === 'number' && Number.isFinite(value.answer)) {
      next.answer = value.answer;
      return next;
    }

    if (Array.isArray(value?.answers)) {
      const answers = value.answers.map((item) => String(item).trim()).filter(Boolean);
      if (answers.length > 0) {
        next.answers = answers;
      }
    }

    return next;
  });
}

export function resolveAwaitingCountdownDeadline(input: {
  createdAt: number | null | undefined;
  timeout: number | null | undefined;
  displayedAt: number;
}): number | null {
  const timeout = Number(input.timeout);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    return null;
  }

  const createdAt = Number(input.createdAt);
  const remoteDeadline = Number.isFinite(createdAt) && createdAt > 0 ? createdAt + timeout : 0;
  return remoteDeadline > input.displayedAt ? remoteDeadline : input.displayedAt + timeout;
}

export function getAwaitingCountdownRemainingSeconds(deadline: number | null | undefined, now: number): number | null {
  if (deadline === null || deadline === undefined) {
    return null;
  }

  const normalizedDeadline = Number(deadline);
  if (!Number.isFinite(normalizedDeadline)) {
    return null;
  }

  return Math.max(0, Math.ceil((normalizedDeadline - now) / 1000));
}

export function toggleSelectAnswer(
  question: ChatTimelineAwaitingQuestion,
  value: AwaitingQuestionDraft | undefined,
  optionValue: string
): AwaitingQuestionDraft {
  if (!isMultiSelectQuestionType(question)) {
    return { id: question.id, answer: optionValue };
  }

  const selected = getSelectedOptionAnswers(question, value);
  const freeText = getSelectFreeTextAnswer(question, value);
  const selectedSet = new Set(selected);
  if (selectedSet.has(optionValue)) {
    selectedSet.delete(optionValue);
  } else {
    selectedSet.add(optionValue);
  }

  return {
    id: question.id,
    answers: [...selectedSet, ...(freeText ? [freeText] : [])]
  };
}

export function setFreeTextAnswer(
  question: ChatTimelineAwaitingQuestion,
  value: AwaitingQuestionDraft | undefined,
  freeText: string
): AwaitingQuestionDraft {
  if (!isMultiSelectQuestionType(question)) {
    return { id: question.id, answer: freeText };
  }

  const selected = getSelectedOptionAnswers(question, value);
  const trimmed = freeText.trim();
  return {
    id: question.id,
    answers: trimmed ? [...selected, trimmed] : selected
  };
}
