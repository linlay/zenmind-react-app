import { memo } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { useAppTheme, useAppThemeStyles } from '../../../../shared/visual/AppThemeProvider';
import { appVisualTokens, type AppThemeTokens } from '../../../../shared/visual/foundation';
import type { ChatTimelineAwaitingQuestion } from '../../../chatTimeline/index.ts';
import {
  getAwaitingDateFormat,
  getAwaitingQuestionPlaceholder,
  type AwaitingQuestionDraft
} from './awaitingQuestionState';

type AwaitingDateTimeInputProps = {
  disabled: boolean;
  question: ChatTimelineAwaitingQuestion;
  value: AwaitingQuestionDraft | undefined;
  onChange: (draft: AwaitingQuestionDraft) => void;
  onSubmitCurrent: () => void;
};

function getAnswerText(value: AwaitingQuestionDraft | undefined): string {
  return typeof value?.answer === 'string'
    ? value.answer
    : typeof value?.answer === 'number'
      ? String(value.answer)
      : '';
}

export const AwaitingDateTimeInput = memo(function AwaitingDateTimeInput({
  disabled,
  question,
  value,
  onChange,
  onSubmitCurrent
}: AwaitingDateTimeInputProps) {
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const answerText = getAnswerText(value);
  const placeholder = getAwaitingQuestionPlaceholder(question) || getAwaitingDateFormat(question);

  return (
    <View style={styles.fieldBlock}>
      <TextInput
        value={answerText}
        editable={!disabled}
        onChangeText={(text) => onChange({ id: question.id, answer: text })}
        onSubmitEditing={disabled ? undefined : onSubmitCurrent}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textTertiary}
        allowFontScaling={false}
        returnKeyType="done"
        style={styles.inputField}
      />
    </View>
  );
});

function createStyles(theme: AppThemeTokens) {
  return StyleSheet.create({
    fieldBlock: {
      minHeight: 46,
      justifyContent: 'center'
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
      color: theme.colors.textPrimary
    }
  });
}
