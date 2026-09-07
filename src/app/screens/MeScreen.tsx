import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { logoutCurrentDevice, readPreferredDeviceName, updatePreferredDeviceName } from '../../core/auth/appAuth';
import { MAX_DEVICE_NAME_LENGTH } from '../../core/auth/deviceNameModel';
import { getActiveDeviceProfile } from '../../core/auth/deviceProfiles';
import { useAppAccess } from '../../core/auth/useAppAccess';
import { getDefaultSourceConfig } from '../../core/config/appEnvironment';
import { notificationService } from '../../features/notifications/notificationService';
import { AppKeyboardAwareScrollView } from '../../shared/components/AppKeyboardAwareScrollView';
import { ScreenHeader } from '../../shared/components/ScreenHeader';
import { APP_VERSION, PRODUCT_NAME } from '../../shared/generated/brand';
import { type AppLocale, formatAccessExpiryLabel, type TFunction, useI18n } from '../../shared/i18n';
import { useAppTheme } from '../../shared/visual/AppThemeProvider';
import { getAvatarLabel, getAvatarTone } from '../../shared/visual/foundation';
import type { AppThemePreference } from '../../shared/visual/themePreference';
import {
  getDevelopmentDebugPanelSnapshot,
  openDevelopmentDebugPanel,
  subscribeDevelopmentDebugPanel
} from '../debug/developmentDebugPanel';
import type { RootStackParamList } from '../navigation/types';
import {
  MeAccountHeader,
  MeDeviceNameEditor,
  MeLogoutButton,
  MeScreenRow,
  type MeScreenRowModel,
  MeScreenSection
} from './MeScreenParts';

const DEBUG_TRIGGER_TAP_COUNT = 3;
const DEBUG_TRIGGER_RESET_MS = 1200;
const SCREEN_CLASS = 'flex-1 bg-app-background';
const HEADER_SAFE_AREA_CLASS = 'bg-app-surface';
const SCROLL_VIEW_CLASS = 'flex-1';
const CONTENT_CLASS = 'w-full pb-app-xxl';
const SECTION_STACK_CLASS = 'gap-app-lg px-app-lg pt-app-lg';

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

