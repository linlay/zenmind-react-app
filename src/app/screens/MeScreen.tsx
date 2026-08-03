import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { memo, ReactNode, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { logoutCurrentDevice } from '../../core/auth/appAuth';
import { getActiveDeviceProfile } from '../../core/auth/deviceProfiles';
import { useAppAccess } from '../../core/auth/useAppAccess';
import { getDefaultSourceConfig } from '../../core/config/appEnvironment';
import { notificationService } from '../../features/notifications/notificationService';
import { ScreenHeader } from '../../shared/components/ScreenHeader';
import { APP_VERSION, PRODUCT_NAME } from '../../shared/generated/brand';
import { AppIcon, type AppIconUsage } from '../../shared/icons/AppIcon';
import { type AppLocale, formatAccessExpiryLabel, type TFunction, useI18n } from '../../shared/i18n';
import { useAppTheme } from '../../shared/visual/AppThemeProvider';
import { cn } from '../../shared/visual/className';
import { appVisualTokens, getAvatarLabel, getAvatarTone } from '../../shared/visual/foundation';
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
const SCREEN_CLASS = 'flex-1 bg-app-background-muted';
const HEADER_SAFE_AREA_CLASS = 'bg-app-surface';
const SCROLL_VIEW_CLASS = 'flex-1';
const CONTENT_CLASS = 'pb-app-xxl';
const PROFILE_HERO_CLASS = 'items-center border-b border-app-line bg-app-surface px-app-xl pb-app-xxl pt-app-xxl';
const AVATAR_CLASS = 'mb-app-lg h-[82px] w-[82px] items-center justify-center rounded-app-pill';
const AVATAR_TEXT_CLASS = 'text-app-hero font-extrabold';
const PROFILE_NAME_CLASS = 'max-w-full text-center text-app-display-sm font-extrabold text-app-primary';
const PROFILE_META_CLASS = 'mt-app-xs text-center text-[15px] font-semibold leading-[21px] text-app-secondary';
const PROFILE_SUMMARY_CLASS = 'mt-app-xs max-w-[300px] text-center text-[13px] leading-[19px] text-app-tertiary';
const SECTION_STACK_CLASS = 'gap-app-lg px-app-xl pt-app-lg';
const SECTION_CLASS = 'gap-app-sm';
const SECTION_TITLE_CLASS = 'ml-app-xs text-app-footnote font-bold text-app-secondary';
const SECTION_CARD_CLASS = 'overflow-hidden rounded-app-lg border border-app-line bg-app-surface';
const ROW_CLASS = 'min-h-[62px] flex-row items-center gap-app-md bg-app-surface px-app-lg py-app-md';
const ROW_PRESSABLE_CLASS = `${ROW_CLASS} active:bg-app-surface-muted`;
const ROW_DIVIDER_CLASS = 'border-t border-app-line';
const ROW_ICON_SHELL_CLASS = 'h-10 w-10 items-center justify-center rounded-app-md bg-app-surface-muted';
const ROW_TEXT_BLOCK_CLASS = 'min-w-0 flex-1 gap-0.5';
const ROW_TITLE_CLASS = 'text-[15px] font-bold leading-[21px] text-app-primary';
const ROW_DETAIL_CLASS = 'text-[13px] leading-[19px] text-app-secondary';
const ROW_DETAIL_LINK_CLASS = 'text-app-brand-blue';
const ROW_VALUE_CLASS = 'max-w-[132px] shrink text-right text-[15px] font-semibold leading-[21px] text-app-primary';
const ROW_VALUE_LINK_CLASS = 'text-app-brand-blue';
const ROW_VALUE_MUTED_CLASS = 'text-app-secondary';
const BADGE_CLASS =
  'min-h-[28px] justify-center rounded-app-sm border border-app-line-strong bg-app-brand-blue-soft px-app-sm';
const BADGE_TEXT_CLASS = 'text-app-footnote font-bold text-app-brand-blue';
const CHECK_CIRCLE_CLASS = 'h-[22px] w-[22px] items-center justify-center rounded-app-pill';
const CHEVRON_RIGHT_CLASS = 'rotate-180';
const LOGOUT_BUTTON_CLASS =
  'mb-app-lg min-h-[52px] items-center justify-center rounded-app-lg border border-app-danger-line bg-app-surface active:bg-app-danger-soft';
const LOGOUT_BUTTON_DISABLED_CLASS = 'opacity-[0.58]';
const LOGOUT_BUTTON_TEXT_CLASS = 'text-[16px] font-extrabold leading-[22px] text-app-danger';

function getDevelopmentDebugPanelEnabledSnapshot() {
  return getDevelopmentDebugPanelSnapshot().enabled;
}

function getActiveConnectionUrl(): string {
  const profile = getActiveDeviceProfile();
  if (profile?.transportKind === 'desktop-ws') {
    return profile.desktopWs?.wsUrl || '';
  }
  return '';
}

type RowAccessory = { kind: 'badge'; label: string } | { kind: 'check' } | { kind: 'copy' } | { kind: 'chevron' };

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
  return (
    <View className={SECTION_CLASS}>
      <Text className={SECTION_TITLE_CLASS}>{title}</Text>
      <View className={SECTION_CARD_CLASS}>{children}</View>
    </View>
  );
});

