import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';

import type { AwaitingSubmitPayloadData } from '../../../../core/api/services/chatApi';
import { useConversationPreviewActions } from '../../../../shared/components/conversationPreview/ConversationPreviewProvider';
import { AppIcon } from '../../../../shared/icons/AppIcon';
import { type TFunction, useT } from '../../../../shared/i18n';
import { useAppTheme } from '../../../../shared/visual/AppThemeProvider';
import { cn } from '../../../../shared/visual/className';
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
  submitPayload: (payload: AwaitingSubmitPayloadData) => void;
};
const DOCK_WRAP_CLASS = 'bg-app-background px-app-md pb-[6px] pt-1';
const PANEL_CLASS =
  'gap-app-md rounded-app-lg border border-app-line-strong bg-app-surface px-app-lg pb-app-md pt-app-lg';
const HEADER_CLASS = 'min-h-8 flex-row items-start justify-between gap-app-md';
const QUESTION_TEXT_CLASS = 'min-w-0 flex-1 gap-1';
const HEADING_CLASS = 'text-[15px] font-extrabold leading-[21px] text-app-primary';
const PROMPT_CLASS = 'text-[12px] leading-[17px] text-app-secondary';
const HEADER_SIDE_CLASS = 'shrink-0 items-end gap-1';
const AWAITING_CARD_CLASS = 'relative gap-app-sm rounded-app-md border border-app-line bg-app-background p-app-md';
const ITEM_TITLE_CLASS = 'pr-[22px] text-[14px] font-extrabold leading-[19px] text-app-primary';
const ITEM_INDEX_CLASS = 'absolute right-[10px] top-[10px] text-[11px] font-extrabold leading-[14px] text-app-tertiary';
const MONO_PAYLOAD_CLASS =
  'rounded-app-sm bg-app-surface-muted px-2 py-[7px] text-[12px] leading-[17px] text-app-secondary';
const PAGINATION_CLASS = 'h-[28px] flex-row items-center gap-[5px]';
const PAGINATION_BUTTON_CLASS = 'h-[28px] w-[28px] items-center justify-center rounded-app-sm active:opacity-[0.72]';
const PAGINATION_ARROW_CLASS = 'text-[26px] leading-[28px] text-app-primary';
const PAGINATION_TEXT_CLASS = 'min-w-[34px] text-center text-[13px] font-extrabold leading-[18px] text-app-primary';
const OPTIONS_BLOCK_CLASS = 'gap-app-sm';
const OPTION_ROW_CLASS =
  'min-h-10 flex-row items-center rounded-app-md border border-app-line bg-app-background';
const OPTION_SELECT_ACTION_CLASS =
  'min-h-10 min-w-0 flex-1 flex-row items-center gap-app-sm px-app-md py-[9px] active:opacity-[0.72]';
const OPTION_PREVIEW_ACTION_CLASS =
  'mr-1 h-9 w-9 shrink-0 items-center justify-center rounded-app-sm active:bg-app-surface-muted';
const SELECTED_OPTION_ROW_CLASS = 'border-app-brand-blue bg-app-brand-blue-soft';
const OPTION_INDEX_CLASS = 'w-[22px] text-[13px] font-extrabold leading-[18px] text-app-secondary';
const OPTION_TEXT_CLASS = 'min-w-0 flex-1 gap-[2px]';
const OPTION_LABEL_CLASS = 'text-[14px] font-bold leading-[19px] text-app-primary';
const OPTION_DESCRIPTION_CLASS = 'text-[12px] leading-4 text-app-secondary';
const SELECTED_TEXT_CLASS = 'text-app-brand-blue-strong';
const SELECTED_MARK_CLASS = 'h-[18px] w-[18px] items-center justify-center rounded-app-pill bg-app-brand-blue';
const FREE_TEXT_ROW_CLASS =
  'min-h-10 flex-row items-center gap-app-sm rounded-app-md border border-app-line px-app-md py-1';
