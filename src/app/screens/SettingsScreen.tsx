import { ReactNode, useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getActiveDeviceProfile, listDeviceProfiles } from '../../core/auth/deviceProfiles';
import { useAuthSession } from '../../core/auth/useAuthSession';
import { ScreenHeader } from '../../shared/components/ScreenHeader';
import { AppIcon, type AppIconUsage } from '../../shared/icons/AppIcon';
import { AppIconButton } from '../../shared/icons/AppIconButton';
import { type I18nKey, type LocalePreference, useI18n } from '../../shared/i18n';
import { useAppTheme, useAppThemeStyles } from '../../shared/visual/AppThemeProvider';
import { appVisualTokens, type AppThemeTokens } from '../../shared/visual/foundation';
import type { AppThemePreference } from '../../shared/visual/themePreference';
import {
  getDevelopmentDebugPanelSnapshot,
  openDevelopmentDebugPanel,
  setDevelopmentDebugPanelEnabled,
  subscribeDevelopmentDebugPanel,
} from '../debug/developmentDebugPanel';
import { clearSettingsLocalCache } from '../settings/settingsActions';
import type { RootStackParamList } from '../navigation/types';

type SettingsScreenProps = NativeStackScreenProps<RootStackParamList, 'Settings'>;
type CacheActionState = 'idle' | 'clearing' | 'success' | 'error';

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

const THEME_OPTIONS = [
  {
    preference: 'system',
    titleKey: 'settings.theme.system',
    detailKey: 'settings.theme.systemDetail',
  },
  {
    preference: 'light',
    titleKey: 'settings.theme.light',
    detailKey: 'settings.theme.lightDetail',
  },
  {
    preference: 'dark',
    titleKey: 'settings.theme.dark',
    detailKey: 'settings.theme.darkDetail',
  },
] as const satisfies readonly ThemeOption[];

const LANGUAGE_OPTIONS = [
  {
    preference: 'system',
    titleKey: 'settings.language.system',
    detailKey: 'settings.language.systemDetail',
  },
  {
    preference: 'zh-CN',
    titleKey: 'settings.language.zhCN',
    detailKey: 'settings.language.zhCNDetail',
  },
  {
    preference: 'en-US',
    titleKey: 'settings.language.enUS',
    detailKey: 'settings.language.enUSDetail',
  },
] as const satisfies readonly LanguageOption[];

function SettingsSection({ title, children }: SettingsSectionProps) {
  const styles = useAppThemeStyles(createStyles);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionRows}>{children}</View>
    </View>
  );
}

function SettingsRow({
  iconUsage,
  title,
  detail,
  value,
  disabled = false,
  rightAccessory,
  onPress,
}: SettingsRowProps) {
  const styles = useAppThemeStyles(createStyles);

  const content = (
    <>
      <View style={[styles.rowIconShell, disabled ? styles.rowIconShellDisabled : null]}>
        <AppIcon usage={iconUsage} />
      </View>
      <View style={styles.rowTextBlock}>
        <Text style={[styles.rowTitle, disabled ? styles.rowTextDisabled : null]} numberOfLines={1}>
          {title}
        </Text>
        {detail ? (
          <Text style={[styles.rowDetail, disabled ? styles.rowTextDisabled : null]} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={[styles.rowValue, disabled ? styles.rowTextDisabled : null]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {rightAccessory}
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, disabled ? styles.rowDisabled : null]}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        disabled ? styles.rowDisabled : null,
        pressed && !disabled ? styles.rowPressed : null,
      ]}
    >
      {content}
    </Pressable>
  );
}

