import { ReactNode, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getActiveDeviceProfile, listDeviceProfiles, type DeviceProfile } from '../../core/auth/deviceProfiles';
import { useAuthSession } from '../../core/auth/useAuthSession';
import { ScreenHeader } from '../../shared/components/ScreenHeader';
import { AppIcon, type AppIconUsage } from '../../shared/icons/AppIcon';
import { AppIconButton } from '../../shared/icons/AppIconButton';
import { type I18nKey, type LocalePreference, useI18n } from '../../shared/i18n';
import { useAppTheme } from '../../shared/visual/AppThemeProvider';
import { cn } from '../../shared/visual/className';
import { appVisualTokens } from '../../shared/visual/foundation';
import type { AppThemePreference } from '../../shared/visual/themePreference';
import {
  getDevelopmentDebugPanelSnapshot,
  openDevelopmentDebugPanel,
  setDevelopmentDebugPanelEnabled,
  subscribeDevelopmentDebugPanel
} from '../debug/developmentDebugPanel';
import {
  clearSettingsProfileCache,
  hasSettingsLegacyLocalCache,
  SETTINGS_LEGACY_CACHE_SCOPE_ID
} from '../settings/settingsActions';
import type { RootStackParamList } from '../navigation/types';

type SettingsScreenProps = NativeStackScreenProps<RootStackParamList, 'Settings'>;
type CacheActionState = {
  scopeId: string;
  status: 'clearing' | 'success' | 'error';
  errorText: string;
};

function getDeviceProfileEndpoint(profile: DeviceProfile): string {
  return profile.transportKind === 'desktop-ws' ? profile.desktopWs?.wsUrl || 'Desktop WS' : profile.apiBaseUrl;
}

type SettingsSectionProps = {
  title: string;
  children: ReactNode;
};

type SettingsRowProps = {
  iconUsage: AppIconUsage;
  title: string;
  detail?: string;
  value?: string;
  disabled?: boolean;
  selected?: boolean;
  rightAccessory?: ReactNode;
  onPress?: () => void;
};

type LanguageOption = {
  preference: LocalePreference;
  titleKey: I18nKey;
  detailKey: I18nKey;
};

type ThemeOption = {
  preference: AppThemePreference;
  titleKey: I18nKey;
  detailKey: I18nKey;
};

const SCREEN_CLASS = 'flex-1 bg-app-background';
const HEADER_SAFE_AREA_CLASS = 'bg-app-surface';
const SCROLL_VIEW_CLASS = 'flex-1';
const CONTENT_CLASS = 'gap-app-lg px-app-lg pt-app-lg';
const SECTION_CLASS = 'gap-app-sm';
const SECTION_TITLE_CLASS = 'ml-app-xs text-app-footnote font-semibold text-app-secondary';
const SECTION_ROWS_CLASS = 'overflow-hidden rounded-app-md border border-app-line bg-app-surface';
const ROW_CLASS = 'min-h-[58px] flex-row items-center gap-app-md border-t border-app-line px-app-lg py-app-sm';
const ROW_PRESSABLE_CLASS = `${ROW_CLASS} active:bg-app-surface-muted`;
const ROW_SELECTED_CLASS = 'bg-app-surface-muted';
const ROW_DISABLED_CLASS = 'opacity-[0.58]';
const ROW_ICON_SLOT_CLASS = 'h-8 w-8 shrink-0 items-center justify-center';
const ROW_TEXT_BLOCK_CLASS = 'min-w-0 flex-1 gap-[2px]';
const ROW_TITLE_CLASS = 'text-app-body font-semibold text-app-primary';
const ROW_DETAIL_CLASS = 'text-app-footnote text-app-secondary';
const ROW_VALUE_CLASS = 'max-w-24 shrink text-app-footnote font-medium text-app-secondary';
const ROW_TEXT_DISABLED_CLASS = 'text-app-tertiary';
const CACHE_ROW_ACTIONS_CLASS = 'flex-row items-center gap-app-sm';
const CACHE_CLEAR_BUTTON_CLASS =
  'min-h-[36px] items-center justify-center rounded-app-sm border border-app-danger-line bg-app-surface px-app-md active:bg-app-danger-soft';
