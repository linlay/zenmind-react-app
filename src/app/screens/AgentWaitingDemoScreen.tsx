import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ChatResponseWaitingIndicator,
  type ChatResponseWaitingVariant
} from '../../features/chatPersistence/components/ChatResponseWaitingIndicator';
import { ScreenHeader } from '../../shared/components/ScreenHeader';
import { AppIconButton } from '../../shared/icons/AppIconButton';
import { type I18nKey, useI18n } from '../../shared/i18n';
import { appVisualTokens } from '../../shared/visual/foundation';
import type { RootStackParamList } from '../navigation/types';

type AgentWaitingDemoScreenProps = NativeStackScreenProps<RootStackParamList, 'AgentWaitingDemo'>;

type WaitingDemoItem = {
  variant: ChatResponseWaitingVariant;
  titleKey: I18nKey;
  descriptionKey: I18nKey;
  recommended?: boolean;
};

const WAITING_DEMOS: readonly WaitingDemoItem[] = [
  {
    variant: 'orbit',
    titleKey: 'agentWaitingDemo.variant.orbit.title',
    descriptionKey: 'agentWaitingDemo.variant.orbit.description',
    recommended: true
  },
  {
    variant: 'pulse',
    titleKey: 'agentWaitingDemo.variant.pulse.title',
    descriptionKey: 'agentWaitingDemo.variant.pulse.description'
  },
  {
    variant: 'wave',
    titleKey: 'agentWaitingDemo.variant.wave.title',
    descriptionKey: 'agentWaitingDemo.variant.wave.description'
  },
  {
    variant: 'typing',
    titleKey: 'agentWaitingDemo.variant.typing.title',
    descriptionKey: 'agentWaitingDemo.variant.typing.description'
  },
  {
    variant: 'scan',
    titleKey: 'agentWaitingDemo.variant.scan.title',
    descriptionKey: 'agentWaitingDemo.variant.scan.description'
  }
];

const SCREEN_CLASS = 'flex-1 bg-app-background-muted';
const HEADER_SAFE_AREA_CLASS = 'bg-app-surface';
const HEADER_ACTION_BUTTON_CLASS = 'h-10 w-10 items-center justify-center rounded-app-pill active:opacity-[0.64]';
const SCROLL_VIEW_CLASS = 'flex-1';
const CONTENT_CLASS = 'gap-app-lg px-app-xl pt-app-xl';
const INTRO_CLASS = 'gap-app-sm px-app-xs pb-app-xs';
const EYEBROW_CLASS = 'text-app-caption font-bold tracking-[1.5px] text-app-brand-blue';
const INTRO_TITLE_CLASS = 'text-app-display-sm font-extrabold text-app-primary';
const INTRO_BODY_CLASS = 'text-app-body leading-[22px] text-app-secondary';
const CARD_CLASS = 'gap-app-lg rounded-app-lg border border-app-line bg-app-surface p-app-lg';
const CARD_HEADER_CLASS = 'flex-row items-start gap-app-md';
const CARD_NUMBER_CLASS = 'h-8 w-8 items-center justify-center rounded-app-pill bg-app-brand-blue-soft';
const CARD_NUMBER_TEXT_CLASS = 'text-app-caption font-extrabold text-app-brand-blue';
const CARD_TEXT_CLASS = 'min-w-0 flex-1 gap-app-xs';
const CARD_TITLE_ROW_CLASS = 'flex-row flex-wrap items-center gap-app-sm';
const CARD_TITLE_CLASS = 'text-app-title-sm font-extrabold text-app-primary';
const CARD_DESCRIPTION_CLASS = 'text-app-footnote leading-[19px] text-app-secondary';
const RECOMMENDED_BADGE_CLASS = 'rounded-app-pill bg-app-action px-app-sm py-app-xs';
const RECOMMENDED_BADGE_TEXT_CLASS = 'text-app-micro font-bold text-app-on-action';
const PREVIEW_CLASS =
  'min-h-[78px] justify-center rounded-app-md border border-app-line bg-app-surface-muted px-app-lg';

export function AgentWaitingDemoScreen({ navigation }: AgentWaitingDemoScreenProps) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const leftActions = useMemo(
    () =>
      [
        <AppIconButton
          key="back"
          usage="chatDetail.back"
          accessibilityLabel={t('agentWaitingDemo.back')}
          onPress={() => navigation.goBack()}
          hitSlop={10}
          className={HEADER_ACTION_BUTTON_CLASS}
        />
      ] as const,
    [navigation, t]
  );

  return (
    <View className={SCREEN_CLASS}>
      <SafeAreaView edges={['top']} className={HEADER_SAFE_AREA_CLASS}>
        <ScreenHeader title={t('agentWaitingDemo.title')} leftActions={leftActions} />
      </SafeAreaView>

      <ScrollView className={SCROLL_VIEW_CLASS} showsVerticalScrollIndicator={false}>
        <View className={CONTENT_CLASS} style={{ paddingBottom: insets.bottom + appVisualTokens.spacing.xxl }}>
          <View className={INTRO_CLASS}>
            <Text className={EYEBROW_CLASS}>{t('agentWaitingDemo.eyebrow')}</Text>
            <Text className={INTRO_TITLE_CLASS}>{t('agentWaitingDemo.introTitle')}</Text>
            <Text className={INTRO_BODY_CLASS}>{t('agentWaitingDemo.introBody')}</Text>
          </View>

          {WAITING_DEMOS.map((item, index) => (
            <View key={item.variant} className={CARD_CLASS}>
              <View className={CARD_HEADER_CLASS}>
                <View className={CARD_NUMBER_CLASS}>
                  <Text className={CARD_NUMBER_TEXT_CLASS}>{String(index + 1).padStart(2, '0')}</Text>
                </View>
                <View className={CARD_TEXT_CLASS}>
                  <View className={CARD_TITLE_ROW_CLASS}>
                    <Text className={CARD_TITLE_CLASS}>{t(item.titleKey)}</Text>
                    {item.recommended ? (
                      <View className={RECOMMENDED_BADGE_CLASS}>
                        <Text className={RECOMMENDED_BADGE_TEXT_CLASS}>{t('agentWaitingDemo.recommended')}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text className={CARD_DESCRIPTION_CLASS}>{t(item.descriptionKey)}</Text>
                </View>
              </View>

              <View className={PREVIEW_CLASS}>
                <ChatResponseWaitingIndicator variant={item.variant} />
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