function RowAccessoryView({ accessory }: { accessory?: RowAccessory }) {
  const { theme } = useAppTheme();

  if (!accessory) {
    return null;
  }

  if (accessory.kind === 'badge') {
    return (
      <View className={BADGE_CLASS}>
        <Text className={BADGE_TEXT_CLASS}>{accessory.label}</Text>
      </View>
    );
  }

  if (accessory.kind === 'check') {
    return (
      <View className={CHECK_CIRCLE_CLASS}>
        <AppIcon usage="settings.selected" color={theme.colors.success} size={16} />
      </View>
    );
  }

  if (accessory.kind === 'copy') {
    return <AppIcon usage="timeline.copy" color={theme.colors.textSecondary} size={20} />;
  }

  return (
    <View className={CHEVRON_RIGHT_CLASS}>
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
  const rowClass = cn(onPress ? ROW_PRESSABLE_CLASS : ROW_CLASS, !isFirst && ROW_DIVIDER_CLASS);

  const content = (
    <>
      {iconUsage ? (
        <View className={ROW_ICON_SHELL_CLASS}>
          <AppIcon usage={iconUsage} color={theme.colors.textSecondary} size={22} />
        </View>
      ) : null}
      <View className={ROW_TEXT_BLOCK_CLASS}>
        <Text className={ROW_TITLE_CLASS} numberOfLines={1}>
          {title}
        </Text>
        {detail ? (
          <Text className={cn(ROW_DETAIL_CLASS, valueTone === 'link' && ROW_DETAIL_LINK_CLASS)} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text
          className={cn(
            ROW_VALUE_CLASS,
            valueTone === 'link' && ROW_VALUE_LINK_CLASS,
            valueTone === 'muted' && ROW_VALUE_MUTED_CLASS
          )}
          numberOfLines={1}
        >
          {value}
        </Text>
      ) : null}
      <RowAccessoryView accessory={accessory} />
    </>
  );

  if (!onPress) {
    return <View className={rowClass}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      className={rowClass}
    >
      {content}
    </Pressable>
  );
});

const LogoutButton = memo(function LogoutButton({ disabled, title, onPress }: LogoutButtonProps) {
  const { theme } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={cn(LOGOUT_BUTTON_CLASS, disabled && LOGOUT_BUTTON_DISABLED_CLASS)}
    >
      {disabled ? (
        <ActivityIndicator size="small" color={theme.colors.danger} />
      ) : (
        <Text className={LOGOUT_BUTTON_TEXT_CLASS}>{title}</Text>
      )}
    </Pressable>
  );
});

