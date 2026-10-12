import { useCloudAuth } from '../../core/auth/useCloudAuth';
import { logoutCloud } from '../../core/auth/cloudAuth';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAccountAuth } from '../../core/auth/useAccountAuth.ts';
import { AppKeyboardAwareScrollView } from '../../shared/components/AppKeyboardAwareScrollView';
import { ScreenHeader } from '../../shared/components/ScreenHeader';
import { AppIcon } from '../../shared/icons/AppIcon';
import { useI18n } from '../../shared/i18n';
import { useAppTheme } from '../../shared/visual/AppThemeProvider';
import { cn } from '../../shared/visual/className';
import { appVisualTokens, getAvatarLabel, getAvatarTone } from '../../shared/visual/foundation';
import { useAppTabBarHeight } from '../../shared/visual/useAppTabBarHeight';
import type { RootStackParamList } from '../navigation/types';
import { MeScreenRow, MeScreenSection } from './MeScreenParts';

const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;

export function MeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { session } = useAccountAuth();
  const cloud = useCloudAuth();
  const { locale, t } = useI18n();
  const { theme, preference, setThemePreference } = useAppTheme();
  const tabBarHeight = useAppTabBarHeight();
  const contentContainerStyle = useMemo(
    () => ({ paddingBottom: (Platform.OS === 'web' ? tabBarHeight : 0) + appVisualTokens.spacing.xxl }),
    [tabBarHeight]
  );
  const accountName = session?.username || t('me.accountName.loggedOut');
  const avatarTone = getAvatarTone(accountName);

  return (
    <View className="flex-1 bg-app-background">
      <SafeAreaView edges={['top']} className="bg-app-surface">
        <ScreenHeader title={t('me.title')} />
      </SafeAreaView>
      <AppKeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-app-lg px-app-lg pt-app-lg">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('account.title')}
            onPress={() =>
              session ? navigation.navigate('Settings', { section: 'account' }) : navigation.navigate('Login')
            }
            className="flex-row items-center gap-app-md rounded-app-md border border-app-line bg-app-surface px-app-lg py-app-lg active:bg-app-surface-muted"
          >
            <View
              className="h-[52px] w-[52px] items-center justify-center rounded-app-pill"
              style={{ backgroundColor: avatarTone.backgroundColor }}
            >
              <Text className="text-app-title-lg font-semibold" style={{ color: avatarTone.foregroundColor }}>
                {getAvatarLabel(accountName)}
              </Text>
            </View>
            <View className="min-w-0 flex-1 gap-app-xs">
              <Text className="text-app-title-sm font-semibold text-app-primary" numberOfLines={1}>
                {accountName}
              </Text>
              <Text className="text-app-footnote text-app-secondary">
                {t(session ? 'me.session.loggedIn' : 'account.loginHint')}
              </Text>
            </View>
            <View className="rotate-180">
              <AppIcon usage="chatDetail.back" size={19} color={theme.colors.textTertiary} />
            </View>
          </Pressable>
          <MeScreenSection title={t('accountSource.cloud')}>
            <MeScreenRow
              isFirst
              title={t('cloud.login')}
              value={t(`cloud.status.${cloud.status}`)}
              iconUsage="accountSource.cloud"
              accessory={{ kind: 'chevron' }}
              onPress={() => navigation.navigate('Login', { mode: 'cloud' })}
            />
            {cloud.scopeId ? <MeScreenRow title={t('cloud.logout')} iconUsage="tab.me" onPress={logoutCloud} /> : null}
          </MeScreenSection>
          <MeScreenSection title={t('me.action.themeSettings')}>
            <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-app-xs p-app-sm">
              {THEME_PREFERENCES.map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: preference === option }}
                  onPress={() => setThemePreference(option)}
                  className={cn(
                    'min-h-11 min-w-[80px] flex-1 items-center justify-center rounded-app-sm px-app-sm py-app-sm',
                    preference === option ? 'bg-app-action' : 'bg-app-surface-muted'
                  )}
                >
                  <Text
                    className={cn(
                      'text-app-body-sm font-semibold',
                      preference === option ? 'text-app-on-action' : 'text-app-secondary'
                    )}
                  >
                    {t(`settings.theme.${option}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </MeScreenSection>
          <MeScreenSection title={t('me.section.actions')}>
            <MeScreenRow
              isFirst
              title={t('me.action.languageSettings')}
              value={t(locale === 'zh-CN' ? 'settings.language.zhCN' : 'settings.language.enUS')}
              iconUsage="settings.language"
              accessory={{ kind: 'chevron' }}
              onPress={() => navigation.navigate('Settings', { section: 'language' })}
            />
            <MeScreenRow
              title={t('account.storage')}
              iconUsage="settings.cache"
              accessory={{ kind: 'chevron' }}
              onPress={() => navigation.navigate('Settings', { section: 'storage' })}
            />
            <MeScreenRow
              title={t('me.section.accountDevices')}
              iconUsage="tab.me"
              accessory={{ kind: 'chevron' }}
              onPress={() =>
                session ? navigation.navigate('Settings', { section: 'devices' }) : navigation.navigate('Login')
              }
            />
            <MeScreenRow
              title={t('me.section.about')}
              iconUsage="settings.openPanel"
              accessory={{ kind: 'chevron' }}
              onPress={() => navigation.navigate('About')}
            />
          </MeScreenSection>
        </View>
      </AppKeyboardAwareScrollView>
    </View>
  );
}
