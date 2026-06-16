import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { AwaitingSubmitPayloadData } from '../../../../core/api/services/chatApi';
import { AppIcon } from '../../../../shared/icons/AppIcon';
import { type TFunction, useT } from '../../../../shared/i18n';
import { useAppTheme, useAppThemeStyles } from '../../../../shared/visual/AppThemeProvider';
import { appVisualTokens, type AppThemeTokens } from '../../../../shared/visual/foundation';
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
  type AwaitingApprovalDraft,
} from './awaitingSubmitState';
import {
  clampAwaitingQuestionIndex,
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
      label: t('awaiting.plan.option.reject'),
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

function PaginationControl({
  current,
  disabled,
  total,
  onMove,
}: {
  current: number;
  disabled: boolean;
  total: number;
  onMove: (nextIndex: number) => void;
}) {
  const t = useT();
  const styles = useAppThemeStyles(createStyles);

  if (total <= 1) {
    return null;
  }

  const canMoveBack = !disabled && current > 0;
  const canMoveForward = !disabled && current < total - 1;

  return (
    <View style={styles.pagination}>
      <Pressable
        accessibilityLabel={t('awaiting.previousQuestion')}
        accessibilityRole="button"
        disabled={!canMoveBack}
        onPress={() => onMove(current - 1)}
        style={({ pressed }) => [
          styles.paginationButton,
          !canMoveBack && styles.disabledButton,
          pressed && canMoveBack && styles.pressed,
        ]}
      >
        <Text allowFontScaling={false} style={[styles.paginationArrow, !canMoveBack && styles.disabledText]}>
          ‹
        </Text>
      </Pressable>
      <Text allowFontScaling={false} style={styles.paginationText}>
        {current + 1} / {total}
      </Text>
      <Pressable
        accessibilityLabel={t('awaiting.nextQuestion')}
        accessibilityRole="button"
        disabled={!canMoveForward}
        onPress={() => onMove(current + 1)}
        style={({ pressed }) => [
          styles.paginationButton,
          !canMoveForward && styles.disabledButton,
          pressed && canMoveForward && styles.pressed,
        ]}
      >
        <Text allowFontScaling={false} style={[styles.paginationArrow, !canMoveForward && styles.disabledText]}>
          ›
        </Text>
      </Pressable>
    </View>
  );
}

const ChoiceRow = memo(function ChoiceRow({
  description,
  disabled,
  index,
  label,
  selected,
  value,
  onPress,
}: {
  description?: string;
  disabled: boolean;
  index: number;
  label: string;
  selected: boolean;
  value: string;
  onPress: (value: string) => void;
}) {
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const handlePress = useCallback(() => onPress(value), [onPress, value]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.optionRow,
        disabled && styles.disabledButton,
        selected && styles.selectedOptionRow,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text allowFontScaling={false} style={styles.optionIndex}>
        {index + 1}.
      </Text>
      <View style={styles.optionText}>
        <Text allowFontScaling={false} style={[styles.optionLabel, selected && styles.selectedText]}>
          {label}
        </Text>
        {description ? (
          <Text allowFontScaling={false} numberOfLines={2} style={styles.optionDescription}>
            {description}
          </Text>
        ) : null}
      </View>
      {selected ? (
        <View style={styles.selectedMark}>
          <AppIcon usage="historyDrawer.markAllRead" size={12} color={theme.colors.onBrandBlueAction} />
        </View>
      ) : null}
    </Pressable>
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
  const styles = useAppThemeStyles(createStyles);
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
      <View style={styles.optionsBlock}>
        {options.map((option, index) => {
          const optionValue = getSelectOptionValue(option);
          return (
            <ChoiceRow
              key={optionValue}
              disabled={disabled}
              index={index}
              label={option.label}
              description={option.description}
              selected={selected.has(optionValue)}
              value={optionValue}
              onPress={handleSelectOptionPress}
            />
          );
        })}
        {question.allowFreeText ? (
          <View style={styles.freeTextRow}>
            <Text allowFontScaling={false} style={styles.optionIndex}>
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
              style={styles.freeTextInput}
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
    <View style={styles.fieldBlock}>
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
        style={styles.inputField}
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
  const styles = useAppThemeStyles(createStyles);
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
    setActiveIndex((index) => clampAwaitingQuestionIndex(index, nextQuestions.length));
  }, [questionsSignature]);

  const moveToIndex = useCallback(
    (nextIndex: number) => {
      if (disabledRef.current) {
        return;
      }
      setErrorText('');
      setActiveIndex(clampAwaitingQuestionIndex(nextIndex, questions.length));
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
      <View style={styles.header}>
        <View style={styles.questionText}>
          <Text allowFontScaling={false} style={styles.heading}>
            {heading}
          </Text>
          {prompt ? (
            <Text allowFontScaling={false} style={styles.prompt}>
              {prompt}
            </Text>
          ) : null}
        </View>
        <View style={styles.headerSide}>
          <PaginationControl current={activeIndex} disabled={disabled} total={questions.length} onMove={moveToIndex} />
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

function ApprovalItem({
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
  const styles = useAppThemeStyles(createStyles);
  const options = useMemo(() => getApprovalOptions(approval, t), [approval, t]);

  return (
    <View style={styles.awaitingCard}>
      <Text allowFontScaling={false} style={styles.itemTitle}>
        {approval.description || approval.command}
      </Text>
      {approval.description && approval.command !== approval.description ? (
        <Text allowFontScaling={false} selectable style={styles.monoPayload}>
          {approval.command}
        </Text>
      ) : null}
      <View style={styles.optionsBlock}>
        {options.map((option, optionIndex) => (
          <ChoiceRow
            key={`${approval.id}:${option.decision}`}
            disabled={disabled}
            index={optionIndex}
            label={option.label || getAwaitingDecisionLabel(option.decision, t)}
            description={option.description}
            selected={decision === option.decision}
            value={option.decision}
            onPress={(value) => onDecision(approval.id, value as ChatTimelineAwaitingApprovalDecision)}
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
          style={styles.inputField}
        />
      ) : null}
      <Text allowFontScaling={false} style={styles.itemIndex}>
        {index + 1}
      </Text>
    </View>
  );
}

function ApprovalPanel({
  awaiting,
  disabled,
  submitting,
  submitPayload,
}: PanelProps<Extract<ChatTimelineAwaitingInteractive, { kind: 'approval' }>>) {
  const t = useT();
  const styles = useAppThemeStyles(createStyles);
  const approvals = awaiting.interactive.approvals;
  const timeoutMs = getAwaitingInteractiveTimeout(awaiting.interactive);
  const [draft, setDraft] = useState<AwaitingApprovalDraft>({ decisions: {}, reasons: {} });
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    setDraft({ decisions: {}, reasons: {} });
    setErrorText('');
  }, [awaiting.id]);

  const setDecision = useCallback((approvalId: string, decision: ChatTimelineAwaitingApprovalDecision) => {
    setErrorText('');
    setDraft((current) => ({
      ...current,
      decisions: { ...current.decisions, [approvalId]: decision },
    }));
  }, []);

  const setReason = useCallback((approvalId: string, reason: string) => {
    setDraft((current) => ({
      ...current,
      reasons: { ...current.reasons, [approvalId]: reason },
    }));
  }, []);

  const submit = useCallback(() => {
    if (approvals.some((approval) => !draft.decisions[approval.id])) {
      setErrorText(t('awaiting.error.approvalRequired'));
      return;
    }
    submitPayload(buildAwaitingSubmitPayload(awaiting, { kind: 'approval', ...draft }));
  }, [approvals, awaiting, draft, submitPayload, t]);

  return (
    <>
      <View style={styles.header}>
        <View style={styles.questionText}>
          <Text allowFontScaling={false} style={styles.heading}>
            {t('awaiting.approval.title')}
          </Text>
          {awaiting.prompt ? (
            <Text allowFontScaling={false} style={styles.prompt}>
              {awaiting.prompt}
            </Text>
          ) : null}
        </View>
      </View>
      <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={styles.panelScroll}>
        <View style={styles.cardList}>
          {approvals.map((approval, index) => (
            <ApprovalItem
              key={approval.id}
              approval={approval}
              decision={draft.decisions[approval.id]}
              disabled={disabled}
              index={index}
              reason={draft.reasons[approval.id] || ''}
              onDecision={setDecision}
              onReason={setReason}
            />
          ))}
        </View>
      </ScrollView>
      <AwaitingPanelFooter
        awaiting={awaiting}
        disabled={disabled}
        errorText={errorText}
        primaryLabel={t('awaiting.submit')}
        submitting={submitting}
        timeoutMs={timeoutMs}
        onPrimary={submit}
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
  const styles = useAppThemeStyles(createStyles);
  const plan = awaiting.interactive.plan;
  const options = useMemo(() => getPlanOptions(plan, t), [plan, t]);
  const timeoutMs = getAwaitingInteractiveTimeout(awaiting.interactive);
  const [decision, setDecision] = useState<ChatTimelineAwaitingPlanDecision | null>(null);
  const [reason, setReason] = useState('');
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    setDecision(null);
    setReason('');
    setErrorText('');
  }, [awaiting.id]);

  const submit = useCallback(() => {
    if (!decision) {
      setErrorText(t('awaiting.error.planRequired'));
      return;
    }
    const selected = options.find((option) => option.decision === decision);
    if (selected?.input?.required && !reason.trim()) {
      setErrorText(t('awaiting.error.reasonRequired'));
      return;
    }
    submitPayload(buildAwaitingSubmitPayload(awaiting, { kind: 'plan', decision, reason }));
  }, [awaiting, decision, options, reason, submitPayload, t]);

  return (
    <>
      <View style={styles.header}>
        <View style={styles.questionText}>
          <Text allowFontScaling={false} style={styles.heading}>
            {plan.title || awaiting.prompt || t('awaiting.plan.title')}
          </Text>
          {awaiting.payloadText ? (
            <Text allowFontScaling={false} numberOfLines={3} style={styles.prompt}>
              {awaiting.payloadText}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.optionsBlock}>
        {options.map((option, index) => (
          <ChoiceRow
            key={`${plan.id}:${option.decision}`}
            disabled={disabled}
            index={index}
            label={option.label}
            description={option.description}
            selected={decision === option.decision}
            value={option.decision}
            onPress={(value) => {
              setErrorText('');
              setDecision(value as ChatTimelineAwaitingPlanDecision);
            }}
          />
        ))}
      </View>
      {decision === 'reject' ? (
        <TextInput
          value={reason}
          editable={!disabled}
          onChangeText={(text) => {
            setErrorText('');
            setReason(text);
          }}
          placeholder={
            options.find((option) => option.decision === decision)?.input?.placeholder || t('awaiting.reason.placeholder')
          }
          placeholderTextColor={theme.colors.textTertiary}
          allowFontScaling={false}
          returnKeyType="done"
          style={styles.inputField}
        />
      ) : null}
      <AwaitingPanelFooter
        awaiting={awaiting}
        disabled={disabled}
        errorText={errorText}
        primaryLabel={t('awaiting.submit')}
        submitting={submitting}
        timeoutMs={timeoutMs}
        onPrimary={submit}
      />
    </>
  );
}

export const ChatAwaitingDock = memo(function ChatAwaitingDock({ awaiting, onSubmit }: ChatAwaitingDockProps) {
  const styles = useAppThemeStyles(createStyles);
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
    <View style={styles.dockWrap}>
      <View style={styles.panel}>
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
          <Text allowFontScaling={false} numberOfLines={1} style={styles.outerErrorText}>
            {errorText}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

function createStyles(theme: AppThemeTokens) {
  return StyleSheet.create({
    dockWrap: {
      backgroundColor: theme.colors.background,
      paddingHorizontal: appVisualTokens.spacing.md,
      paddingTop: 4,
      paddingBottom: 6,
    },
    panel: {
      gap: appVisualTokens.spacing.md,
      borderRadius: appVisualTokens.radii.lg,
      borderWidth: 1,
      borderColor: theme.colors.lineStrong,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: appVisualTokens.spacing.lg,
      paddingTop: appVisualTokens.spacing.lg,
      paddingBottom: appVisualTokens.spacing.md,
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 16,
      elevation: 2,
    },
    header: {
      minHeight: 32,
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: appVisualTokens.spacing.md,
    },
    questionText: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    heading: {
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    prompt: {
      fontSize: 12,
      lineHeight: 17,
      color: theme.colors.textSecondary,
    },
    headerSide: {
      flexShrink: 0,
      alignItems: 'flex-end',
      gap: 4,
    },
    panelScroll: {
      maxHeight: 240,
    },
    cardList: {
      gap: appVisualTokens.spacing.sm,
    },
    awaitingCard: {
      position: 'relative',
      gap: appVisualTokens.spacing.sm,
      borderRadius: appVisualTokens.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.background,
      padding: appVisualTokens.spacing.md,
    },
    itemTitle: {
      paddingRight: 22,
      fontSize: 14,
      lineHeight: 19,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    itemIndex: {
      position: 'absolute',
      top: 10,
      right: 10,
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '800',
      color: theme.colors.textTertiary,
    },
    monoPayload: {
      borderRadius: appVisualTokens.radii.sm,
      backgroundColor: theme.colors.surfaceMuted,
      paddingHorizontal: 8,
      paddingVertical: 7,
      fontSize: 12,
      lineHeight: 17,
      color: theme.colors.textSecondary,
    },
    pagination: {
      height: 28,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    paginationButton: {
      width: 28,
      height: 28,
      borderRadius: appVisualTokens.radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    paginationArrow: {
      fontSize: 26,
      lineHeight: 28,
      color: theme.colors.textPrimary,
    },
    paginationText: {
      minWidth: 34,
      textAlign: 'center',
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    optionsBlock: {
      gap: appVisualTokens.spacing.sm,
    },
    optionRow: {
      minHeight: 40,
      flexDirection: 'row',
      alignItems: 'center',
      gap: appVisualTokens.spacing.sm,
      borderRadius: appVisualTokens.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.background,
      paddingHorizontal: appVisualTokens.spacing.md,
      paddingVertical: 9,
    },
    selectedOptionRow: {
      borderColor: theme.colors.brandBlue,
      backgroundColor: theme.colors.brandBlueSoft,
    },
    optionIndex: {
      width: 22,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '800',
      color: theme.colors.textSecondary,
    },
    optionText: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    optionLabel: {
      fontSize: 14,
      lineHeight: 19,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    optionDescription: {
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.textSecondary,
    },
    selectedText: {
      color: theme.colors.brandBlueStrong,
    },
    selectedMark: {
      width: 18,
      height: 18,
      borderRadius: appVisualTokens.radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.brandBlue,
    },
    freeTextRow: {
      minHeight: 40,
      flexDirection: 'row',
      alignItems: 'center',
      gap: appVisualTokens.spacing.sm,
      borderRadius: appVisualTokens.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.line,
      paddingHorizontal: appVisualTokens.spacing.md,
      paddingVertical: 4,
    },
    freeTextInput: {
      flex: 1,
      minHeight: 36,
      minWidth: 0,
      fontSize: 14,
      lineHeight: 19,
      color: theme.colors.textPrimary,
    },
    fieldBlock: {
      minHeight: 46,
      justifyContent: 'center',
    },
    inputField: {
      minHeight: 44,
      borderRadius: appVisualTokens.radii.sm,
      borderWidth: 1.5,
      borderColor: theme.colors.brandBlue,
      paddingHorizontal: appVisualTokens.spacing.md,
      paddingVertical: 8,
      fontSize: 15,
      lineHeight: 20,
      color: theme.colors.textPrimary,
    },
    outerErrorText: {
      marginTop: -2,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
      color: theme.colors.danger,
    },
    disabledButton: {
      opacity: 0.38,
    },
    disabledText: {
      color: theme.colors.textTertiary,
    },
    pressed: {
      opacity: 0.72,
    },
  });
}
