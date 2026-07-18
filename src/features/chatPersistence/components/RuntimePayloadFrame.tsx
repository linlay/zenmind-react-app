import { memo, type ReactNode, useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AppIcon } from '../../../shared/icons/AppIcon';
import { useT } from '../../../shared/i18n';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider';
import { cn } from '../../../shared/visual/className';
import { resolveRuntimePayloadCopyText, type RuntimePayloadCopyText } from './runtimePayloadDescriptor.ts';

type RuntimePayloadFrameProps = {
  descriptorId: string;
  copyText: RuntimePayloadCopyText;
  defaultWrap: boolean;
  onCopyText: (text: string) => void;
  renderContent: (wrap: boolean) => ReactNode;
};

const RuntimeCopyButton = memo(function RuntimeCopyButton({
  copyText,
  onCopyText
}: {
  copyText: RuntimePayloadCopyText;
  onCopyText: (text: string) => void;
}) {
  const t = useT();
  const { theme } = useAppTheme();
  const handleCopy = useCallback(() => {
    const resolvedText = resolveRuntimePayloadCopyText(copyText);
    if (resolvedText) {
      onCopyText(resolvedText);
    }
  }, [copyText, onCopyText]);

  return (
    <Pressable
      accessibilityLabel={t('timeline.copy')}
      accessibilityRole="button"
      onPress={handleCopy}
      className={ICON_BUTTON_CLASS}
    >
      <AppIcon usage="runtime.copy" color={theme.colors.textSecondary} />
    </Pressable>
  );
});

export const RuntimePayloadFrame = memo(function RuntimePayloadFrame({
  descriptorId,
  copyText,
  defaultWrap,
  onCopyText,
  renderContent
}: RuntimePayloadFrameProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const [wrap, setWrap] = useState(defaultWrap);

  useEffect(() => {
    setWrap(defaultWrap);
  }, [descriptorId, defaultWrap]);

  const handleToggleWrap = useCallback(() => setWrap((value) => !value), []);

  const content = renderContent(wrap);

  return (
    <View className={FRAME_CLASS}>
      <View className={TOOLBAR_CLASS}>
        <Pressable
          accessibilityLabel={wrap ? t('timeline.wrapOff') : t('timeline.wrapOn')}
          accessibilityRole="button"
          onPress={handleToggleWrap}
          className={cn(ICON_BUTTON_CLASS, wrap ? ICON_BUTTON_ACTIVE_CLASS : null)}
        >
          <AppIcon
            usage={wrap ? 'runtime.wrapEnabled' : 'runtime.wrapDisabled'}
            color={wrap ? theme.colors.brandBlue : theme.colors.textSecondary}
          />
        </Pressable>
        {copyText ? <RuntimeCopyButton copyText={copyText} onCopyText={onCopyText} /> : null}
      </View>

      {wrap ? (
        <View className={WRAP_CONTENT_CLASS}>{content}</View>
      ) : (
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator className={NOWRAP_SCROLLER_CLASS}>
          <View className={NOWRAP_CONTENT_CLASS}>{content}</View>
        </ScrollView>
      )}
    </View>
  );
});

const FRAME_CLASS = 'mt-2 rounded-app-sm bg-app-surface-muted px-[10px] pb-[10px] pt-[7px]';
const TOOLBAR_CLASS = 'mb-[5px] min-h-[22px] flex-row items-center justify-end gap-app-xs';
const ICON_BUTTON_CLASS = 'h-6 w-6 items-center justify-center rounded-app-sm active:opacity-[0.7]';
const ICON_BUTTON_ACTIVE_CLASS = 'bg-app-brand-blue-soft';
const WRAP_CONTENT_CLASS = 'min-w-0';
const NOWRAP_SCROLLER_CLASS = 'self-stretch';
const NOWRAP_CONTENT_CLASS = 'min-w-[720px]';
