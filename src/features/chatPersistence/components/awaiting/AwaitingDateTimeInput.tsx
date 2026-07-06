import { memo } from 'react';
import { TextInput, View } from 'react-native';

import { useAppTheme } from '../../../../shared/visual/AppThemeProvider';
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
const FIELD_BLOCK_CLASS = 'min-h-[46px] justify-center';
const INPUT_FIELD_CLASS =
  'min-h-[44px] rounded-app-sm border-[1.5px] border-app-brand-blue px-app-md py-2 text-[15px] leading-5 text-app-primary';

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
  const answerText = getAnswerText(value);
  const placeholder = getAwaitingQuestionPlaceholder(question) || getAwaitingDateFormat(question);

  return (
    <View className={FIELD_BLOCK_CLASS}>
      <TextInput
        value={answerText}
        editable={!disabled}
        onChangeText={(text) => onChange({ id: question.id, answer: text })}
        onSubmitEditing={disabled ? undefined : onSubmitCurrent}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textTertiary}
        allowFontScaling={false}
        returnKeyType="done"
        className={INPUT_FIELD_CLASS}
      />
    </View>
  );
});
