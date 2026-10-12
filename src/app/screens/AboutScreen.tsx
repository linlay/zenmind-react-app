import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '../../shared/components/ScreenHeader';
import { APP_VERSION, PRODUCT_NAME } from '../../shared/generated/brand';
import { AppIconButton } from '../../shared/icons/AppIconButton';
import { useT } from '../../shared/i18n';
import { appVisualTokens } from '../../shared/visual/foundation';
import { openDevelopmentDebugPanel } from '../debug/developmentDebugPanel';
import type { RootStackParamList } from '../navigation/types';
import { MeScreenRow, MeScreenSection } from './MeScreenParts';

export function AboutScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'About'>) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const tapCount = useRef(0);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    []
  );
  function handleVersionPress() {
    if (!__DEV__) return;
    if (resetTimer.current) clearTimeout(resetTimer.current);
    tapCount.current++;
    if (tapCount.current === 3) {
      tapCount.current = 0;
      resetTimer.current = null;
      openDevelopmentDebugPanel();
      return;
    }
    resetTimer.current = setTimeout(() => {
      tapCount.current = 0;
      resetTimer.current = null;
    }, 1200);
  }
  return (
    <View className="flex-1 bg-app-background">
      <SafeAreaView edges={['top']} className="bg-app-surface">
        <ScreenHeader
          title={t('me.section.about')}
          leftActions={[
            <AppIconButton
              key="back"
              usage="chatDetail.back"
              accessibilityLabel={t('settings.back')}
              onPress={() => navigation.goBack()}
              className="h-11 w-11 items-center justify-center rounded-app-pill active:bg-app-surface-muted"
            />
          ]}
        />
      </SafeAreaView>
      <ScrollView className="flex-1">
        <View
          className="gap-app-lg px-app-lg pt-app-lg"
          style={{ paddingBottom: insets.bottom + appVisualTokens.spacing.xxl }}
        >
          <MeScreenSection title={PRODUCT_NAME}>
            <MeScreenRow isFirst title={t('me.row.app')} value={PRODUCT_NAME} />
            <MeScreenRow
              title={t('me.row.version')}
              value={`v${APP_VERSION}`}
              onPress={__DEV__ ? handleVersionPress : undefined}
            />
          </MeScreenSection>
          {__DEV__ ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate('Settings', { section: 'development' })}
              className="min-h-11 justify-center px-app-sm"
            >
              <Text className="text-app-body-sm text-app-brand-blue">{t('me.action.developerMode')}</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
