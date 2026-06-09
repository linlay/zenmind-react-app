import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { AwaitingSubmitPayloadData } from '../../../../core/api/services/chatApi';
import { AppIcon } from '../../../../shared/icons/AppIcon';
import { type TFunction, useT } from '../../../../shared/i18n';
import { appVisualTokens } from '../../../../shared/visual/foundation';
import type { ChatConversationAwaitingState } from '../../../chatRealtime/types';
import type { ChatTimelineAwaitingQuestion } from '../../../chatTimeline/index.ts';
import {
  buildQuestionSubmitPayload,
  clampAwaitingQuestionIndex,
  createAwaitingQuestionDrafts,
  findAwaitingAnswerError,
  getAwaitingAnswerError,
  getAwaitingDateFormat,
  getAwaitingQuestionHeading,
  getAwaitingQuestionPlaceholder,
  getAwaitingQuestionPrompt,
  getAwaitingQuestionsSignature,
  getSelectFreeTextAnswer,
  getSelectOptionValue,
  getSelectOptions,
  getSelectedOptionAnswers,
  hasAwaitingQuestions,
  isSelectQuestionType,
  reconcileAwaitingQuestionDrafts,
  setFreeTextAnswer,
  shouldAutoAdvanceAwaitingQuestion,
  toggleSelectAnswer,
  type AwaitingQuestionDraft
} from './awaitingQuestionState';

type ChatAwaitingDockProps = {
  awaiting: ChatConversationAwaitingState;
  onSubmit: (payload: AwaitingSubmitPayloadData) => Promise<unknown>;
};

const COUNTDOWN_TICK_MS = 1000;

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getCountdownLabel(awaiting: ChatConversationAwaitingState, now: number, t: TFunction): string {
  const timeout = awaiting.interactive?.kind === 'question' ? awaiting.interactive.timeout : null;
  if (!timeout || !awaiting.createdAt) {
    return '';
  }

  const remaining = awaiting.createdAt + timeout - now;
  return remaining > 0 ? t('awaiting.countdown', { duration: formatDuration(remaining) }) : t('awaiting.countdownZero');
}

function useCountdownLabel(awaiting: ChatConversationAwaitingState): string {
  const t = useT();
  const [now, setNow] = useState(Date.now());
  const timeout = awaiting.interactive?.kind === 'question' ? awaiting.interactive.timeout : null;

  useEffect(() => {
    if (!timeout) {
      return undefined;
    }

    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), COUNTDOWN_TICK_MS);
    return () => clearInterval(timer);
  }, [awaiting.id, timeout]);

  return getCountdownLabel(awaiting, now, t);
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
  total,
  onMove
}: {
  current: number;
  total: number;
  onMove: (nextIndex: number) => void;
}) {
  const t = useT();

  if (total <= 1) {
    return null;
  }

  const canMoveBack = current > 0;
  const canMoveForward = current < total - 1;

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
          pressed && canMoveBack && styles.pressed
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
          pressed && canMoveForward && styles.pressed
        ]}
      >
        <Text allowFontScaling={false} style={[styles.paginationArrow, !canMoveForward && styles.disabledText]}>
          ›
        </Text>
      </Pressable>
    </View>
  );
}

const OptionRow = memo(function OptionRow({
  index,
  label,
  selected,
  onPress
}: {
  index: number;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.optionRow, pressed && styles.pressed]}
    >
      <Text allowFontScaling={false} style={styles.optionIndex}>
        {index + 1}.
      </Text>
      <Text allowFontScaling={false} style={[styles.optionLabel, selected && styles.selectedText]}>
        {label}
      </Text>
      {selected ? (
        <View style={styles.selectedMark}>
          <AppIcon usage="historyDrawer.markAllRead" size={12} color={appVisualTokens.colors.surface} />
        </View>
      ) : null}
    </Pressable>
  );
});