export function SettingsScreen({ navigation }: SettingsScreenProps) {
  const { locale, preference: localePreference, setLocalePreference, t } = useI18n();
  const { theme, preference: themePreference, resolvedPreference, setThemePreference } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const { session } = useAuthSession();
  const insets = useSafeAreaInsets();
  const debugSnapshot = useSyncExternalStore(
    subscribeDevelopmentDebugPanel,
    getDevelopmentDebugPanelSnapshot,
    getDevelopmentDebugPanelSnapshot
  );
  const [cacheState, setCacheState] = useState<CacheActionState>('idle');
  const [cacheErrorText, setCacheErrorText] = useState('');
  const deviceProfiles = listDeviceProfiles();
  const activeProfile = getActiveDeviceProfile();
  const isClearingCache = cacheState === 'clearing';
  const developerModeEnabled = __DEV__ && debugSnapshot.enabled;
  const cacheDetail = useMemo(() => {
    if (cacheState === 'success') {
      return t('settings.cache.success');
    }
    if (cacheState === 'error') {
      return t('settings.cache.error', { message: cacheErrorText || t('common.unknown') });
    }
    return t('settings.cache.detail');
  }, [cacheErrorText, cacheState, t]);
  const leftActions = useMemo(
    () =>
      [
        <AppIconButton
          key="back"
          usage="chatDetail.back"
          accessibilityLabel={t('settings.back')}
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={styles.headerActionButton}
          pressedStyle={styles.headerActionPressed}
        />,
      ] as const,
    [navigation, styles, t]
  );

  const handleClearCache = useCallback(() => {
    if (isClearingCache) {
      return;
    }

    setCacheState('clearing');
    setCacheErrorText('');
    clearSettingsLocalCache(Boolean(session))
      .then(() => {
        setCacheState('success');
      })
      .catch((error) => {
        setCacheErrorText(error instanceof Error ? error.message : String(error));
        setCacheState('error');
      });
  }, [isClearingCache, session]);

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
    <View style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <ScreenHeader title={t('settings.title')} leftActions={leftActions} />
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + appVisualTokens.spacing.xxl }]}
      >
        <SettingsSection title={t('settings.section.cache')}>
          <SettingsRow
            iconUsage="settings.cache"
            title={t('settings.cache.clear')}
            detail={cacheDetail}
            disabled={isClearingCache}
            onPress={handleClearCache}
            rightAccessory={
              isClearingCache ? <ActivityIndicator size="small" color={theme.colors.brandBlue} /> : null
            }
          />
          {deviceProfiles.map((profile) => (
            <SettingsRow
              key={profile.desktopDeviceId}
              iconUsage="tab.me"
              title={profile.displayName}
              detail={`${profile.apiBaseUrl} · ${profile.desktopDeviceId.slice(0, 8)}`}
              value={
                activeProfile?.desktopDeviceId === profile.desktopDeviceId
                  ? t('settings.cache.currentDevice')
                  : undefined
              }
              disabled={profile.needsRelink}
            />
          ))}
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
                  true: theme.colors.brandBlueSoft,
                }}
                thumbColor={developerModeEnabled ? theme.colors.brandBlue : theme.colors.surface}
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
                    theme: t(resolvedPreference === 'dark' ? 'settings.theme.dark' : 'settings.theme.light'),
                  })
                : undefined;
            return (
              <SettingsRow
                key={option.preference}
                iconUsage="settings.theme"
                title={t(option.titleKey)}
                detail={t(option.detailKey)}
                value={value}
                onPress={selected ? undefined : () => handleThemeSelect(option.preference)}
                rightAccessory={
                  selected ? (
                    <AppIcon usage="settings.selected" />
                  ) : (
                    <View style={styles.selectionPlaceholder} />
                  )
                }
              />
            );
          })}
        </SettingsSection>

        <SettingsSection title={t('settings.section.language')}>
          {LANGUAGE_OPTIONS.map((option) => {
            const selected = localePreference === option.preference;
            const value =
              option.preference === 'system' && selected
                ? t('settings.language.current', { locale })
                : undefined;
            return (
              <SettingsRow
                key={option.preference}
                iconUsage="settings.language"
                title={t(option.titleKey)}
                detail={t(option.detailKey)}
                value={value}
                onPress={selected ? undefined : () => handleLanguageSelect(option.preference)}
                rightAccessory={
                  selected ? (
                    <AppIcon usage="settings.selected" />
                  ) : (
                    <View style={styles.selectionPlaceholder} />
                  )
                }
              />
            );
          })}
        </SettingsSection>
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppThemeTokens) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.surface,
    },
    headerSafeArea: {
      backgroundColor: theme.colors.surface,
    },
    headerActionButton: {
      width: 40,
      height: 40,
      borderRadius: appVisualTokens.radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerActionPressed: {
      opacity: 0.64,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      paddingHorizontal: appVisualTokens.spacing.xl,
      paddingTop: appVisualTokens.spacing.lg,
      gap: appVisualTokens.spacing.xl,
    },
    section: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.line,
      paddingTop: appVisualTokens.spacing.lg,
    },
    sectionTitle: {
      marginBottom: appVisualTokens.spacing.md,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
      color: theme.colors.brandBlue,
    },
    sectionRows: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.line,
    },
    row: {
      minHeight: 62,
      flexDirection: 'row',
      alignItems: 'center',
      gap: appVisualTokens.spacing.md,
      paddingVertical: appVisualTokens.spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.line,
    },
    rowPressed: {
      opacity: 0.66,
    },
    rowDisabled: {
      opacity: 0.58,
    },
    rowIconShell: {
      width: 36,
      height: 36,
      borderRadius: appVisualTokens.radii.pill,
      backgroundColor: theme.colors.brandBlueSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowIconShellDisabled: {
      backgroundColor: theme.colors.surfaceMuted,
    },
    rowTextBlock: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    rowTitle: {
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    rowDetail: {
      fontSize: 13,
      lineHeight: 19,
      color: theme.colors.textSecondary,
    },
    rowValue: {
      maxWidth: 96,
      flexShrink: 1,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    rowTextDisabled: {
      color: theme.colors.textTertiary,
    },
    selectionPlaceholder: {
      width: appVisualTokens.iconSizes.md,
      height: appVisualTokens.iconSizes.md,
    },
  });
}
