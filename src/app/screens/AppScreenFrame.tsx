import { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '../../shared/components/ScreenHeader';
import { useT } from '../../shared/i18n';
import { appVisualTokens } from '../../shared/visual/foundation';
import { useAppTabBarHeight } from '../../shared/visual/useAppTabBarHeight';

type AppScreenFrameProps = {
  eyebrow: string;
  title: string;
  description: string;
  accentColor: string;
  children?: ReactNode;
};

const SCREEN_CLASS = 'flex-1 bg-app-surface';
const HEADER_SAFE_AREA_CLASS = 'bg-app-surface';
const SCROLL_VIEW_CLASS = 'flex-1';
const CONTENT_CLASS = 'w-full gap-app-xl px-app-xl pt-app-lg';
const INTRO_SECTION_CLASS = 'gap-app-sm';
const EYEBROW_ROW_CLASS = 'flex-row items-center self-start gap-app-sm';
const ACCENT_DOT_CLASS = 'h-[6px] w-[6px] rounded-app-pill';
const EYEBROW_CLASS = 'text-app-caption font-semibold';
const SECTION_TITLE_CLASS = 'text-app-display-sm font-bold text-app-primary';
const DESCRIPTION_CLASS = 'text-[16px] leading-6 text-app-secondary';
const PLACEHOLDER_BLOCK_CLASS = 'gap-app-sm border-t border-app-line pt-app-lg';
const CARD_EYEBROW_CLASS = 'text-app-caption font-semibold text-app-brand-blue';
const CARD_TITLE_CLASS = 'text-app-title font-bold text-app-primary';
const CARD_BODY_CLASS = 'text-app-body text-app-secondary';

export function AppScreenFrame({ eyebrow, title, description, accentColor, children }: AppScreenFrameProps) {
  const tabBarHeight = useAppTabBarHeight();
  const t = useT();
  const hasChildren = children !== undefined && children !== null;
  const contentBottomPadding = tabBarHeight + appVisualTokens.spacing.xxl;

  return (
    <View className={SCREEN_CLASS}>
      <SafeAreaView edges={['top']} className={HEADER_SAFE_AREA_CLASS}>
        <ScreenHeader title={title} />
      </SafeAreaView>

      <ScrollView
        className={SCROLL_VIEW_CLASS}
        showsVerticalScrollIndicator={false}
      >
        <View className={CONTENT_CLASS} style={{ paddingBottom: contentBottomPadding }}>
          <View className={INTRO_SECTION_CLASS}>
            <View className={EYEBROW_ROW_CLASS}>
              <View className={ACCENT_DOT_CLASS} style={{ backgroundColor: accentColor }} />
              <Text className={EYEBROW_CLASS} style={{ color: accentColor }}>
                {eyebrow}
              </Text>
            </View>
            <Text className={SECTION_TITLE_CLASS}>{title}</Text>
            <Text className={DESCRIPTION_CLASS}>{description}</Text>
          </View>

          {hasChildren ? (
            children
          ) : (
            <View className={PLACEHOLDER_BLOCK_CLASS}>
              <Text className={CARD_EYEBROW_CLASS}>{t('app.placeholder.eyebrow')}</Text>
              <Text className={CARD_TITLE_CLASS}>{t('app.placeholder.title')}</Text>
              <Text className={CARD_BODY_CLASS}>{t('app.placeholder.body')}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
