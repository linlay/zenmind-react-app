import { useIsFocused } from '@react-navigation/native';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { getAgentDefaultAccessLevel, type AgentDefaultAccessLevel, type AwaitingSubmitPayloadData } from '../../../../core/api/services/chatApi';
import { useConversationPreviewActions } from '../../../../shared/components/conversationPreview/ConversationPreviewProvider';
import { AppIcon } from '../../../../shared/icons/AppIcon';
import { type TFunction, useT } from '../../../../shared/i18n';
import { useAppTheme } from '../../../../shared/visual/AppThemeProvider';
import { cn } from '../../../../shared/visual/className';
import { chatSyncService } from '../../../chatRealtime/chatSyncService';
import { getChatCacheScopeId } from '../../cacheScope';
import { ChatComposerSheet } from '../ChatComposerSheet';
import type { ChatConversationAwaitingState } from '../../../chatRealtime/types';
import {
  type ChatTimelineAwaitingApproval,
  type ChatTimelineAwaitingApprovalDecision,
  type ChatTimelineAwaitingApprovalOption,
  type ChatTimelineAwaitingInteractive,
  type ChatTimelineAwaitingPlan,
  type ChatTimelineAwaitingPlanDecision,
  type ChatTimelineAwaitingPlanOption,
  type ChatTimelineAwaitingQuestion,
  getAwaitingInteractiveTimeout,
} from '../../../chatTimeline/index.ts';
import {
  buildAwaitingSubmitPayload,
  findMissingApprovalIndex,
  hasAwaitingApprovalResponse,
  type AwaitingApprovalDraft,
} from './awaitingSubmitState';
import {
  createAwaitingQuestionDrafts,
  findAwaitingAnswerError,
  getAwaitingAnswerError,
  getAwaitingQuestionHeading,
  getAwaitingQuestionPlaceholder,
  getAwaitingQuestionPrompt,
  getAwaitingQuestionsSignature,
  getSelectFreeTextAnswer,
  getSelectOptionValue,
  getSelectOptions,
  getSelectedOptionAnswers,
  hasAwaitingQuestions,
  isDateQuestionType,
  isSelectQuestionType,
  reconcileAwaitingQuestionDrafts,
  setFreeTextAnswer,
  shouldAutoAdvanceAwaitingQuestion,
  toggleSelectAnswer,
  type AwaitingQuestionDraft,
} from './awaitingQuestionState';
import { AwaitingPanelFooter } from './AwaitingPanelFooter';
import { AwaitingDateTimeInput } from './AwaitingDateTimeInput';
import { AwaitingFormPanel } from './AwaitingFormPanel';

type ChatAwaitingDockProps = {
  awaiting: ChatConversationAwaitingState;
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: AwaitingSubmitPayloadData) => Promise<unknown>;
};

type SubmitState = {
  awaitingId: string;
  phase: 'submitting' | 'submitted';
};

type PanelProps<T extends ChatTimelineAwaitingInteractive> = {
  awaiting: ChatConversationAwaitingState & { interactive: T };
  disabled: boolean;
  submitting: boolean;
  submitError: string;
  submitPayload: (payload: AwaitingSubmitPayloadData) => void;
};
const SHEET_HEADER_CLASS = 'min-h-[60px] flex-row items-center justify-between gap-app-sm px-app-lg pt-1';
const SHEET_TITLE_CLASS = 'min-w-0 flex-1 text-app-title font-bold text-app-primary';
const SHEET_CLOSE_CLASS = 'h-11 w-11 items-center justify-center rounded-app-pill active:bg-app-surface-muted';
const PANEL_BODY_CLASS = 'gap-app-sm px-app-lg pb-app-md';
const HEADER_CLASS = 'min-h-8 flex-row items-start justify-between gap-app-md';
const QUESTION_TEXT_CLASS = 'min-w-0 flex-1 gap-1';
const HEADING_CLASS = 'text-[15px] font-semibold leading-[21px] text-app-primary';
const PROMPT_CLASS = 'text-[12px] leading-[17px] text-app-secondary';
const HEADER_SIDE_CLASS = 'shrink-0 items-end gap-1';
const ITEM_TITLE_CLASS = 'text-[14px] font-semibold leading-[19px] text-app-primary';
const MONO_PAYLOAD_CLASS =
  'rounded-app-sm bg-app-surface-muted px-2 py-[7px] text-[12px] leading-[17px] text-app-secondary';
const PAGINATION_CLASS = 'h-[28px] flex-row items-center gap-[5px]';
const PAGINATION_BUTTON_CLASS = 'h-[28px] w-[28px] items-center justify-center rounded-app-sm active:opacity-[0.72]';
const PAGINATION_ARROW_CLASS = 'text-[22px] leading-[28px] text-app-secondary';
const PAGINATION_TEXT_CLASS = 'min-w-[34px] text-center text-[12px] font-medium leading-4 text-app-secondary';
const OPTIONS_BLOCK_CLASS = 'gap-[3px]';
const OPTION_ROW_CLASS = 'min-h-11 flex-row items-center rounded-app-md';
const OPTION_SELECT_ACTION_CLASS =
  'min-h-11 min-w-0 flex-1 flex-row items-center gap-app-sm rounded-app-md px-app-md py-[9px] active:opacity-[0.72]';
