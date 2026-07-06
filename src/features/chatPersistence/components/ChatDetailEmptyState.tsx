import { Pressable, Text, View } from 'react-native';

import { useT } from '../../../shared/i18n';

const EMPTY_STATE_CLASS = 'flex-1 items-center justify-center gap-app-sm bg-app-background px-[28px]';
const EMPTY_STATE_TITLE_CLASS = 'text-app-title-lg font-bold text-app-primary';
const EMPTY_STATE_BODY_CLASS = 'text-center text-app-body text-app-secondary';
const EMPTY_STATE_BUTTON_CLASS = 'mt-app-sm rounded-app-lg bg-app-action px-[18px] py-[14px] active:opacity-[0.72]';
const EMPTY_STATE_BUTTON_TEXT_CLASS = 'text-app-body-sm font-bold text-app-on-action';
const ERROR_TEXT_CLASS = 'text-[13px] leading-[20px] text-app-danger';

type ChatDetailEmptyStateProps = {
  errorText?: string;
  onBack: () => void;
  onRetry?: () => void;
};

export function ChatDetailEmptyState({ errorText, onBack, onRetry }: ChatDetailEmptyStateProps) {
  const t = useT();

  return (
    <View className={EMPTY_STATE_CLASS}>
      <Text className={EMPTY_STATE_TITLE_CLASS}>{t('chatDetail.empty.title')}</Text>
      <Text className={EMPTY_STATE_BODY_CLASS}>{t('chatDetail.empty.body')}</Text>
      {errorText ? <Text className={ERROR_TEXT_CLASS}>{errorText}</Text> : null}
      {onRetry ? (
        <Pressable onPress={onRetry} className={EMPTY_STATE_BUTTON_CLASS}>
          <Text className={EMPTY_STATE_BUTTON_TEXT_CLASS}>{t('common.retry')}</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={onBack} className={EMPTY_STATE_BUTTON_CLASS}>
        <Text className={EMPTY_STATE_BUTTON_TEXT_CLASS}>{t('chatDetail.empty.back')}</Text>
      </Pressable>
    </View>
  );
}