const FREE_TEXT_INPUT_CLASS = 'min-h-9 min-w-0 flex-1 text-[14px] leading-[19px] text-app-primary';
const PLAN_REJECT_LABEL_CLASS = 'shrink-0 text-[14px] font-bold leading-[19px] text-app-primary';
const FIELD_BLOCK_CLASS = 'min-h-[46px] justify-center';
const INPUT_FIELD_CLASS =
  'min-h-[44px] rounded-app-sm border-[1.5px] border-app-brand-blue px-app-md py-2 text-[15px] leading-5 text-app-primary';
const OUTER_ERROR_TEXT_CLASS = '-mt-[2px] text-[12px] font-bold leading-4 text-app-danger';
const DISABLED_BUTTON_CLASS = 'opacity-[0.38]';
const DISABLED_TEXT_CLASS = 'text-app-tertiary';
const PANEL_ELEVATION_STYLE = {
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 2,
} satisfies ViewStyle;

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
  index,
  label,
  previewHtml,
  selected,
  value,
  onPress,
}: {
  description?: string;
  disabled: boolean;
  index: number;
  label: string;
  previewHtml?: string;
  selected: boolean;
  value: string;
  onPress: (value: string) => void;
}) {
  const { theme } = useAppTheme();
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
        <Text allowFontScaling={false} className={OPTION_INDEX_CLASS}>
          {index + 1}.
        </Text>
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
            <AppIcon usage="historyDrawer.markAllRead" size={12} color={theme.colors.onBrandBlueAction} />
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
        {options.map((option, index) => {
          const optionValue = getSelectOptionValue(option);
          return (
            <ChoiceRow
              key={optionValue}
              disabled={disabled}
              index={index}
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
            <Text allowFontScaling={false} className={OPTION_INDEX_CLASS}>
              {options.length + 1}.
            </Text>
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
      <AwaitingPanelFooter
        awaiting={awaiting}
        disabled={disabled}
        errorText={errorText}
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
  index,
  reason,
  onDecision,
  onReason,
}: {
  approval: ChatTimelineAwaitingApproval;
  decision?: ChatTimelineAwaitingApprovalDecision;
  disabled: boolean;
  index: number;
  reason: string;
  onDecision: (approvalId: string, decision: ChatTimelineAwaitingApprovalDecision) => void;
  onReason: (approvalId: string, reason: string) => void;
}) {
  const { theme } = useAppTheme();
  const t = useT();
  const options = useMemo(() => getApprovalOptions(approval, t), [approval, t]);
  const handleDecisionPress = useCallback(
    (value: string) => onDecision(approval.id, value as ChatTimelineAwaitingApprovalDecision),
    [approval.id, onDecision]
  );

  return (
    <View className={AWAITING_CARD_CLASS}>
      <Text allowFontScaling={false} className={ITEM_TITLE_CLASS}>
        {approval.description || approval.command}
      </Text>
      {approval.description && approval.command !== approval.description ? (
        <Text allowFontScaling={false} selectable className={MONO_PAYLOAD_CLASS}>
          {approval.command}
        </Text>
      ) : null}
      <View className={OPTIONS_BLOCK_CLASS}>
        {options.map((option, optionIndex) => (
          <ChoiceRow
            key={`${approval.id}:${option.decision}`}
            disabled={disabled}
            index={optionIndex}
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
      <Text allowFontScaling={false} className={ITEM_INDEX_CLASS}>
        {index + 1}
      </Text>
    </View>
  );
});

function ApprovalPanel({
  awaiting,
  disabled,
  submitting,
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
      <View className={HEADER_CLASS}>
        <View className={QUESTION_TEXT_CLASS}>
          <Text allowFontScaling={false} className={HEADING_CLASS}>
            {t('awaiting.approval.title')}
          </Text>
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
      <ApprovalItem
        key={currentApproval.id}
        approval={currentApproval}
        decision={draft.decisions[currentApproval.id]}
        disabled={disabled}
        index={activeIndex}
        reason={draft.reasons[currentApproval.id] || ''}
        onDecision={setDecision}
        onReason={setReason}
      />
      <AwaitingPanelFooter
        awaiting={awaiting}
        disabled={disabled}
        errorText={errorText}
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
  submitting,
  submitPayload,
}: PanelProps<Extract<ChatTimelineAwaitingInteractive, { kind: 'plan' }>>) {
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
  const title = plan.title || awaiting.prompt || t('awaiting.plan.title');
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
        })
      );
    },
    [awaiting, disabled, options, submitPayload, t]
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
      <View className={HEADER_CLASS}>
        <View className={QUESTION_TEXT_CLASS}>
          <Text allowFontScaling={false} className={HEADING_CLASS}>
            {title}
          </Text>
          {prompt ? (
            <Text allowFontScaling={false} numberOfLines={2} className={PROMPT_CLASS}>
              {prompt}
            </Text>
          ) : null}
        </View>
      </View>
      <View className={OPTIONS_BLOCK_CLASS}>
        {approveOption ? (
          <ChoiceRow
            disabled={disabled}
            index={0}
            label={approveOption.label}
            description={approveOption.description}
            selected={false}
            value="approve"
            onPress={submitApprove}
          />
        ) : null}
        {rejectOption ? (
          <View className={cn(FREE_TEXT_ROW_CLASS, rejectActive ? SELECTED_OPTION_ROW_CLASS : null)}>
            <Text allowFontScaling={false} className={OPTION_INDEX_CLASS}>
              {(approveOption ? 2 : 1).toString()}.
            </Text>
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
      <AwaitingPanelFooter
        awaiting={awaiting}
        disabled={disabled}
        errorText={errorText}
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

export const ChatAwaitingDock = memo(function ChatAwaitingDock({ awaiting, onSubmit }: ChatAwaitingDockProps) {
  const { theme } = useAppTheme();
  const interaction = awaiting.interactive;
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
        Keyboard.dismiss();
        setSubmitState((current) =>
          current?.awaitingId === submittingAwaitingId
            ? { awaitingId: submittingAwaitingId, phase: 'submitted' }
            : current
        );
      } catch (error) {
        const isCurrentAwaiting =
          currentAwaitingIdRef.current === submittingAwaitingId && currentAwaitingStatusRef.current === 'ask';
        if (isCurrentAwaiting) {
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
    [awaiting.id, onSubmit]
  );

  if (!interaction) {
    return null;
  }

  const normalizedAwaiting = awaiting as ChatConversationAwaitingState & { interactive: ChatTimelineAwaitingInteractive };

  return (
    <View className={DOCK_WRAP_CLASS}>
      <View className={PANEL_CLASS} style={[PANEL_ELEVATION_STYLE, { shadowColor: theme.colors.shadow }]}>
        {interaction.kind === 'question' ? (
          <QuestionPanel
            awaiting={normalizedAwaiting as ChatConversationAwaitingState & { interactive: Extract<ChatTimelineAwaitingInteractive, { kind: 'question' }> }}
            disabled={formDisabled}
            submitting={submitting}
            submitPayload={submitPayload}
          />
        ) : interaction.kind === 'approval' ? (
          <ApprovalPanel
            awaiting={normalizedAwaiting as ChatConversationAwaitingState & { interactive: Extract<ChatTimelineAwaitingInteractive, { kind: 'approval' }> }}
            disabled={formDisabled}
            submitting={submitting}
            submitPayload={submitPayload}
          />
        ) : interaction.kind === 'plan' ? (
          <PlanPanel
            awaiting={normalizedAwaiting as ChatConversationAwaitingState & { interactive: Extract<ChatTimelineAwaitingInteractive, { kind: 'plan' }> }}
            disabled={formDisabled}
            submitting={submitting}
            submitPayload={submitPayload}
          />
        ) : (
          <AwaitingFormPanel
            awaiting={normalizedAwaiting as ChatConversationAwaitingState & { interactive: Extract<ChatTimelineAwaitingInteractive, { kind: 'form' }> }}
            disabled={formDisabled}
            submitting={submitting}
            submitPayload={submitPayload}
          />
        )}
        {errorText ? (
          <Text allowFontScaling={false} numberOfLines={1} className={OUTER_ERROR_TEXT_CLASS}>
            {errorText}
          </Text>
        ) : null}
      </View>
    </View>
  );
});