const OPTION_PREVIEW_ACTION_CLASS =
  'mr-1 h-11 w-11 shrink-0 items-center justify-center rounded-app-sm active:bg-app-surface-muted';
const SELECTED_OPTION_ROW_CLASS = 'bg-app-brand-blue-soft';
const OPTION_TEXT_CLASS = 'min-w-0 flex-1 gap-[2px]';
const OPTION_LABEL_CLASS = 'text-[14px] font-medium leading-[19px] text-app-primary';
const OPTION_DESCRIPTION_CLASS = 'text-[12px] leading-4 text-app-secondary';
const SELECTED_TEXT_CLASS = 'text-app-brand-blue-strong';
const SELECTED_MARK_CLASS = 'h-5 w-5 items-center justify-center';
const FREE_TEXT_ROW_CLASS =
  'min-h-11 flex-row items-center gap-app-sm rounded-app-md bg-app-surface-muted px-app-md py-1';
const FREE_TEXT_INPUT_CLASS = 'min-h-9 min-w-0 flex-1 text-[14px] leading-[19px] text-app-primary';
const PLAN_REJECT_LABEL_CLASS = 'shrink-0 text-[14px] font-bold leading-[19px] text-app-primary';
const FIELD_BLOCK_CLASS = 'min-h-[46px] justify-center';
const INPUT_FIELD_CLASS =
  'min-h-11 rounded-app-md border border-app-line bg-app-surface-muted px-app-md py-2 text-[15px] leading-5 text-app-primary';
const DISABLED_BUTTON_CLASS = 'opacity-[0.38]';
const DISABLED_TEXT_CLASS = 'text-app-tertiary';

function getAwaitingDecisionLabel(
  decision: ChatTimelineAwaitingApprovalDecision | ChatTimelineAwaitingPlanDecision,
  t: TFunction
): string {
  switch (decision) {
    case 'approve':
      return t('awaiting.decision.approve');
    case 'approve_rule_run':
      return t('awaiting.decision.approveRuleRun');
    case 'reject':
      return t('awaiting.decision.reject');
    default:
      return decision;
  }
}

function getApprovalOptions(
  approval: ChatTimelineAwaitingApproval,
  t: TFunction
): ChatTimelineAwaitingApprovalOption[] {
  if (approval.options?.length) {
    return approval.options;
  }
  return [
    {
      label: t('awaiting.decision.approve'),
      decision: 'approve',
      description: t('awaiting.approval.option.approve.description'),
    },
    {
      label: t('awaiting.decision.approveRuleRun'),
      decision: 'approve_rule_run',
      description: t('awaiting.approval.option.approveRuleRun.description'),
    },
    {
      label: t('awaiting.decision.reject'),
      decision: 'reject',
      description: t('awaiting.approval.option.reject.description'),
    },
  ];
}

function getPlanOptions(plan: ChatTimelineAwaitingPlan, t: TFunction): ChatTimelineAwaitingPlanOption[] {
  if (plan.options?.length) {
    return plan.options;
  }
  return [
    {
      label: t('awaiting.plan.option.approve'),
      decision: 'approve',
    },
    {
      label: t('awaiting.plan.reject.label'),
      decision: 'reject',
      input: {
        type: 'text',
        placeholder: t('awaiting.plan.reject.placeholder'),
        required: false,
      },
    },
  ];
}

function patchDraftAt(
  values: readonly AwaitingQuestionDraft[],
  index: number,
  draft: AwaitingQuestionDraft
): AwaitingQuestionDraft[] {
  return values.map((item, itemIndex) => (itemIndex === index ? draft : item));
}

function clampAwaitingPageIndex(index: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.min(Math.max(index, 0), total - 1);
}

function PaginationControl({
  current,
  disabled,
  nextLabel,
  previousLabel,
  total,
  onMove,
}: {
  current: number;
  disabled: boolean;
  nextLabel: string;
  previousLabel: string;
  total: number;
  onMove: (nextIndex: number) => void;
}) {
  if (total <= 1) {
    return null;
  }

  const canMoveBack = !disabled && current > 0;
  const canMoveForward = !disabled && current < total - 1;

  return (
    <View className={PAGINATION_CLASS}>
      <Pressable
        accessibilityLabel={previousLabel}
        accessibilityRole="button"
        disabled={!canMoveBack}
        onPress={() => onMove(current - 1)}
        className={cn(PAGINATION_BUTTON_CLASS, !canMoveBack ? DISABLED_BUTTON_CLASS : null)}
      >
        <Text allowFontScaling={false} className={cn(PAGINATION_ARROW_CLASS, !canMoveBack ? DISABLED_TEXT_CLASS : null)}>
          ‹
        </Text>
      </Pressable>
      <Text allowFontScaling={false} className={PAGINATION_TEXT_CLASS}>
        {current + 1} / {total}
      </Text>
      <Pressable
        accessibilityLabel={nextLabel}
        accessibilityRole="button"
        disabled={!canMoveForward}
        onPress={() => onMove(current + 1)}
        className={cn(PAGINATION_BUTTON_CLASS, !canMoveForward ? DISABLED_BUTTON_CLASS : null)}
      >
        <Text allowFontScaling={false} className={cn(PAGINATION_ARROW_CLASS, !canMoveForward ? DISABLED_TEXT_CLASS : null)}>
          ›
        </Text>
      </Pressable>
    </View>
  );
}

