import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '../../shared/components/ScreenHeader';
import { AppIconButton } from '../../shared/icons/AppIconButton';
import { useT } from '../../shared/i18n';
import type { WebAppsRuntimeHostProps } from './WebAppsRuntimeHost.types';

export const WebAppsRuntimeHost = memo(function WebAppsRuntimeHost({
  visible,
  activeApp,
  onBack
}: WebAppsRuntimeHostProps) {
  const t = useT();

  if (!visible) {
    return null;
  }

  return (
    <View className="absolute inset-0 z-[1200] bg-app-surface">
      <SafeAreaView edges={['top']} className="bg-app-surface">
        <ScreenHeader
          title={activeApp?.name || t('webApps.detail.loadingTitle')}
          leftActions={[
            <AppIconButton
              key="back"
              usage="webApps.back"
              accessibilityLabel={t('webApps.detail.back')}
              onPress={onBack}
              className="h-10 w-10 items-center justify-center"
            />
          ]}
        />
      </SafeAreaView>
      <View className="flex-1 items-center justify-center px-app-xl">
        <Text className="text-center text-app-body text-app-secondary">{t('webApps.detail.nativeOnly')}</Text>
        <Pressable accessibilityRole="button" onPress={onBack} className="mt-app-lg">
          <Text className="font-bold text-app-brand-blue">{t('webApps.detail.back')}</Text>
        </Pressable>
      </View>
    </View>
  );
});
