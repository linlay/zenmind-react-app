import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AppIcon } from '../../icons/AppIcon';
import { useT } from '../../i18n';
import { cn } from '../../visual/className';

const ROOT_CLASS = 'gap-2 bg-app-danger-soft px-3 py-[10px]';
const TITLE_CLASS = 'text-[13px] font-bold text-app-danger';
const MESSAGE_CLASS = 'text-[12px] leading-[18px] text-app-danger';
const ACTION_CLASS =
  'h-8 min-w-8 flex-row items-center justify-center gap-1 self-start rounded-app-sm px-2 active:bg-app-background-muted';
const ACTION_TEXT_CLASS = 'text-[12px] font-semibold text-app-secondary';

export const PreviewErrorPanel = memo(function PreviewErrorPanel({
  message,
  onRetry,
  placement
}: {
  message: string;
  onRetry: () => void;
  placement: 'inline' | 'overlay';
}) {
  const t = useT();
  return (
    <View
      className={cn(
        ROOT_CLASS,
        placement === 'inline' ? 'border-t border-app-danger-line' : 'border-b border-app-danger-line'
      )}
    >
      <Text allowFontScaling={false} className={TITLE_CLASS}>
        {t('markdownPreview.error')}
      </Text>
      <Text allowFontScaling={false} selectable className={MESSAGE_CLASS}>
        {message}
      </Text>
      <Pressable
        accessibilityLabel={t('markdownPreview.retry')}
        accessibilityRole="button"
        onPress={onRetry}
        className={ACTION_CLASS}
      >
        <AppIcon usage="markdownPreview.retry" />
        <Text allowFontScaling={false} className={ACTION_TEXT_CLASS}>
          {t('markdownPreview.retry')}
        </Text>
      </Pressable>
    </View>
  );
});