const CACHE_CLEAR_BUTTON_DISABLED_CLASS = 'opacity-[0.5]';
const CACHE_CLEAR_BUTTON_TEXT_CLASS = 'text-app-footnote font-semibold text-app-danger';
const SELECTION_PLACEHOLDER_CLASS = 'h-[22px] w-[22px]';
const HEADER_ACTION_BUTTON_CLASS = 'h-11 w-11 items-center justify-center rounded-app-pill active:bg-app-surface-muted';

const THEME_OPTIONS = [
  {
    preference: 'system',
    titleKey: 'settings.theme.system',
    detailKey: 'settings.theme.systemDetail'
  },
  {
    preference: 'light',
    titleKey: 'settings.theme.light',
    detailKey: 'settings.theme.lightDetail'
  },
  {
    preference: 'dark',
    titleKey: 'settings.theme.dark',
    detailKey: 'settings.theme.darkDetail'
  }
] as const satisfies readonly ThemeOption[];

const LANGUAGE_OPTIONS = [
  {
    preference: 'system',
    titleKey: 'settings.language.system',
    detailKey: 'settings.language.systemDetail'
  },
  {
    preference: 'zh-CN',
    titleKey: 'settings.language.zhCN',
    detailKey: 'settings.language.zhCNDetail'
  },
  {
    preference: 'en-US',
    titleKey: 'settings.language.enUS',
    detailKey: 'settings.language.enUSDetail'
  }
] as const satisfies readonly LanguageOption[];

function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <View className={SECTION_CLASS}>
      <Text className={SECTION_TITLE_CLASS}>{title}</Text>
      <View className={SECTION_ROWS_CLASS}>{children}</View>
    </View>
  );
}

function SettingsRow({
  iconUsage,
  title,
  detail,
  value,
  disabled = false,
  selected = false,
  rightAccessory,
  onPress
}: SettingsRowProps) {
  const rowClass = cn(
    onPress ? ROW_PRESSABLE_CLASS : ROW_CLASS,
    selected && ROW_SELECTED_CLASS,
    disabled && ROW_DISABLED_CLASS
  );
  const disabledTextClass = disabled && ROW_TEXT_DISABLED_CLASS;

  const content = (
    <>
      <View className={ROW_ICON_SLOT_CLASS}>
        <AppIcon usage={iconUsage} size={19} />
      </View>
      <View className={ROW_TEXT_BLOCK_CLASS}>
        <Text className={cn(ROW_TITLE_CLASS, disabledTextClass)} numberOfLines={1}>
          {title}
        </Text>
        {detail ? (
          <Text className={cn(ROW_DETAIL_CLASS, disabledTextClass)} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text className={cn(ROW_VALUE_CLASS, disabledTextClass)} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {rightAccessory}
    </>
  );

  if (!onPress) {
    return <View className={rowClass}>{content}</View>;
  }

  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} className={rowClass}>
      {content}
    </Pressable>
  );
}

