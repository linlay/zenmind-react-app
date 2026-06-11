import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { memo, ReactNode, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getApiBaseUrl } from '../../core/api/apiClient';
import { logoutCurrentDevice } from '../../core/auth/appAuth';
import { isAuthRequired } from '../../core/auth/authConfig';
import { useAuthSession } from '../../core/auth/useAuthSession';
import { notificationService } from '../../features/notifications/notificationService';
import { ScreenHeader } from '../../shared/components/ScreenHeader';
import { APP_VERSION, PRODUCT_NAME } from '../../shared/generated/brand';
import { AppIcon, type AppIconUsage } from '../../shared/icons/AppIcon';
import { type AppLocale, formatAccessExpiryLabel, type TFunction, useI18n } from '../../shared/i18n';
import { useAppTheme, useAppThemeStyles } from '../../shared/visual/AppThemeProvider';
import { appVisualTokens, getAvatarLabel, getAvatarTone, type AppThemeTokens } from '../../shared/visual/foundation';
import { useAppTabBarHeight } from '../../shared/visual/useAppTabBarHeight';
import type { AppThemePreference } from '../../shared/visual/themePreference';
import {
  getDevelopmentDebugPanelSnapshot,
  openDevelopmentDebugPanel,
  subscribeDevelopmentDebugPanel
} from '../debug/developmentDebugPanel';
import type { RootStackParamList } from '../navigation/types';

const DEBUG_TRIGGER_TAP_COUNT = 3;
const DEBUG_TRIGGER_RESET_MS = 1200;

function getDevelopmentDebugPanelEnabledSnapshot() {
  return getDevelopmentDebugPanelSnapshot().enabled;
}

type RowAccessory =
  | { kind: 'badge'; label: string }
  | { kind: 'check' }
  | { kind: 'copy' }
  | { kind: 'chevron' };

type MeRowModel = {
  key: string;
  title: string;
  detail?: string;
  value?: string;
  valueTone?: 'default' | 'link' | 'muted';
  iconUsage?: AppIconUsage;
  accessory?: RowAccessory;
  onPress?: () => void;
};

type MeSectionProps = {
  title: string;
  children: ReactNode;
};

type MeRowProps = Omit<MeRowModel, 'key'> & {
  isFirst?: boolean;
};

type LogoutButtonProps = {
  disabled: boolean;
  title: string;
  onPress: () => void;
};

function formatDeviceId(deviceId: string | undefined, t: TFunction): string {
  const normalized = String(deviceId || '').trim();
  if (!normalized) {
    return t('common.notReturned');
  }
  if (normalized.length <= 14) {
    return normalized;
  }
  return `${normalized.slice(0, 7)}...${normalized.slice(-5)}`;
}

function formatPlatformName(platform: string, t: TFunction): string {
  if (platform === 'ios') {
    return 'iOS';
  }
  if (platform === 'android') {
    return 'Android';
  }
  if (platform === 'web') {
    return 'Web';
  }
  return platform || t('common.unknown');
}

function formatLocaleName(locale: AppLocale, t: TFunction): string {
  if (locale === 'zh-CN') {
    return t('settings.language.zhCN');
  }
  if (locale === 'en-US') {
    return t('settings.language.enUS');
  }
  return locale;
}

function formatThemePreferenceName(preference: AppThemePreference, t: TFunction): string {
  if (preference === 'system') {
    return t('settings.theme.system');
  }

  return preference === 'dark' ? t('settings.theme.dark') : t('settings.theme.light');
}

function useDevelopmentDebugVersionTrigger() {
  const tapCountRef = useRef(0);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!__DEV__) {
      return;
    }

    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const openPanelAfterTripleTap = useCallback(() => {
    if (!__DEV__) {
      return;
    }

    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
    }

    tapCountRef.current += 1;
    if (tapCountRef.current >= DEBUG_TRIGGER_TAP_COUNT) {
      tapCountRef.current = 0;
      openDevelopmentDebugPanel();
      return;
    }

    resetTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
      resetTimerRef.current = null;
    }, DEBUG_TRIGGER_RESET_MS);
  }, []);

  return __DEV__ ? openPanelAfterTripleTap : undefined;
}

const MeSection = memo(function MeSection({ title, children }: MeSectionProps) {
  const styles = useAppThemeStyles(createStyles);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
});