export function MeScreen() {
  const { locale, t } = useI18n();
  const { preference: themePreference } = useAppTheme();
  const access = useAppAccess();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tabBarHeight = useAppTabBarHeight();
  const debugPanelEnabled = useSyncExternalStore(
    subscribeDevelopmentDebugPanel,
    getDevelopmentDebugPanelEnabledSnapshot,
    getDevelopmentDebugPanelEnabledSnapshot
  );
  const [isSubmittingLogout, setIsSubmittingLogout] = useState(false);
  const isMountedRef = useRef(true);
  const isPaired = access.status === 'ready' && access.pairingState === 'paired';
  const currentSession = isPaired ? access.pairedSession : null;
  const defaultSource = useMemo(() => getDefaultSourceConfig(), []);
  const showLogout = isPaired;
  const activeConnectionUrl = getActiveConnectionUrl();
  const defaultConnectionUrl = defaultSource.wsUrl || defaultSource.apiBaseUrl;
  const handleVersionPress = useDevelopmentDebugVersionTrigger();
  const accountName = isPaired
    ? currentSession?.username || t('me.accountName.loggedOut')
    : t('me.accountName.default');
  const deviceName = currentSession?.deviceName || t('common.currentDevice');
  const avatarTone = getAvatarTone(accountName);
  const sessionStateText = isPaired ? t('me.session.paired') : t('me.session.unpaired');
  const sessionSummary = isPaired
    ? t('me.description.paired')
    : t('me.description.unpaired');
  const modeLabel = __DEV__ ? t('me.value.dev') : t('me.value.prod');
  const contentBottomPadding = tabBarHeight + appVisualTokens.spacing.xxl;
  const handleOpenSettings = useCallback(() => {
    navigation.navigate('Settings');
  }, [navigation]);
  const handleOpenAgentWaitingDemo = useCallback(() => {
    navigation.navigate('AgentWaitingDemo');
  }, [navigation]);
  const handleOpenPairing = useCallback(() => {
    navigation.navigate('Login');
  }, [navigation]);
  const handleCopyActiveConnectionUrl = useCallback(() => {
    if (!activeConnectionUrl) {
      return;
    }
    void Clipboard.setStringAsync(activeConnectionUrl).catch(() => {});
  }, [activeConnectionUrl]);
  const handleCopyDefaultConnectionUrl = useCallback(() => {
    if (!defaultConnectionUrl) {
      return;
    }
    void Clipboard.setStringAsync(defaultConnectionUrl).catch(() => {});
  }, [defaultConnectionUrl]);
  const handleLogout = useCallback(() => {
    if (isSubmittingLogout) {
      return;
    }

    setIsSubmittingLogout(true);
    void notificationService.clearRegistration().catch(() => {});
    logoutCurrentDevice()
      .catch(() => {})
      .finally(() => {
        if (isMountedRef.current) {
          setIsSubmittingLogout(false);
        }
      });
  }, [isSubmittingLogout]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const sessionRows = useMemo(() => {
    if (isPaired) {
      return [
        {
          key: 'pairingState',
          title: t('me.row.pairingState'),
          detail: t('me.session.paired'),
          accessory: { kind: 'check' } as const
        },
        {
          key: 'defaultSource',
          title: t('me.row.defaultSource'),
          detail: t('me.value.defaultAlongsidePaired', { name: defaultSource.displayName })
        },
        {
          key: 'accessExpiry',
          title: t('me.row.accessExpiry'),
          detail: currentSession
            ? formatAccessExpiryLabel(locale, t, currentSession.accessExpireAtMs)
            : t('common.noActiveSession')
        },
        {
          key: 'pairedService',
          title: t('me.row.pairedService'),
          detail: activeConnectionUrl || t('common.notConfigured'),
          valueTone: activeConnectionUrl ? ('link' as const) : ('muted' as const),
          accessory: activeConnectionUrl ? ({ kind: 'copy' } as const) : undefined,
          onPress: activeConnectionUrl ? handleCopyActiveConnectionUrl : undefined
        }
      ] satisfies MeRowModel[];
    }

    return [
      {
        key: 'pairingState',
        title: t('me.row.pairingState'),
        detail: t('me.session.unpaired'),
        accessory: { kind: 'badge', label: t('me.value.defaultMode') } as const
      },
      {
        key: 'defaultSource',
        title: t('me.row.defaultSource'),
        detail: defaultSource.displayName,
        accessory: { kind: 'check' } as const
      },
      {
        key: 'defaultService',
        title: t('me.row.defaultService'),
        detail: defaultConnectionUrl || t('common.notConfigured'),
        valueTone: defaultConnectionUrl ? ('link' as const) : ('muted' as const),
        accessory: defaultConnectionUrl ? ({ kind: 'copy' } as const) : undefined,
        onPress: defaultConnectionUrl ? handleCopyDefaultConnectionUrl : undefined
      },
      {
        key: 'pair',
        title: t('me.action.pair'),
        detail: t('me.action.pairDetail'),
        iconUsage: 'tab.me' as const,
        accessory: { kind: 'chevron' } as const,
        onPress: handleOpenPairing
      }
    ] satisfies MeRowModel[];
  }, [
    activeConnectionUrl,
    currentSession,
    defaultConnectionUrl,
    defaultSource.displayName,
    handleCopyActiveConnectionUrl,
    handleCopyDefaultConnectionUrl,
    handleOpenPairing,
    isPaired,
    locale,
    t
  ]);
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
          detail: formatDeviceId(currentSession?.deviceId || access.defaultIdentity?.id, t)
        },
        {
          key: 'platform',
          title: t('me.row.platform'),
          detail: formatPlatformName(Platform.OS, t)
        }
      ] satisfies MeRowModel[],
    [access.defaultIdentity?.id, currentSession?.deviceId, deviceName, t]
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
          key: 'waitingEffects',
          title: t('me.action.waitingEffects'),
          detail: t('me.action.waitingEffectsDetail'),
          iconUsage: 'settings.openPanel' as const,
          accessory: { kind: 'chevron' as const },
          onPress: handleOpenAgentWaitingDemo
        },
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
    [debugPanelEnabled, handleOpenAgentWaitingDemo, handleOpenSettings, locale, t, themePreference]
  );

  return (
    <View className={SCREEN_CLASS}>
      <SafeAreaView edges={['top']} className={HEADER_SAFE_AREA_CLASS}>
        <ScreenHeader title={t('me.title')} />
      </SafeAreaView>

      <ScrollView
        className={SCROLL_VIEW_CLASS}
        showsVerticalScrollIndicator={false}
      >
        <View className={CONTENT_CLASS} style={{ paddingBottom: contentBottomPadding }}>
          <View className={PROFILE_HERO_CLASS}>
            <View className={AVATAR_CLASS} style={{ backgroundColor: avatarTone.backgroundColor }}>
              <Text className={AVATAR_TEXT_CLASS} style={{ color: avatarTone.foregroundColor }}>
                {getAvatarLabel(accountName)}
              </Text>
            </View>
            <Text className={PROFILE_NAME_CLASS} numberOfLines={1}>
              {accountName}
            </Text>
            <Text className={PROFILE_META_CLASS} numberOfLines={2}>
              {sessionStateText} · {modeLabel}
            </Text>
            <Text className={PROFILE_SUMMARY_CLASS} numberOfLines={2}>
              {sessionSummary}
            </Text>
          </View>

          <View className={SECTION_STACK_CLASS}>
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

            {showLogout ? (
              <LogoutButton disabled={isSubmittingLogout} title={t('me.logout')} onPress={handleLogout} />
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