const ChoicePreviewButton = memo(function ChoicePreviewButton({
  disabled,
  label,
  source,
}: {
  disabled: boolean;
  label: string;
  source: string;
}) {
  const t = useT();
  const { openHtmlPreview } = useConversationPreviewActions();
  const handlePress = useCallback(() => openHtmlPreview({ source }), [openHtmlPreview, source]);

  return (
    <Pressable
      accessibilityLabel={t('awaiting.option.preview', { label })}
      accessibilityRole="button"
      disabled={disabled}
      onPress={handlePress}
      className={OPTION_PREVIEW_ACTION_CLASS}
    >
      <AppIcon usage="markdownPreview.open" />
    </Pressable>
  );
});

const ChoiceRow = memo(function ChoiceRow({
  description,
  disabled,
  label,
  previewHtml,
  selected,
  value,
  onPress,
}: {
  description?: string;
  disabled: boolean;
  label: string;
  previewHtml?: string;
  selected: boolean;
  value: string;
  onPress: (value: string) => void;
}) {
  const handlePress = useCallback(() => onPress(value), [onPress, value]);

  return (
    <View
      className={cn(OPTION_ROW_CLASS, disabled ? DISABLED_BUTTON_CLASS : null, selected ? SELECTED_OPTION_ROW_CLASS : null)}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled, selected }}
        disabled={disabled}
        onPress={handlePress}
        className={OPTION_SELECT_ACTION_CLASS}
      >
        <View className={OPTION_TEXT_CLASS}>
          <Text allowFontScaling={false} className={cn(OPTION_LABEL_CLASS, selected ? SELECTED_TEXT_CLASS : null)}>
            {label}
          </Text>
          {description ? (
            <Text allowFontScaling={false} numberOfLines={2} className={OPTION_DESCRIPTION_CLASS}>
              {description}
            </Text>
          ) : null}
        </View>
        {selected ? (
          <View className={SELECTED_MARK_CLASS}>
            <AppIcon usage="composer.optionSelected" size={16} />
          </View>
        ) : null}
      </Pressable>
      {previewHtml ? (
        <ChoicePreviewButton disabled={disabled} label={label} source={previewHtml} />
      ) : null}
    </View>
  );
});

function QuestionInput({
  disabled,
  question,
  value,
  onChange,
  onChangeAndAdvance,
  onSubmitCurrent,
}: {
  disabled: boolean;
  question: ChatTimelineAwaitingQuestion;
  value: AwaitingQuestionDraft | undefined;
  onChange: (draft: AwaitingQuestionDraft) => void;
  onChangeAndAdvance: (draft: AwaitingQuestionDraft) => void;
  onSubmitCurrent: () => void;
}) {
  const { theme } = useAppTheme();
  const placeholder = getAwaitingQuestionPlaceholder(question);
  const handleSelectOptionPress = useCallback(
    (optionValue: string) => {
      const nextDraft = toggleSelectAnswer(question, value, optionValue);
      if (shouldAutoAdvanceAwaitingQuestion(question)) {
        onChangeAndAdvance(nextDraft);
        return;
      }
      onChange(nextDraft);
    },
    [onChange, onChangeAndAdvance, question, value]
  );

  if (isSelectQuestionType(question)) {
    const options = getSelectOptions(question);
    const selected = new Set(getSelectedOptionAnswers(question, value));
    const freeTextAnswer = getSelectFreeTextAnswer(question, value);

    return (
      <View className={OPTIONS_BLOCK_CLASS}>
        {options.map((option) => {
          const optionValue = getSelectOptionValue(option);
          return (
            <ChoiceRow
              key={optionValue}
              disabled={disabled}
              label={option.label}
              description={option.description}
              previewHtml={option.previewHtml}
              selected={selected.has(optionValue)}
              value={optionValue}
              onPress={handleSelectOptionPress}
            />
          );
        })}
        {question.allowFreeText ? (
          <View className={FREE_TEXT_ROW_CLASS}>
            <TextInput
              value={freeTextAnswer}
              editable={!disabled}
              onChangeText={(text) => onChange(setFreeTextAnswer(question, value, text))}
              onSubmitEditing={disabled ? undefined : onSubmitCurrent}
              placeholder={placeholder}
              placeholderTextColor={theme.colors.textTertiary}
              allowFontScaling={false}
              returnKeyType="done"
              className={FREE_TEXT_INPUT_CLASS}
            />
          </View>
        ) : null}
      </View>
    );
  }

  if (isDateQuestionType(question)) {
    return (
      <AwaitingDateTimeInput
        disabled={disabled}
        question={question}
        value={value}
        onChange={onChange}
        onSubmitCurrent={onSubmitCurrent}
      />
    );
  }

  const textValue =
    typeof value?.answer === 'number' ? String(value.answer) : typeof value?.answer === 'string' ? value.answer : '';
  const keyboardType = question.type === 'number' ? 'decimal-pad' : 'default';
  const secureTextEntry = question.type === 'password';

  return (
    <View className={FIELD_BLOCK_CLASS}>
      <TextInput
        value={textValue}
        editable={!disabled}
        onChangeText={(text) => onChange({ id: question.id, answer: text })}
        onSubmitEditing={disabled ? undefined : onSubmitCurrent}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textTertiary}
        allowFontScaling={false}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        returnKeyType="done"
        className={INPUT_FIELD_CLASS}
      />
    </View>
  );
}

