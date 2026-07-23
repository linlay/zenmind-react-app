import { memo } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { useT } from '../../../shared/i18n';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider';

const WAITING_INDICATOR_CLASS = 'min-h-[38px] flex-row items-center gap-[10px] py-[8px]';
const WAITING_TEXT_CLASS = 'text-[13px] font-medium leading-[19px] text-app-tertiary';

export const ChatResponseWaitingIndicator = memo(function ChatResponseWaitingIndicator() {
  const t = useT();
  const { theme } = useAppTheme();
  const label = t('chatDetail.waitingForResponse');

  return (
    <View accessible accessibilityLabel={label} accessibilityLiveRegion="polite" className={WAITING_INDICATOR_CLASS}>
      <ActivityIndicator size="small" color={theme.colors.brandBlue} />
      <Text className={WAITING_TEXT_CLASS}>{label}</Text>
    </View>
  );
});