export function SettingsScreen({ navigation }: SettingsScreenProps) {
  const { locale, preference: localePreference, setLocalePreference, t } = useI18n();
  const { theme, preference: themePreference, resolvedPreference, setThemePreference } = useAppTheme();
  const { session } = useAuthSession();
  const insets = useSafeAreaInsets();
  const debugSnapshot = useSyncExternalStore(
    subscribeDevelopmentDebugPanel,
    getDevelopmentDebugPanelSnapshot,
    getDevelopmentDebugPanelSnapshot
  );
  const [cacheAction, setCacheAction] = useState<CacheActionState | null>(null);
  const [legacyCachePresent, setLegacyCachePresent] = useState(false);
  const deviceProfiles = listDeviceProfiles();
  const activeProfile = getActiveDeviceProfile();
  const legacyCacheProfile = useMemo(
    () => ({
      cacheScopeId: SETTINGS_LEGACY_CACHE_SCOPE_ID,
      desktopDeviceId: 'legacy-local-cache',
      displayName: t('settings.cache.localConversation'),
      endpoint: t('settings.cache.localConversationDetail'),
      needsRelink: false,
      current: true
    }),
    [t]
  );
  const cacheProfiles = useMemo(
    () =>
      deviceProfiles.length > 0
        ? deviceProfiles.map((profile) => ({
            ...profile,
            endpoint: `${getDeviceProfileEndpoint(profile)} · ${profile.desktopDeviceId.slice(0, 8)}`,
            current: activeProfile?.desktopDeviceId === profile.desktopDeviceId
          }))
        : legacyCachePresent
          ? [legacyCacheProfile]
          : [],
    [activeProfile?.desktopDeviceId, deviceProfiles, legacyCachePresent, legacyCacheProfile]
  );
  const developerModeEnabled = __DEV__ && debugSnapshot.enabled;
  const leftActions = useMemo(
    () =>
      [
        <AppIconButton
          key="back"
          usage="chatDetail.back"
          accessibilityLabel={t('settings.back')}
          onPress={() => navigation.goBack()}
          hitSlop={10}
          className={HEADER_ACTION_BUTTON_CLASS}
        />
      ] as const,
    [navigation, t]
  );

  useEffect(() => {
    if (deviceProfiles.length > 0) {
      setLegacyCachePresent(false);
      return;
    }

    let cancelled = false;
    void hasSettingsLegacyLocalCache()
      .then((present) => {
        if (!cancelled) {
          setLegacyCachePresent(present);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLegacyCachePresent(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [deviceProfiles.length]);

  const handleClearCache = useCallback(
    (profile: (typeof cacheProfiles)[number]) => {
      if (cacheAction?.status === 'clearing') {
        return;
      }

      Alert.alert(t('settings.cache.confirmTitle'), t('settings.cache.confirmMessage', { name: profile.displayName }), [
        {
          text: t('common.cancel'),
          style: 'cancel'
        },
        {
          text: t('settings.cache.clear'),
          style: 'destructive',
          onPress: () => {
            setCacheAction({ scopeId: profile.cacheScopeId, status: 'clearing', errorText: '' });
            clearSettingsProfileCache(profile.cacheScopeId, Boolean(session) && profile.current)
              .then(() => {
                setCacheAction({ scopeId: profile.cacheScopeId, status: 'success', errorText: '' });
                if (profile.desktopDeviceId === 'legacy-local-cache') {
                  setLegacyCachePresent(false);
                }
              })
              .catch((error) => {
                setCacheAction({
                  scopeId: profile.cacheScopeId,
                  status: 'error',
                  errorText: error instanceof Error ? error.message : String(error)
                });
              });
          }
        }
      ]);
    },
    [cacheAction?.status, session, t]
  );

  const handleDeveloperToggle = useCallback((enabled: boolean) => {
    setDevelopmentDebugPanelEnabled(enabled);
  }, []);
  const handleOpenDebugPanel = useCallback(() => {
    openDevelopmentDebugPanel();
  }, []);
  const handleLanguageSelect = useCallback(
    (nextPreference: LocalePreference) => {
      if (nextPreference === localePreference) {
        return;
      }

      setLocalePreference(nextPreference);
    },
    [localePreference, setLocalePreference]
  );
  const handleThemeSelect = useCallback(
    (nextPreference: AppThemePreference) => {
      if (nextPreference === themePreference) {
        return;
      }

      setThemePreference(nextPreference);
    },
    [setThemePreference, themePreference]
  );

  return (
    <View className={SCREEN_CLASS}>
      <SafeAreaView edges={['top']} className={HEADER_SAFE_AREA_CLASS}>
        <ScreenHeader title={t('settings.title')} leftActions={leftActions} />
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} className={SCROLL_VIEW_CLASS}>
        <View className={CONTENT_CLASS} style={{ paddingBottom: insets.bottom + appVisualTokens.spacing.xxl }}>
          <SettingsSection title={t('settings.section.cache')}>
            {cacheProfiles.map((profile) => {
              const profileAction = cacheAction?.scopeId === profile.cacheScopeId ? cacheAction : null;
              const clearing = profileAction?.status === 'clearing';
              const feedback =
                profileAction?.status === 'success'
                  ? t('settings.cache.success')
                  : profileAction?.status === 'error'
                    ? t('settings.cache.error', {
                        message: profileAction.errorText || t('common.unknown')
                      })
                    : '';
              return (
                <SettingsRow
                  key={profile.desktopDeviceId}
                  iconUsage="tab.me"
                  title={profile.displayName}
                  detail={`${profile.endpoint}${feedback ? `\n${feedback}` : ''}`}
                  rightAccessory={
                    <View className={CACHE_ROW_ACTIONS_CLASS}>
                      {profile.current ? (
                        <Text className={ROW_VALUE_CLASS}>{t('settings.cache.currentDevice')}</Text>
                      ) : (
                        <Text className={ROW_VALUE_CLASS}>
                          {profile.needsRelink ? t('settings.cache.needsRelink') : t('settings.cache.saved')}
                        </Text>
                      )}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('settings.cache.clearAccount', { name: profile.displayName })}
                        disabled={cacheAction?.status === 'clearing'}
                        className={cn(
                          CACHE_CLEAR_BUTTON_CLASS,
                          cacheAction?.status === 'clearing' && CACHE_CLEAR_BUTTON_DISABLED_CLASS
                        )}
                        onPress={() => handleClearCache(profile)}
                      >
                        {clearing ? (
                          <ActivityIndicator size="small" color={theme.colors.danger} />
                        ) : (
                          <Text className={CACHE_CLEAR_BUTTON_TEXT_CLASS}>{t('settings.cache.clear')}</Text>
                        )}
                      </Pressable>
                    </View>
                  }
                />
              );
            })}
          </SettingsSection>

          <SettingsSection title={t('settings.section.developer')}>
            <SettingsRow
              iconUsage="settings.developer"
              title={t('settings.developer.mode')}
              detail={__DEV__ ? t('settings.developer.modeDetail') : t('settings.developer.unavailable')}
              value={developerModeEnabled ? t('settings.value.enabled') : t('settings.value.disabled')}
              disabled={!__DEV__}
              rightAccessory={
                <Switch
                  disabled={!__DEV__}
                  value={developerModeEnabled}
                  onValueChange={handleDeveloperToggle}
                  trackColor={{
                    false: theme.colors.lineStrong,
                    true: theme.colors.brandBlueAction
                  }}
                  thumbColor={developerModeEnabled ? theme.colors.onBrandBlueAction : theme.colors.surface}
                />
              }
            />
            <SettingsRow
              iconUsage="settings.openPanel"
              title={t('settings.developer.openPanel')}
              detail={t('settings.developer.openPanelDetail')}
              disabled={!developerModeEnabled}
              onPress={handleOpenDebugPanel}
            />
          </SettingsSection>

          <SettingsSection title={t('settings.section.appearance')}>
            {THEME_OPTIONS.map((option) => {
              const selected = themePreference === option.preference;
              const value =
                option.preference === 'system' && selected
                  ? t('settings.theme.current', {
                      theme: t(resolvedPreference === 'dark' ? 'settings.theme.dark' : 'settings.theme.light')
                    })
                  : undefined;
              return (
                <SettingsRow
                  key={option.preference}
                  iconUsage="settings.theme"
                  title={t(option.titleKey)}
                  detail={t(option.detailKey)}
                  value={value}
                  selected={selected}
                  onPress={selected ? undefined : () => handleThemeSelect(option.preference)}
                  rightAccessory={
                    selected ? <AppIcon usage="settings.selected" /> : <View className={SELECTION_PLACEHOLDER_CLASS} />
                  }
                />
              );
            })}
          </SettingsSection>

          <SettingsSection title={t('settings.section.language')}>
            {LANGUAGE_OPTIONS.map((option) => {
              const selected = localePreference === option.preference;
              const value =
                option.preference === 'system' && selected ? t('settings.language.current', { locale }) : undefined;
              return (
                <SettingsRow
                  key={option.preference}
                  iconUsage="settings.language"
                  title={t(option.titleKey)}
                  detail={t(option.detailKey)}
                  value={value}
                  selected={selected}
                  onPress={selected ? undefined : () => handleLanguageSelect(option.preference)}
                  rightAccessory={
                    selected ? <AppIcon usage="settings.selected" /> : <View className={SELECTION_PLACEHOLDER_CLASS} />
                  }
                />
              );
            })}
          </SettingsSection>
        </View>
      </ScrollView>
    </View>
  );
}