function QuestionPanel({
  awaiting,
  disabled,
  submitting,
  submitError,
  submitPayload,
}: PanelProps<Extract<ChatTimelineAwaitingInteractive, { kind: 'question' }>>) {
  const t = useT();
  const questions = useMemo(() => awaiting.interactive.questions || [], [awaiting.interactive.questions]);
  const questionsRef = useRef(questions);
  const questionsSignature = useMemo(() => getAwaitingQuestionsSignature(questions), [questions]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [values, setValues] = useState<AwaitingQuestionDraft[]>(() => createAwaitingQuestionDrafts(questions));
  const [errorText, setErrorText] = useState('');
  const disabledRef = useRef(disabled);
  const ready = hasAwaitingQuestions(questions);
  const currentQuestion = questions[activeIndex];
  const currentValue = values[activeIndex];
  const isLastQuestion = activeIndex >= questions.length - 1;
  const timeoutMs = getAwaitingInteractiveTimeout(awaiting.interactive);
  disabledRef.current = disabled;

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  useEffect(() => {
    setActiveIndex(0);
    setValues(createAwaitingQuestionDrafts(questionsRef.current));
    setErrorText('');
  }, [awaiting.id]);

  useEffect(() => {
    const nextQuestions = questionsRef.current;
    setValues((current) => reconcileAwaitingQuestionDrafts(nextQuestions, current));
    setActiveIndex((index) => clampAwaitingPageIndex(index, nextQuestions.length));
  }, [questionsSignature]);

  const moveToIndex = useCallback(
    (nextIndex: number) => {
      if (disabledRef.current) {
        return;
      }
      setErrorText('');
      setActiveIndex(clampAwaitingPageIndex(nextIndex, questions.length));
    },
    [questions.length]
  );

  const patchCurrentValue = useCallback(
    (draft: AwaitingQuestionDraft) => {
      if (disabledRef.current) {
        return;
      }
      setErrorText('');
      setValues((current) => patchDraftAt(current, activeIndex, draft));
    },
    [activeIndex]
  );

  const patchCurrentValues = useCallback(
    (draft: AwaitingQuestionDraft) => patchDraftAt(values, activeIndex, draft),
    [activeIndex, values]
  );

  const submitAllWithValues = useCallback(
    (nextValues: readonly AwaitingQuestionDraft[]) => {
      const error = findAwaitingAnswerError(questions, nextValues, t);
      if (error) {
        setActiveIndex(error.index);
        setErrorText(error.message);
        return;
      }
      submitPayload(buildAwaitingSubmitPayload(awaiting, { kind: 'question', values: nextValues }));
    },
    [awaiting, questions, submitPayload, t]
  );

  const submitAll = useCallback(() => submitAllWithValues(values), [submitAllWithValues, values]);

  const patchCurrentValueAndAdvance = useCallback(
    (draft: AwaitingQuestionDraft) => {
      if (!currentQuestion || disabledRef.current) {
        return;
      }
      const nextValues = patchCurrentValues(draft);
      setErrorText('');
      setValues(nextValues);
      const error = getAwaitingAnswerError(currentQuestion, draft, t);
      if (error) {
        setErrorText(error);
        return;
      }
      if (isLastQuestion) {
        submitAllWithValues(nextValues);
        return;
      }
      moveToIndex(activeIndex + 1);
    },
    [activeIndex, currentQuestion, isLastQuestion, moveToIndex, patchCurrentValues, submitAllWithValues, t]
  );

  const submitCurrentOrMove = useCallback(() => {
    if (!currentQuestion || disabledRef.current) {
      return;
    }
    const error = getAwaitingAnswerError(currentQuestion, currentValue, t);
    if (error) {
      setErrorText(error);
      return;
    }
    if (isLastQuestion) {
      submitAll();
      return;
    }
    moveToIndex(activeIndex + 1);
  }, [activeIndex, currentQuestion, currentValue, isLastQuestion, moveToIndex, submitAll, t]);

  const skipAwaiting = useCallback(() => {
    if (!currentQuestion || disabledRef.current) {
      return;
    }
    submitPayload(buildAwaitingSubmitPayload(awaiting, { kind: 'question-reject', questionId: currentQuestion.id }));
  }, [awaiting, currentQuestion, submitPayload]);

  if (!ready || !currentQuestion) {
    return null;
  }

  const heading = getAwaitingQuestionHeading(currentQuestion);
  const prompt = getAwaitingQuestionPrompt(currentQuestion);

  return (
    <>
      <ScrollView
        key={currentQuestion.id}
        className="shrink"
        contentContainerClassName={PANEL_BODY_CLASS}
        keyboardShouldPersistTaps="handled"
      >
        <View className={HEADER_CLASS}>
          <View className={QUESTION_TEXT_CLASS}>
            <Text allowFontScaling={false} className={HEADING_CLASS}>
              {heading}
            </Text>
            {prompt ? (
              <Text allowFontScaling={false} className={PROMPT_CLASS}>
                {prompt}
              </Text>
            ) : null}
          </View>
          <View className={HEADER_SIDE_CLASS}>
            <PaginationControl
              current={activeIndex}
              disabled={disabled}
              nextLabel={t('awaiting.nextQuestion')}
              previousLabel={t('awaiting.previousQuestion')}
              total={questions.length}
              onMove={moveToIndex}
            />
          </View>
        </View>
        <QuestionInput
          disabled={disabled}
          question={currentQuestion}
          value={currentValue}
          onChange={patchCurrentValue}
          onChangeAndAdvance={patchCurrentValueAndAdvance}
          onSubmitCurrent={submitCurrentOrMove}
        />
      </ScrollView>
      <AwaitingPanelFooter
        awaiting={awaiting}
        disabled={disabled}
        errorText={errorText || submitError}
        primaryLabel={isLastQuestion ? t('awaiting.submit') : t('awaiting.continue')}
        secondaryLabel={t('awaiting.skip')}
        submitting={submitting}
        timeoutMs={timeoutMs}
        onPrimary={submitCurrentOrMove}
        onSecondary={skipAwaiting}
      />
    </>
  );
}

const ApprovalItem = memo(function ApprovalItem({
  approval,
  decision,
  disabled,
  reason,
  onDecision,
  onReason,
}: {
  approval: ChatTimelineAwaitingApproval;
  decision?: ChatTimelineAwaitingApprovalDecision;
  disabled: boolean;
  reason: string;
  onDecision: (approvalId: string, decision: ChatTimelineAwaitingApprovalDecision) => void;
  onReason: (approvalId: string, reason: string) => void;
}) {
  const { theme } = useAppTheme();
  const t = useT();
  const options = useMemo(() => getApprovalOptions(approval, t), [approval, t]);
  const reasonLabels = {
    runtime_wrapper_arguments: 'awaiting.approval.reason.runtimeArguments',
    path_outside_read_roots: 'awaiting.approval.reason.readPath',
    path_outside_write_roots: 'awaiting.approval.reason.writePath',
    execution_effects_unknown: 'awaiting.approval.reason.executionEffects'
  } as const;
  const handleDecisionPress = useCallback(
    (value: string) => onDecision(approval.id, value as ChatTimelineAwaitingApprovalDecision),
    [approval.id, onDecision]
  );

  return (
    <View className="gap-app-sm">
      <Text allowFontScaling={false} className={ITEM_TITLE_CLASS}>
        {approval.description || approval.command}
      </Text>
      {approval.description && approval.command !== approval.description ? (
        <Text allowFontScaling={false} selectable className={MONO_PAYLOAD_CLASS}>
          {approval.command}
        </Text>
      ) : null}
      {approval.reasons?.map(({ code, subject, detail }, reasonIndex) => {
        const label = Object.hasOwn(reasonLabels, code) ? reasonLabels[code as keyof typeof reasonLabels] : undefined;
        const reasonText = label && subject
          ? t(label, { subject })
          : [detail, subject && !detail.includes(subject) ? subject : ''].filter(Boolean).join(' · ');
        return reasonText ? (
          <Text key={`${code}:${subject}:${reasonIndex}`} selectable className={MONO_PAYLOAD_CLASS}>
            {reasonText}
          </Text>
        ) : null;
      })}
      <View className={OPTIONS_BLOCK_CLASS}>
        {options.map((option) => (
          <ChoiceRow
            key={`${approval.id}:${option.decision}`}
            disabled={disabled}
            label={option.label || getAwaitingDecisionLabel(option.decision, t)}
            description={option.description}
            selected={decision === option.decision}
            value={option.decision}
            onPress={handleDecisionPress}
          />
        ))}
      </View>
      {approval.allowFreeText ? (
        <TextInput
          value={reason}
          editable={!disabled}
          onChangeText={(text) => onReason(approval.id, text)}
          placeholder={approval.freeTextPlaceholder || t('awaiting.reason.placeholder')}
          placeholderTextColor={theme.colors.textTertiary}
          allowFontScaling={false}
          returnKeyType="done"
          className={INPUT_FIELD_CLASS}
        />
      ) : null}
    </View>
  );
});

function ApprovalPanel({
  awaiting,
  disabled,
  submitting,
  submitError,
  submitPayload,
}: PanelProps<Extract<ChatTimelineAwaitingInteractive, { kind: 'approval' }>>) {
  const t = useT();
  const approvals = useMemo(() => awaiting.interactive.approvals || [], [awaiting.interactive.approvals]);
  const timeoutMs = getAwaitingInteractiveTimeout(awaiting.interactive);
  const [activeIndex, setActiveIndex] = useState(0);
  const [draft, setDraft] = useState<AwaitingApprovalDraft>({ decisions: {}, reasons: {} });
  const [errorText, setErrorText] = useState('');
  const disabledRef = useRef(disabled);
  const currentApproval = approvals[activeIndex];
  const isLastApproval = activeIndex >= approvals.length - 1;
  disabledRef.current = disabled;

  useEffect(() => {
    setActiveIndex(0);
    setDraft({ decisions: {}, reasons: {} });
    setErrorText('');
  }, [awaiting.id]);

  useEffect(() => {
    setActiveIndex((index) => clampAwaitingPageIndex(index, approvals.length));
  }, [approvals.length]);

  const moveToIndex = useCallback(
    (nextIndex: number) => {
      if (disabledRef.current) {
        return;
      }
      setErrorText('');
      setActiveIndex(clampAwaitingPageIndex(nextIndex, approvals.length));
    },
    [approvals.length]
  );

  const setDecision = useCallback((approvalId: string, decision: ChatTimelineAwaitingApprovalDecision) => {
    if (disabledRef.current) {
      return;
    }
    setErrorText('');
    setDraft((current) => ({
      ...current,
      decisions: { ...current.decisions, [approvalId]: decision },
    }));
  }, []);

  const setReason = useCallback((approvalId: string, reason: string) => {
    if (disabledRef.current) {
      return;
    }
    setErrorText('');
    setDraft((current) => ({
      ...current,
      reasons: { ...current.reasons, [approvalId]: reason },
    }));
  }, []);

  const submitAll = useCallback(() => {
    if (disabledRef.current) {
      return;
    }
    const missingIndex = findMissingApprovalIndex(approvals, draft);
    if (missingIndex >= 0) {
      setActiveIndex(missingIndex);
      setErrorText(t('awaiting.error.approvalRequired'));
      return;
    }
    submitPayload(buildAwaitingSubmitPayload(awaiting, { kind: 'approval', ...draft }));
  }, [approvals, awaiting, draft, submitPayload, t]);

  const submitCurrentOrMove = useCallback(() => {
    if (!currentApproval || disabledRef.current) {
      return;
    }
    if (!hasAwaitingApprovalResponse(currentApproval, draft)) {
      setErrorText(t('awaiting.error.approvalRequired'));
      return;
    }
    setErrorText('');
    if (isLastApproval) {
      submitAll();
      return;
    }
    moveToIndex(activeIndex + 1);
  }, [activeIndex, currentApproval, draft, isLastApproval, moveToIndex, submitAll, t]);

  if (!currentApproval) {
    return null;
  }

  return (
    <>
      <ScrollView
        key={currentApproval.id}
        className="shrink"
        contentContainerClassName={PANEL_BODY_CLASS}
        keyboardShouldPersistTaps="handled"
      >
        {awaiting.prompt || approvals.length > 1 ? (
          <View className={HEADER_CLASS}>
            <View className={QUESTION_TEXT_CLASS}>
              {awaiting.prompt ? (
                <Text allowFontScaling={false} className={PROMPT_CLASS}>
                  {awaiting.prompt}
                </Text>
              ) : null}
            </View>
            <View className={HEADER_SIDE_CLASS}>
              <PaginationControl
                current={activeIndex}
                disabled={disabled}
                nextLabel={t('awaiting.nextApproval')}
                previousLabel={t('awaiting.previousApproval')}
                total={approvals.length}
                onMove={moveToIndex}
              />
            </View>
          </View>
        ) : null}
        <ApprovalItem
          approval={currentApproval}
          decision={draft.decisions[currentApproval.id]}
          disabled={disabled}
          reason={draft.reasons[currentApproval.id] || ''}
          onDecision={setDecision}
          onReason={setReason}
        />
      </ScrollView>
      <AwaitingPanelFooter
        awaiting={awaiting}
        disabled={disabled}
        errorText={errorText || submitError}
        primaryLabel={isLastApproval ? t('awaiting.submit') : t('awaiting.continue')}
        submitting={submitting}
        timeoutMs={timeoutMs}
        onPrimary={submitCurrentOrMove}
      />
    </>
  );
}

function PlanPanel({
  awaiting,
  disabled,
  executionAccessLevel,
  submitting,
  submitError,
  submitPayload,
}: PanelProps<Extract<ChatTimelineAwaitingInteractive, { kind: 'plan' }>> & {
  executionAccessLevel?: AgentDefaultAccessLevel;
}) {
  const t = useT();
  const { theme } = useAppTheme();
  const plan = awaiting.interactive.plan;
  const options = useMemo(() => getPlanOptions(plan, t), [plan, t]);
  const timeoutMs = getAwaitingInteractiveTimeout(awaiting.interactive);
  const [rejectActive, setRejectActive] = useState(false);
  const [reason, setReason] = useState('');
  const [errorText, setErrorText] = useState('');
  const approveOption = options.find((option) => option.decision === 'approve');
  const rejectOption = options.find((option) => option.decision === 'reject');
  const title = plan.title || awaiting.prompt;
  const prompt = awaiting.prompt && awaiting.prompt !== title ? awaiting.prompt : '';
  const rejectPlaceholder =
    rejectOption?.input?.placeholder || t('awaiting.plan.reject.placeholder');

  useEffect(() => {
    setRejectActive(false);
    setReason('');
    setErrorText('');
  }, [awaiting.id]);

  const submitDecision = useCallback(
    (nextDecision: ChatTimelineAwaitingPlanDecision, nextReason = '') => {
      if (disabled) {
        return;
      }
      const selected = options.find((option) => option.decision === nextDecision);
      const normalizedReason = nextReason.trim();
      if (selected?.input?.required && !normalizedReason) {
        setErrorText(t('awaiting.error.reasonRequired'));
        if (nextDecision === 'reject') {
          setRejectActive(true);
        }
        return;
      }
      setErrorText('');
      submitPayload(
        buildAwaitingSubmitPayload(awaiting, {
          kind: 'plan',
          decision: nextDecision,
          reason: normalizedReason,
          executionAccessLevel,
        })
      );
    },
    [awaiting, disabled, executionAccessLevel, options, submitPayload, t]
  );

  const submitApprove = useCallback(() => {
    submitDecision('approve');
  }, [submitDecision]);

  const activateRejectInput = useCallback(() => {
    if (disabled) {
      return;
    }
    setErrorText('');
    setRejectActive(true);
  }, [disabled]);

  const changeReason = useCallback((text: string) => {
    setErrorText('');
    setRejectActive(true);
    setReason(text);
  }, []);

  const deactivateEmptyRejectInput = useCallback(() => {
    if (!reason.trim()) {
      setRejectActive(false);
    }
  }, [reason]);

  const submitReject = useCallback(() => {
    submitDecision('reject', reason);
  }, [reason, submitDecision]);

  const skipPlan = useCallback(() => {
    submitDecision('reject', t('awaiting.plan.skipReason'));
  }, [submitDecision, t]);

  if (!approveOption && !rejectOption) {
    return null;
  }

  return (
    <>
      <ScrollView className="shrink" contentContainerClassName={PANEL_BODY_CLASS} keyboardShouldPersistTaps="handled">
        {title || executionAccessLevel ? (
          <View className={QUESTION_TEXT_CLASS}>
            {title ? (
              <Text allowFontScaling={false} className={HEADING_CLASS}>
                {title}
              </Text>
            ) : null}
            {prompt ? (
              <Text allowFontScaling={false} className={PROMPT_CLASS}>
                {prompt}
              </Text>
            ) : null}
            {executionAccessLevel ? (
              <Text className={PROMPT_CLASS}>
                {t('awaiting.plan.defaultAccess', { level: t(`awaiting.plan.access.${executionAccessLevel}`) })}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View className={OPTIONS_BLOCK_CLASS}>
          {approveOption ? (
            <ChoiceRow
              disabled={disabled}
              label={approveOption.label}
              description={approveOption.description}
              selected={false}
              value="approve"
              onPress={submitApprove}
            />
          ) : null}
          {rejectOption ? (
            <View className={cn(FREE_TEXT_ROW_CLASS, rejectActive ? SELECTED_OPTION_ROW_CLASS : null)}>
              <Text allowFontScaling={false} className={cn(PLAN_REJECT_LABEL_CLASS, rejectActive ? SELECTED_TEXT_CLASS : null)}>
                {t('awaiting.plan.reject.label')}
              </Text>
              <TextInput
                value={reason}
                editable={!disabled}
                onBlur={deactivateEmptyRejectInput}
                onChangeText={changeReason}
                onFocus={activateRejectInput}
                onSubmitEditing={disabled ? undefined : submitReject}
                placeholder={rejectPlaceholder}
                placeholderTextColor={theme.colors.textTertiary}
                allowFontScaling={false}
                returnKeyType="done"
                className={FREE_TEXT_INPUT_CLASS}
              />
            </View>
          ) : null}
        </View>
      </ScrollView>
      <AwaitingPanelFooter
        awaiting={awaiting}
        disabled={disabled}
        errorText={errorText || submitError}
        primaryLabel={rejectActive ? t('awaiting.submit') : undefined}
        secondaryLabel={rejectOption ? t('awaiting.skip') : undefined}
        submitting={submitting}
        timeoutMs={timeoutMs}
        onPrimary={rejectActive ? submitReject : undefined}
        onSecondary={rejectOption ? skipPlan : undefined}
      />
    </>
  );
}

const SHEET_TITLE_KEYS = {
  question: 'awaiting.question.title',
  approval: 'awaiting.approval.title',
  plan: 'awaiting.plan.title',
  form: 'awaiting.form.title'
} as const;

export const ChatAwaitingDock = memo(function ChatAwaitingDock({ awaiting, visible, onClose, onSubmit }: ChatAwaitingDockProps) {
  const t = useT();
  const isFocused = useIsFocused();
  const interaction = awaiting.interactive;
  const planAgentKey = interaction?.kind === 'plan' ? interaction.agentKey : '';
  const [executionAccessLevel, setExecutionAccessLevel] = useState(() =>
    planAgentKey ? getAgentDefaultAccessLevel(chatSyncService.getAgentDetailSnapshot(planAgentKey)) : undefined
  );
  const planAccessRequest = useRef<Promise<void> | null>(null);
  const requestVersion = useRef(0);
  const mounted = useRef(false);
  const [submitState, setSubmitState] = useState<SubmitState | null>(null);
  const [errorText, setErrorText] = useState('');
  const currentAwaitingIdRef = useRef(awaiting.id);
  const currentAwaitingStatusRef = useRef(awaiting.status);
  const formDisabledRef = useRef(false);
  const currentSubmitState = submitState?.awaitingId === awaiting.id ? submitState : null;
  const submitting = currentSubmitState?.phase === 'submitting';
  const formDisabled = Boolean(currentSubmitState) || awaiting.status !== 'ask';
  currentAwaitingIdRef.current = awaiting.id;
  currentAwaitingStatusRef.current = awaiting.status;
  formDisabledRef.current = formDisabled;

  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refreshPlanAccess = useCallback(async () => {
    if (!planAgentKey || !isFocused || currentAwaitingStatusRef.current !== 'ask' || !mounted.current) return;
    const version = ++requestVersion.current;
    const scope = getChatCacheScopeId();
    const detail = await chatSyncService.ensureAgentDetail(planAgentKey, { refresh: true });
    if (detail && mounted.current && requestVersion.current === version && getChatCacheScopeId() === scope &&
        currentAwaitingStatusRef.current === 'ask') {
      setExecutionAccessLevel(getAgentDefaultAccessLevel(detail));
    }
  }, [isFocused, planAgentKey]);

  useLayoutEffect(() => {
    planAccessRequest.current = refreshPlanAccess();
    return () => { requestVersion.current += 1; };
  }, [refreshPlanAccess]);

  useEffect(() => {
    setSubmitState(null);
    setErrorText('');
  }, [awaiting.id]);

  const submitPayload = useCallback(
    async (payload: AwaitingSubmitPayloadData) => {
      if (formDisabledRef.current) {
        return;
      }
      formDisabledRef.current = true;
      const submittingAwaitingId = awaiting.id;
      setSubmitState({ awaitingId: submittingAwaitingId, phase: 'submitting' });
      setErrorText('');
      try {
        await onSubmit(payload);
        if (!mounted.current || currentAwaitingIdRef.current !== submittingAwaitingId) return;
        Keyboard.dismiss();
        setSubmitState((current) =>
          current?.awaitingId === submittingAwaitingId
            ? { awaitingId: submittingAwaitingId, phase: 'submitted' }
            : current
        );
      } catch (error) {
        const isCurrentAwaiting = () => mounted.current &&
          currentAwaitingIdRef.current === submittingAwaitingId && currentAwaitingStatusRef.current === 'ask';
        if (planAgentKey && isCurrentAwaiting()) {
          const version = requestVersion.current;
          await planAccessRequest.current;
          if (isCurrentAwaiting() && requestVersion.current === version) await refreshPlanAccess();
        }
        if (isCurrentAwaiting()) {
          formDisabledRef.current = false;
          setErrorText(error instanceof Error ? error.message : String(error));
        }
        setSubmitState((current) => (current?.awaitingId === submittingAwaitingId ? null : current));
      } finally {
        setSubmitState((current) =>
          current?.awaitingId === submittingAwaitingId && current.phase === 'submitting' ? null : current
        );
      }
    },
    [awaiting.id, onSubmit, planAgentKey, refreshPlanAccess]
  );

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  if (!interaction) {
    return null;
  }

  const normalizedAwaiting = awaiting as ChatConversationAwaitingState & { interactive: ChatTimelineAwaitingInteractive };
  const closeLabel = t('awaiting.collapse');

  return (
    <ChatComposerSheet visible={visible && isFocused} presentation="contained" closeLabel={closeLabel} onClose={handleClose}>
      <View className={SHEET_HEADER_CLASS}>
        <Text accessibilityRole="header" className={SHEET_TITLE_CLASS}>
          {t(SHEET_TITLE_KEYS[interaction.kind])}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={handleClose} className={SHEET_CLOSE_CLASS}>
          <AppIcon usage="chatSearch.close" size={20} />
        </Pressable>
      </View>
      {interaction.kind === 'question' ? (
        <QuestionPanel
          awaiting={normalizedAwaiting as ChatConversationAwaitingState & { interactive: Extract<ChatTimelineAwaitingInteractive, { kind: 'question' }> }}
          disabled={formDisabled}
          submitting={submitting}
          submitError={errorText}
          submitPayload={submitPayload}
        />
      ) : interaction.kind === 'approval' ? (
        <ApprovalPanel
          awaiting={normalizedAwaiting as ChatConversationAwaitingState & { interactive: Extract<ChatTimelineAwaitingInteractive, { kind: 'approval' }> }}
          disabled={formDisabled}
          submitting={submitting}
          submitError={errorText}
          submitPayload={submitPayload}
        />
      ) : interaction.kind === 'plan' ? (
        <PlanPanel
          awaiting={normalizedAwaiting as ChatConversationAwaitingState & { interactive: Extract<ChatTimelineAwaitingInteractive, { kind: 'plan' }> }}
          disabled={formDisabled}
          executionAccessLevel={executionAccessLevel}
          submitting={submitting}
          submitError={errorText}
          submitPayload={submitPayload}
        />
      ) : (
        <AwaitingFormPanel
          awaiting={normalizedAwaiting as ChatConversationAwaitingState & { interactive: Extract<ChatTimelineAwaitingInteractive, { kind: 'form' }> }}
          disabled={formDisabled}
          submitting={submitting}
          submitError={errorText}
          submitPayload={submitPayload}
        />
      )}
    </ChatComposerSheet>
  );
});