export function MeScreen() {
  const { locale, t } = useI18n();
  const { preference: themePreference } = useAppTheme();
  const access = useAppAccess();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const debugPanelEnabled = useSyncExternalStore(
    subscribeDevelopmentDebugPanel,
    getDevelopmentDebugPanelEnabledSnapshot,
    getDevelopmentDebugPanelEnabledSnapshot
  );
  const [isSubmittingLogout, setIsSubmittingLogout] = useState(false);
  const [isEditingDeviceName, setIsEditingDeviceName] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [deviceNameDraft, setDeviceNameDraft] = useState('');
  const [deviceNameError, setDeviceNameError] = useState('');
  const isMountedRef = useRef(true);
  const isPaired = access.status === 'ready' && access.pairingState === 'paired';
  const currentSession = isPaired ? access.pairedSession : null;
  const effectiveDeviceId = currentSession?.deviceId || access.defaultIdentity?.id || '';
  const defaultSource = useMemo(() => getDefaultSourceConfig(), []);
  const showLogout = isPaired;
  const activeConnectionUrl = getActiveConnectionUrl();
  const defaultConnectionUrl = defaultSource.wsUrl || defaultSource.apiBaseUrl;
  const handleVersionPress = useDevelopmentDebugVersionTrigger();
  const accountName = isPaired
    ? currentSession?.username || t('me.accountName.loggedOut')
    : t('me.accountName.default');
  const avatarTone = getAvatarTone(accountName);
  const sessionStateText = isPaired ? t('me.session.paired') : t('me.session.unpaired');
  const sessionSummary = isPaired ? t('me.description.paired') : t('me.description.unpaired');
  const modeLabel = __DEV__ ? t('me.value.dev') : t('me.value.prod');
  const handleOpenSettings = useCallback(() => {
    navigation.navigate('Settings');
  }, [navigation]);
  const handleOpenAgentWaitingDemo = useCallback(() => {
    navigation.navigate('AgentWaitingDemo');
  }, [navigation]);
  const handleOpenPairing = useCallback(() => {
    navigation.navigate('Login');
  }, [navigation]);
  const handleOpenDeviceNameEditor = useCallback(() => {
    setDeviceNameDraft(deviceName);
    setDeviceNameError('');
    setIsEditingDeviceName(true);
  }, [deviceName]);
  const handleCancelDeviceNameEditor = useCallback(() => {
    setDeviceNameDraft(deviceName);
    setDeviceNameError('');
    setIsEditingDeviceName(false);
  }, [deviceName]);
  const handleDeviceNameDraftChange = useCallback((value: string) => {
    setDeviceNameDraft(value);
    setDeviceNameError('');
  }, []);
  const handleSaveDeviceName = useCallback(() => {
    const normalizedDeviceName = deviceNameDraft.trim();
    if (!normalizedDeviceName) {
      setDeviceNameError(t('me.deviceName.error.required'));
      return;
    }
    if (normalizedDeviceName.length > MAX_DEVICE_NAME_LENGTH) {
      setDeviceNameError(t('me.deviceName.error.tooLong', { count: MAX_DEVICE_NAME_LENGTH }));
      return;
    }

    try {
      const savedDeviceName = updatePreferredDeviceName(normalizedDeviceName);
      setDeviceName(savedDeviceName);
      setDeviceNameDraft(savedDeviceName);
      setDeviceNameError('');
      setIsEditingDeviceName(false);
    } catch {
      setDeviceNameError(t('me.deviceName.error.saveFailed'));
    }
  }, [deviceNameDraft, t]);
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

  useEffect(() => {
    const nextDeviceName = currentSession?.deviceName || readPreferredDeviceName(effectiveDeviceId);
    setDeviceName(nextDeviceName);
    if (!isEditingDeviceName) {
      setDeviceNameDraft(nextDeviceName);
    }
  }, [currentSession?.deviceName, effectiveDeviceId, isEditingDeviceName]);

  const sessionRows = useMemo(() => {
    if (isPaired) {
      return [
        {
          key: 'pairingState',
          title: t('me.row.pairingState'),
          accessory: { kind: 'status', label: t('me.session.paired'), tone: 'positive' } as const
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
      ] satisfies MeScreenRowModel[];
    }

    return [
      {
        key: 'pairingState',
        title: t('me.row.pairingState'),
        accessory: { kind: 'status', label: t('me.session.unpaired'), tone: 'neutral' } as const
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
    ] satisfies MeScreenRowModel[];
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
          iconUsage: 'tab.me' as const,
          accessory: { kind: 'chevron' as const },
          onPress: handleOpenDeviceNameEditor
        },
        {
          key: 'deviceId',
          title: t('me.row.deviceId'),
          detail: formatDeviceId(effectiveDeviceId, t)
        },
        {
          key: 'platform',
          title: t('me.row.platform'),
          detail: formatPlatformName(Platform.OS, t)
        }
      ] satisfies MeScreenRowModel[],
    [effectiveDeviceId, deviceName, handleOpenDeviceNameEditor, t]
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
          value: modeLabel,
          valueTone: 'muted' as const
        }
      ] satisfies MeScreenRowModel[],
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
      ] satisfies MeScreenRowModel[],
    [debugPanelEnabled, handleOpenAgentWaitingDemo, handleOpenSettings, locale, t, themePreference]
  );

  return (
    <View className={SCREEN_CLASS}>
      <SafeAreaView edges={['top']} className={HEADER_SAFE_AREA_CLASS}>
        <ScreenHeader title={t('me.title')} />
      </SafeAreaView>

      <AppKeyboardAwareScrollView className={SCROLL_VIEW_CLASS} showsVerticalScrollIndicator={false}>
        <View className={CONTENT_CLASS}>
          <MeAccountHeader
            accountName={accountName}
            avatarLabel={getAvatarLabel(accountName)}
            avatarBackgroundColor={avatarTone.backgroundColor}
            avatarForegroundColor={avatarTone.foregroundColor}
            paired={isPaired}
            statusLabel={`${sessionStateText} · ${modeLabel}`}
            summary={sessionSummary}
          />

          <View className={SECTION_STACK_CLASS}>
            <MeScreenSection title={t('me.section.session')}>
              {sessionRows.map(({ key, ...row }, index) => (
                <MeScreenRow key={key} {...row} isFirst={index === 0} />
              ))}
            </MeScreenSection>

            <MeScreenSection title={t('me.section.device')}>
              {deviceRows.map(({ key, ...row }, index) => (
                <View key={key}>
                  <MeScreenRow {...row} isFirst={index === 0} />
                  {key === 'deviceName' && isEditingDeviceName ? (
                    <MeDeviceNameEditor
                      value={deviceNameDraft}
                      error={deviceNameError}
                      hint={t('me.deviceName.hint', { count: MAX_DEVICE_NAME_LENGTH })}
                      placeholder={t('me.deviceName.placeholder')}
                      cancelLabel={t('common.cancel')}
                      saveLabel={t('me.deviceName.save')}
                      maxLength={MAX_DEVICE_NAME_LENGTH}
                      onChangeText={handleDeviceNameDraftChange}
                      onCancel={handleCancelDeviceNameEditor}
                      onSave={handleSaveDeviceName}
                    />
                  ) : null}
                </View>
              ))}
            </MeScreenSection>

            <MeScreenSection title={t('me.section.actions')}>
              {actionRows.map(({ key, ...row }, index) => (
                <MeScreenRow key={key} {...row} isFirst={index === 0} />
              ))}
            </MeScreenSection>

            <MeScreenSection title={t('me.section.about')}>
              {aboutRows.map(({ key, ...row }, index) => (
                <MeScreenRow key={key} {...row} isFirst={index === 0} />
              ))}
            </MeScreenSection>

            {showLogout ? (
              <MeLogoutButton disabled={isSubmittingLogout} title={t('me.logout')} onPress={handleLogout} />
            ) : null}
          </View>
        </View>
      </AppKeyboardAwareScrollView>
    </View>
  );
}