function QuestionInput({
  question,
  value,
  onChange,
  onChangeAndAdvance,
  onSubmitCurrent
}: {
  question: ChatTimelineAwaitingQuestion;
  value: AwaitingQuestionDraft | undefined;
  onChange: (draft: AwaitingQuestionDraft) => void;
  onChangeAndAdvance: (draft: AwaitingQuestionDraft) => void;
  onSubmitCurrent: () => void;
}) {
  const placeholder = getAwaitingQuestionPlaceholder(question);

  if (isSelectQuestionType(question)) {
    const options = getSelectOptions(question);
    const selected = new Set(getSelectedOptionAnswers(question, value));
    const freeTextAnswer = getSelectFreeTextAnswer(question, value);

    return (
      <View style={styles.optionsBlock}>
        {options.map((option, index) => {
          const optionValue = getSelectOptionValue(option);
          return (
            <OptionRow
              key={optionValue}
              index={index}
              label={option.label}
              selected={selected.has(optionValue)}
              onPress={() => {
                const nextDraft = toggleSelectAnswer(question, value, optionValue);
                if (shouldAutoAdvanceAwaitingQuestion(question)) {
                  onChangeAndAdvance(nextDraft);
                  return;
                }
                onChange(nextDraft);
              }}
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
              onChangeText={(text) => onChange(setFreeTextAnswer(question, value, text))}
              onSubmitEditing={onSubmitCurrent}
              placeholder={placeholder}
              placeholderTextColor={appVisualTokens.colors.textTertiary}
              allowFontScaling={false}
              returnKeyType="done"
              style={styles.freeTextInput}
            />
          </View>
        ) : null}
      </View>
    );
  }

  const textValue =
    typeof value?.answer === 'number' ? String(value.answer) : typeof value?.answer === 'string' ? value.answer : '';
  const keyboardType = question.type === 'number' ? 'decimal-pad' : 'default';
  const secureTextEntry = question.type === 'password';
  const inputPlaceholder =
    placeholder || (question.type === 'date' || question.type === 'datetime' ? getAwaitingDateFormat(question) : '');

  return (
    <View style={styles.fieldBlock}>
      <TextInput
        value={textValue}
        onChangeText={(text) => onChange({ id: question.id, answer: text })}
        onSubmitEditing={onSubmitCurrent}
        placeholder={inputPlaceholder}
        placeholderTextColor={appVisualTokens.colors.textTertiary}
        allowFontScaling={false}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        returnKeyType="done"
        style={styles.inputField}
      />
    </View>
  );
}

export const ChatAwaitingDock = memo(function ChatAwaitingDock({ awaiting, onSubmit }: ChatAwaitingDockProps) {
  const t = useT();
  const interactive = awaiting.interactive?.kind === 'question' ? awaiting.interactive : null;
  const questions = useMemo(() => interactive?.questions || [], [interactive]);
  const questionsRef = useRef(questions);
  const questionsSignature = useMemo(() => getAwaitingQuestionsSignature(questions), [questions]);
  const countdownLabel = useCountdownLabel(awaiting);
  const [activeIndex, setActiveIndex] = useState(0);
  const [values, setValues] = useState<AwaitingQuestionDraft[]>(() => createAwaitingQuestionDrafts(questions));
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');
  const ready = hasAwaitingQuestions(questions);
  const currentQuestion = questions[activeIndex];
  const currentValue = values[activeIndex];
  const isLastQuestion = activeIndex >= questions.length - 1;

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  useEffect(() => {
    setActiveIndex(0);
    setValues(createAwaitingQuestionDrafts(questionsRef.current));
    setSubmitting(false);
    setErrorText('');
  }, [awaiting.id]);

  useEffect(() => {
    const nextQuestions = questionsRef.current;
    setValues((current) => reconcileAwaitingQuestionDrafts(nextQuestions, current));
    setActiveIndex((index) => clampAwaitingQuestionIndex(index, nextQuestions.length));
  }, [questionsSignature]);

  useEffect(() => {
    setActiveIndex((index) => clampAwaitingQuestionIndex(index, questions.length));
  }, [questions.length]);

  const moveToIndex = useCallback(
    (nextIndex: number) => {
      setErrorText('');
      setActiveIndex(clampAwaitingQuestionIndex(nextIndex, questions.length));
    },
    [questions.length]
  );

  const patchCurrentValue = useCallback(
    (draft: AwaitingQuestionDraft) => {
      setErrorText('');
      setValues((current) => patchDraftAt(current, activeIndex, draft));
    },
    [activeIndex]
  );

  const patchCurrentValues = useCallback(
    (draft: AwaitingQuestionDraft) => patchDraftAt(values, activeIndex, draft),
    [activeIndex, values]
  );

  const submitPayload = useCallback(
    async (payload: AwaitingSubmitPayloadData) => {
      if (submitting) {
        return;
      }
      setSubmitting(true);
      setErrorText('');
      try {
        await onSubmit(payload);
        Keyboard.dismiss();
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : String(error));
      } finally {
        setSubmitting(false);
      }
    },
    [onSubmit, submitting]
  );

  const submitAllWithValues = useCallback(
    (nextValues: readonly AwaitingQuestionDraft[]) => {
      const error = findAwaitingAnswerError(questions, nextValues, t);
      if (error) {
        setActiveIndex(error.index);
        setErrorText(error.message);
        return;
      }

      void submitPayload(
        buildQuestionSubmitPayload({
          runId: awaiting.runId,
          awaitingId: awaiting.awaitingId,
          questions,
          values: nextValues
        })
      );
    },
    [awaiting.awaitingId, awaiting.runId, questions, submitPayload, t]
  );

  const submitAll = useCallback(() => {
    submitAllWithValues(values);
  }, [submitAllWithValues, values]);

  const patchCurrentValueAndAdvance = useCallback(
    (draft: AwaitingQuestionDraft) => {
      if (!currentQuestion) {
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
    if (!currentQuestion) {
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

  const ignoreAwaiting = useCallback(() => {
    void submitPayload({
      runId: awaiting.runId,
      awaitingId: awaiting.awaitingId,
      params: []
    });
  }, [awaiting.awaitingId, awaiting.runId, submitPayload]);

  if (!ready || !currentQuestion) {
    return null;
  }

  const heading = getAwaitingQuestionHeading(currentQuestion);
  const prompt = getAwaitingQuestionPrompt(currentQuestion);

  return (
    <View style={styles.dockWrap}>
      <View style={styles.panel}>
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
            {countdownLabel ? (
              <Text allowFontScaling={false} numberOfLines={1} style={styles.countdown}>
                {countdownLabel}
              </Text>
            ) : null}
            <PaginationControl current={activeIndex} total={questions.length} onMove={moveToIndex} />
          </View>
        </View>

        <QuestionInput
          question={currentQuestion}
          value={currentValue}
          onChange={patchCurrentValue}
          onChangeAndAdvance={patchCurrentValueAndAdvance}
          onSubmitCurrent={submitCurrentOrMove}
        />

        <View style={styles.footer}>
          {errorText ? (
            <Text allowFontScaling={false} numberOfLines={1} style={styles.errorText}>
              {errorText}
            </Text>
          ) : (
            <View style={styles.errorSpacer} />
          )}
          <View style={styles.actions}>
            <Pressable
              accessibilityLabel={t('awaiting.ignore')}
              accessibilityRole="button"
              disabled={submitting}
              onPress={ignoreAwaiting}
              style={({ pressed }) => [styles.ignoreButton, pressed && styles.pressed]}
            >
              <Text allowFontScaling={false} style={styles.ignoreText}>
                {t('awaiting.ignore')}
              </Text>
              <View style={styles.keycap}>
                <Text allowFontScaling={false} style={styles.keycapText}>
                  ESC
                </Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityLabel={isLastQuestion ? t('awaiting.submitAnswer') : t('awaiting.continue')}
              accessibilityRole="button"
              disabled={submitting}
              onPress={submitCurrentOrMove}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={appVisualTokens.colors.surface} />
              ) : (
                <Text allowFontScaling={false} style={styles.primaryText}>
                  {isLastQuestion ? t('awaiting.submit') : t('awaiting.continue')}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  dockWrap: {
    backgroundColor: appVisualTokens.colors.background,
    paddingHorizontal: appVisualTokens.spacing.md,
    paddingTop: 4,
    paddingBottom: 6
  },
  panel: {
    gap: appVisualTokens.spacing.md,
    borderRadius: appVisualTokens.radii.lg,
    borderWidth: 1,
    borderColor: appVisualTokens.colors.lineStrong,
    backgroundColor: appVisualTokens.colors.surface,
    paddingHorizontal: appVisualTokens.spacing.lg,
    paddingTop: appVisualTokens.spacing.lg,
    paddingBottom: appVisualTokens.spacing.md,
    shadowColor: appVisualTokens.colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 2
  },
  header: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: appVisualTokens.spacing.md
  },
  questionText: {
    flex: 1,
    minWidth: 0,
    gap: 4
  },
  heading: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
    color: appVisualTokens.colors.textPrimary
  },
  prompt: {
    fontSize: 12,
    lineHeight: 17,
    color: appVisualTokens.colors.textSecondary
  },
  headerSide: {
    flexShrink: 0,
    alignItems: 'flex-end',
    gap: 4
  },
  countdown: {
    maxWidth: 128,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: appVisualTokens.colors.textSecondary
  },
  pagination: {
    height: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  paginationButton: {
    width: 28,
    height: 28,
    borderRadius: appVisualTokens.radii.sm,
    alignItems: 'center',
    justifyContent: 'center'
  },
  paginationArrow: {
    fontSize: 26,
    lineHeight: 28,
    color: appVisualTokens.colors.textPrimary
  },
  paginationText: {
    minWidth: 34,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: appVisualTokens.colors.textPrimary
  },
  optionsBlock: {
    gap: appVisualTokens.spacing.sm
  },
  optionRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: appVisualTokens.spacing.sm
  },
  optionIndex: {
    width: 24,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: appVisualTokens.colors.textSecondary
  },
  optionLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
    color: appVisualTokens.colors.textPrimary
  },
  selectedText: {
    color: appVisualTokens.colors.brandBlueStrong
  },
  selectedMark: {
    width: 20,
    height: 20,
    borderRadius: appVisualTokens.radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: appVisualTokens.colors.brandBlue
  },
  freeTextRow: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: appVisualTokens.spacing.sm
  },
  freeTextInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 4,
    fontSize: 15,
    lineHeight: 20,
    color: appVisualTokens.colors.textPrimary
  },
  fieldBlock: {
    minHeight: 46,
    justifyContent: 'center'
  },
  inputField: {
    minHeight: 44,
    borderRadius: appVisualTokens.radii.sm,
    borderWidth: 1.5,
    borderColor: appVisualTokens.colors.brandBlue,
    paddingHorizontal: appVisualTokens.spacing.md,
    paddingVertical: 8,
    fontSize: 15,
    lineHeight: 20,
    color: appVisualTokens.colors.textPrimary
  },
  footer: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: appVisualTokens.spacing.sm
  },
  errorText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    color: appVisualTokens.colors.danger
  },
  errorSpacer: {
    flex: 1
  },
  actions: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: appVisualTokens.spacing.sm
  },
  ignoreButton: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: appVisualTokens.radii.pill,
    paddingLeft: 4
  },
  ignoreText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: appVisualTokens.colors.textSecondary
  },
  keycap: {
    minWidth: 42,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: appVisualTokens.radii.pill,
    backgroundColor: appVisualTokens.colors.brandBlueSoft,
    paddingHorizontal: appVisualTokens.spacing.sm
  },
  keycapText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: appVisualTokens.colors.textPrimary
  },
  primaryButton: {
    minWidth: 58,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: appVisualTokens.radii.pill,
    backgroundColor: appVisualTokens.colors.brandBlue,
    paddingHorizontal: appVisualTokens.spacing.md
  },
  primaryText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '800',
    color: appVisualTokens.colors.surface
  },
  disabledButton: {
    opacity: 0.38
  },
  disabledText: {
    color: appVisualTokens.colors.textTertiary
  },
  pressed: {
    opacity: 0.68
  },
  primaryPressed: {
    opacity: 0.82
  }
});