function RowAccessoryView({ accessory }: { accessory?: RowAccessory }) {
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);

  if (!accessory) {
    return null;
  }

  if (accessory.kind === 'badge') {
    return (
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{accessory.label}</Text>
      </View>
    );
  }

  if (accessory.kind === 'check') {
    return (
      <View style={styles.checkCircle}>
        <AppIcon usage="settings.selected" color={theme.colors.success} size={16} />
      </View>
    );
  }

  if (accessory.kind === 'copy') {
    return <AppIcon usage="timeline.copy" color={theme.colors.textSecondary} size={20} />;
  }

  return (
    <View style={styles.chevronRight}>
      <AppIcon usage="chatDetail.back" color={theme.colors.textTertiary} size={20} />
    </View>
  );
}

const MeRow = memo(function MeRow({
  title,
  detail,
  value,
  valueTone = 'default',
  iconUsage,
  accessory,
  onPress,
  isFirst = false
}: MeRowProps) {
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);

  const content = (
    <>
      {iconUsage ? (
        <View style={styles.rowIconShell}>
          <AppIcon usage={iconUsage} color={theme.colors.textSecondary} size={22} />
        </View>
      ) : null}
      <View style={styles.rowTextBlock}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {detail ? (
          <Text style={[styles.rowDetail, valueTone === 'link' ? styles.rowDetailLink : null]} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text
          style={[
            styles.rowValue,
            valueTone === 'link' ? styles.rowValueLink : null,
            valueTone === 'muted' ? styles.rowValueMuted : null
          ]}
          numberOfLines={1}
        >
          {value}
        </Text>
      ) : null}
      <RowAccessoryView accessory={accessory} />
    </>
  );
  const rowStyle = [styles.row, isFirst ? null : styles.rowDivider];

  if (!onPress) {
    return <View style={rowStyle}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [rowStyle, pressed ? styles.rowPressed : null]}
    >
      {content}
    </Pressable>
  );
});

const LogoutButton = memo(function LogoutButton({ disabled, title, onPress }: LogoutButtonProps) {
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.logoutButton,
        pressed && !disabled ? styles.logoutButtonPressed : null,
        disabled ? styles.logoutButtonDisabled : null
      ]}
    >
      {disabled ? (
        <ActivityIndicator size="small" color={theme.colors.danger} />
      ) : (
        <Text style={styles.logoutButtonText}>{title}</Text>
      )}
    </Pressable>
  );
});

