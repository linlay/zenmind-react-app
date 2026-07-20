import { memo } from 'react';
import { Text, View } from 'react-native';

import { useT } from '../../i18n';
import type { ConversationPreviewSurfaceProps } from './types';

export const PreviewSurface = memo(function PreviewSurface({ active }: ConversationPreviewSurfaceProps) {
  const t = useT();
  if (!active) {
    return null;
  }
  return (
    <View className="min-h-[160px] items-center justify-center bg-app-surface-muted px-app-md">
      <Text allowFontScaling={false} className="text-center text-[13px] text-app-secondary">
        {t('markdownPreview.unavailable')}
      </Text>
    </View>
  );
});