export function MeScreen() {
  const { locale, t } = useI18n();
  const { preference: themePreference } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const { session } = useAuthSession();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tabBarHeight = useAppTabBarHeight();
  const debugPanelEnabled = useSyncExternalStore(
    subscribeDevelopmentDebugPanel,
    getDevelopmentDebugPanelEnabledSnapshot,
    getDevelopmentDebugPanelEnabledSnapshot
  );
  const authRequired = isAuthRequired();
  const [isSubmittingLogout, setIsSubmittingLogout] = useState(false);
  const isMountedRef = useRef(true);
  const currentSession = session;
  const showLogout = authRequired && Boolean(currentSession);
  const apiBaseUrl = getApiBaseUrl();
  const normalizedApiBaseUrl = apiBaseUrl.trim();
  const handleVersionPress = useDevelopmentDebugVersionTrigger();
  const accountName = authRequired ? currentSession?.username || t('me.accountName.loggedOut') : t('common.localAccess');
  const deviceName = currentSession?.deviceName || t('common.currentDevice');
  const avatarTone = getAvatarTone(accountName);
  const sessionStateText = authRequired
    ? currentSession
      ? t('me.session.loggedIn')
      : t('me.session.loggedOut')
    : t('me.session.disabled');
  const sessionSummary = authRequired
    ? currentSession
      ? formatAccessExpiryLabel(locale, t, currentSession.accessExpireAtMs)
      : t('me.description.noSession')
    : t('me.description.authDisabled');
  const modeLabel = __DEV__ ? t('me.value.dev') : t('me.value.prod');
  const contentBottomPadding = tabBarHeight + appVisualTokens.spacing.xxl;
  const handleOpenSettings = useCallback(() => {
    navigation.navigate('Settings');
  }, [navigation]);
  const handleCopyServiceUrl = useCallback(() => {
    if (!normalizedApiBaseUrl) {
      return;
    }
    void Clipboard.setStringAsync(normalizedApiBaseUrl).catch(() => {});
  }, [normalizedApiBaseUrl]);
  const handleLogout = useCallback(() => {
    if (isSubmittingLogout) {
      return;
    }

    setIsSubmittingLogout(true);
    void notificationService.clearRegistration().catch(() => {});
    logoutCurrentDevice(apiBaseUrl)
      .catch(() => {})
      .finally(() => {
        if (isMountedRef.current) {
          setIsSubmittingLogout(false);
        }
      });
  }, [apiBaseUrl, isSubmittingLogout]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const sessionRows = useMemo(
    () =>
      [
        {
          key: 'authGate',
          title: t('me.row.authGate'),
          detail: authRequired ? t('me.value.enabled') : t('me.value.disabled'),
          accessory: authRequired ? ({ kind: 'check' } as const) : undefined
        },
        {
          key: 'accessExpiry',
          title: t('me.row.accessExpiry'),
          detail: currentSession
            ? formatAccessExpiryLabel(locale, t, currentSession.accessExpireAtMs)
            : t('common.noActiveSession')
        },
        {
          key: 'apiBaseUrl',
          title: t('me.row.apiBaseUrl'),
          detail: normalizedApiBaseUrl || t('common.notConfigured'),
          valueTone: normalizedApiBaseUrl ? ('link' as const) : ('muted' as const),
          accessory: normalizedApiBaseUrl ? ({ kind: 'copy' } as const) : undefined,
          onPress: normalizedApiBaseUrl ? handleCopyServiceUrl : undefined
        }
      ] satisfies MeRowModel[],
    [authRequired, currentSession, handleCopyServiceUrl, locale, normalizedApiBaseUrl, t]
  );
  const deviceRows = useMemo(
    () =>
      [
        {
          key: 'deviceName',
          title: t('me.row.deviceName'),
          detail: deviceName,
          iconUsage: 'tab.me' as const
        },
        {
          key: 'deviceId',
          title: t('me.row.deviceId'),
          detail: formatDeviceId(currentSession?.deviceId, t)
        },
        {
          key: 'platform',
          title: t('me.row.platform'),
          detail: formatPlatformName(Platform.OS, t)
        }
      ] satisfies MeRowModel[],
    [currentSession?.deviceId, deviceName, t]
  );
  const aboutRows = useMemo(
    () =>
      [
        {
          key: 'app',
          title: t('me.row.app'),
          value: PRODUCT_NAME,
          valueTone: 'muted' as const
        },
        {
          key: 'version',
          title: t('me.row.version'),
          value: `v${APP_VERSION}`,
          valueTone: 'muted' as const,
          onPress: handleVersionPress
        },
        {
          key: 'mode',
          title: t('me.row.mode'),
          accessory: { kind: 'badge' as const, label: modeLabel }
        }
      ] satisfies MeRowModel[],
    [handleVersionPress, modeLabel, t]
  );
  const actionRows = useMemo(
    () =>
      [
        {
          key: 'cache',
          title: t('me.action.cacheManagement'),
          iconUsage: 'settings.cache' as const,
          accessory: { kind: 'chevron' as const },
          onPress: handleOpenSettings
        },
        {
          key: 'developer',
          title: t('me.action.developerMode'),
          value: __DEV__ && debugPanelEnabled ? t('settings.value.enabled') : t('settings.value.disabled'),
          valueTone: 'muted' as const,
          iconUsage: 'settings.developer' as const,
          accessory: { kind: 'chevron' as const },
          onPress: handleOpenSettings
        },
        {
          key: 'theme',
          title: t('me.action.themeSettings'),
          value: formatThemePreferenceName(themePreference, t),
          valueTone: 'muted' as const,
          iconUsage: 'settings.theme' as const,
          accessory: { kind: 'chevron' as const },
          onPress: handleOpenSettings
        },
        {
          key: 'language',
          title: t('me.action.languageSettings'),
          value: formatLocaleName(locale, t),
          valueTone: 'muted' as const,
          iconUsage: 'settings.language' as const,
          accessory: { kind: 'chevron' as const },
          onPress: handleOpenSettings
        }
      ] satisfies MeRowModel[],
    [debugPanelEnabled, handleOpenSettings, locale, t, themePreference]
  );

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <ScreenHeader title={t('me.title')} />
      </SafeAreaView>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: contentBottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileHero}>
          <View style={[styles.avatar, { backgroundColor: avatarTone.backgroundColor }]}>
            <Text style={[styles.avatarText, { color: avatarTone.foregroundColor }]}>{getAvatarLabel(accountName)}</Text>
          </View>
          <Text style={styles.profileName} numberOfLines={1}>
            {accountName}
          </Text>
          <Text style={styles.profileMeta} numberOfLines={2}>
            {sessionStateText} · {modeLabel}
          </Text>
          <Text style={styles.profileSummary} numberOfLines={2}>
            {sessionSummary}
          </Text>
        </View>

        <View style={styles.sectionStack}>
          <MeSection title={t('me.section.session')}>
            {sessionRows.map(({ key, ...row }, index) => (
              <MeRow key={key} {...row} isFirst={index === 0} />
            ))}
          </MeSection>

          <MeSection title={t('me.section.device')}>
            {deviceRows.map(({ key, ...row }, index) => (
              <MeRow key={key} {...row} isFirst={index === 0} />
            ))}
          </MeSection>

          <MeSection title={t('me.section.about')}>
            {aboutRows.map(({ key, ...row }, index) => (
              <MeRow key={key} {...row} isFirst={index === 0} />
            ))}
          </MeSection>

          <MeSection title={t('me.section.actions')}>
            {actionRows.map(({ key, ...row }, index) => (
              <MeRow key={key} {...row} isFirst={index === 0} />
            ))}
          </MeSection>

          {showLogout ? <LogoutButton disabled={isSubmittingLogout} title={t('me.logout')} onPress={handleLogout} /> : null}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppThemeTokens) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.backgroundMuted
    },
    headerSafeArea: {
      backgroundColor: theme.colors.surface
    },
    scrollView: {
      flex: 1
    },
    content: {
      paddingBottom: appVisualTokens.spacing.xxl
    },
    profileHero: {
      alignItems: 'center',
      paddingHorizontal: appVisualTokens.spacing.xl,
      paddingTop: appVisualTokens.spacing.xxl,
      paddingBottom: appVisualTokens.spacing.xxl,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.line
    },
    avatar: {
      width: 82,
      height: 82,
      borderRadius: appVisualTokens.radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: appVisualTokens.spacing.lg
    },
    avatarText: {
      fontSize: 32,
      lineHeight: 38,
      fontWeight: '800'
    },
    profileName: {
      maxWidth: '100%',
      fontSize: 24,
      lineHeight: 30,
      fontWeight: '800',
      color: theme.colors.textPrimary,
      textAlign: 'center'
    },
    profileMeta: {
      marginTop: appVisualTokens.spacing.xs,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      textAlign: 'center'
    },
    profileSummary: {
      maxWidth: 300,
      marginTop: appVisualTokens.spacing.xs,
      fontSize: 13,
      lineHeight: 19,
      color: theme.colors.textTertiary,
      textAlign: 'center'
    },
    sectionStack: {
      paddingHorizontal: appVisualTokens.spacing.xl,
      paddingTop: appVisualTokens.spacing.lg,
      gap: appVisualTokens.spacing.lg
    },
    section: {
      gap: appVisualTokens.spacing.sm
    },
    sectionTitle: {
      marginLeft: appVisualTokens.spacing.xs,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '700',
      color: theme.colors.textSecondary
    },
    sectionCard: {
      overflow: 'hidden',
      borderRadius: appVisualTokens.radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface
    },
    row: {
      minHeight: 62,
      flexDirection: 'row',
      alignItems: 'center',
      gap: appVisualTokens.spacing.md,
      paddingHorizontal: appVisualTokens.spacing.lg,
      paddingVertical: appVisualTokens.spacing.md,
      backgroundColor: theme.colors.surface
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.line
    },
    rowPressed: {
      backgroundColor: theme.colors.surfaceMuted
    },
    rowIconShell: {
      width: 40,
      height: 40,
      borderRadius: appVisualTokens.radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceMuted
    },
    rowTextBlock: {
      flex: 1,
      minWidth: 0,
      gap: 2
    },
    rowTitle: {
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '700',
      color: theme.colors.textPrimary
    },
    rowDetail: {
      fontSize: 13,
      lineHeight: 19,
      color: theme.colors.textSecondary
    },
    rowDetailLink: {
      color: theme.colors.brandBlue
    },
    rowValue: {
      maxWidth: 132,
      flexShrink: 1,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '600',
      color: theme.colors.textPrimary,
      textAlign: 'right'
    },
    rowValueLink: {
      color: theme.colors.brandBlue
    },
    rowValueMuted: {
      color: theme.colors.textSecondary
    },
    badge: {
      minHeight: 28,
      justifyContent: 'center',
      paddingHorizontal: appVisualTokens.spacing.sm,
      borderRadius: appVisualTokens.radii.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.lineStrong,
      backgroundColor: theme.colors.brandBlueSoft
    },
    badgeText: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '700',
      color: theme.colors.brandBlue
    },
    checkCircle: {
      width: 22,
      height: 22,
      borderRadius: appVisualTokens.radii.pill,
      alignItems: 'center',
      justifyContent: 'center'
    },
    chevronRight: {
      transform: [{ rotate: '180deg' }]
    },
    logoutButton: {
      minHeight: 52,
      marginBottom: appVisualTokens.spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: appVisualTokens.radii.lg,
      borderWidth: 1,
      borderColor: theme.colors.dangerLine,
      backgroundColor: theme.colors.surface
    },
    logoutButtonPressed: {
      backgroundColor: theme.colors.dangerSoft
    },
    logoutButtonDisabled: {
      opacity: 0.58
    },
    logoutButtonText: {
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '800',
      color: theme.colors.danger
    }
  });
}
