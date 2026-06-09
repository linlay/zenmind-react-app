import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import appConfig from '../../../app.json';
import { getApiBaseUrl } from '../../core/api/apiClient';
import { logoutCurrentDevice } from '../../core/auth/appAuth';
import { isAuthRequired } from '../../core/auth/authConfig';
import { useAuthSession } from '../../core/auth/useAuthSession';
import { ChatHomeStorageDemo } from '../../features/chatPersistence/ChatHomeStorageDemo';
import { AgentTaskBoardScreen } from '../../features/agentTaskBoard/AgentTaskBoardScreen';
import { notificationService } from '../../features/notifications/notificationService';
import { AppIcon, type AppIconUsage } from '../../shared/icons/AppIcon';
import { formatAccessExpiryLabel, type TFunction, useI18n, useT } from '../../shared/i18n';
import { appVisualTokens, getAvatarLabel, getAvatarTone } from '../../shared/visual/foundation';
import { openDevelopmentDebugPanel } from '../debug/developmentDebugPanel';
import { AppScreenFrame } from './AppScreenFrame';

const DEBUG_TRIGGER_TAP_COUNT = 3;
const DEBUG_TRIGGER_RESET_MS = 1200;
const APP_DISPLAY_NAME = appConfig.expo.name || appConfig.expo.slug || 'zenmind-mobile';
const APP_VERSION = appConfig.expo.version || '0.0.0';

type TabScreenProps = {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
};

function TabScreen(props: TabScreenProps) {
  return <AppScreenFrame {...props} accentColor={appVisualTokens.colors.brandBlue} />;
}

type PreviewCardProps = {
  iconUsage: AppIconUsage;
  eyebrow: string;
  title: string;
  body: string;
};

function PreviewCard({ iconUsage, eyebrow, title, body }: PreviewCardProps) {
  return (
    <View style={styles.previewCard}>
      <View style={styles.previewIconShell}>
        <AppIcon usage={iconUsage} />
      </View>

      <View style={styles.previewTextBlock}>
        <Text style={styles.previewEyebrow}>{eyebrow}</Text>
        <Text style={styles.previewTitle}>{title}</Text>
        <Text style={styles.previewBody}>{body}</Text>
      </View>
    </View>
  );
}

type AccountInfoRowProps = {
  label: string;
  value: string;
  onPress?: () => void;
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

function AccountInfoRow({ label, value, onPress }: AccountInfoRowProps) {
  const content = (
    <>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.infoTextBlock}>
        <Text style={styles.infoValue} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable style={({ pressed }) => [styles.infoRow, pressed ? styles.infoRowPressed : null]} onPress={onPress}>
        {content}
      </Pressable>
    );
  }

  return <View style={styles.infoRow}>{content}</View>;
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

export function ChatScreen() {
  return <ChatHomeStorageDemo />;
}

export function TerminalScreen() {
  return <AgentTaskBoardScreen />;
}

export function DriveScreen() {
  const t = useT();

  return (
    <TabScreen eyebrow={t('drive.eyebrow')} title={t('drive.title')} description={t('drive.description')}>
      <View style={styles.previewStack}>
        <PreviewCard
          iconUsage="preview.driveFiles"
          eyebrow={t('drive.files.eyebrow')}
          title={t('drive.files.title')}
          body={t('drive.files.body')}
        />
        <PreviewCard
          iconUsage="preview.driveReference"
          eyebrow={t('drive.reference.eyebrow')}
          title={t('drive.reference.title')}
          body={t('drive.reference.body')}
        />
      </View>
    </TabScreen>
  );
}

export function MeScreen() {
  const { locale, t } = useI18n();
  const { session } = useAuthSession();
  const authRequired = isAuthRequired();
  const [isSubmittingLogout, setIsSubmittingLogout] = useState(false);
  const currentSession = session;
  const showLogout = authRequired && Boolean(currentSession);
  const apiBaseUrl = getApiBaseUrl();
  const handleVersionPress = useDevelopmentDebugVersionTrigger();
  const accountName = authRequired
    ? currentSession?.username || t('me.accountName.loggedOut')
    : t('common.localAccess');
  const deviceName = currentSession?.deviceName || t('common.currentDevice');
  const avatarTone = getAvatarTone(accountName);
  const sessionStateText = authRequired
    ? currentSession
      ? t('me.session.loggedIn')
      : t('me.session.loggedOut')
    : t('me.session.disabled');
  const sessionToneStyle = currentSession || !authRequired ? styles.statusDotSuccess : styles.statusDotMuted;
  const profileDescription = authRequired
    ? currentSession
      ? `${deviceName} · ${formatAccessExpiryLabel(locale, t, currentSession.accessExpireAtMs)}`
      : t('me.description.noSession')
    : t('me.description.authDisabled');

  return (
    <TabScreen eyebrow={t('me.eyebrow')} title={t('me.title')} description={profileDescription}>
      <View style={styles.accountStack}>
        <View style={styles.profileHeader}>
          <View
            style={[
              styles.profileAvatar,
              {
                backgroundColor: avatarTone.backgroundColor
              }
            ]}
          >
            <Text style={[styles.profileAvatarText, { color: avatarTone.foregroundColor }]}>
              {getAvatarLabel(accountName)}
            </Text>
          </View>

          <View style={styles.profileTextBlock}>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, sessionToneStyle]} />
              <Text style={styles.statusText}>{sessionStateText}</Text>
            </View>
            <Text style={styles.profileName} numberOfLines={1}>
              {accountName}
            </Text>
            <Text style={styles.profileMeta} numberOfLines={2}>
              {deviceName}
            </Text>
          </View>
        </View>

        <View style={styles.accountSection}>
          <Text style={styles.accountSectionTitle}>{t('me.section.session')}</Text>
          <AccountInfoRow
            label={t('me.row.authGate')}
            value={authRequired ? t('me.value.enabled') : t('me.value.disabled')}
          />
          <AccountInfoRow
            label={t('me.row.accessExpiry')}
            value={
              currentSession
                ? formatAccessExpiryLabel(locale, t, currentSession.accessExpireAtMs)
                : t('common.noActiveSession')
            }
          />
          <AccountInfoRow label={t('me.row.apiBaseUrl')} value={apiBaseUrl || t('common.notConfigured')} />
        </View>

        <View style={styles.accountSection}>
          <Text style={styles.accountSectionTitle}>{t('me.section.device')}</Text>
          <AccountInfoRow label={t('me.row.deviceName')} value={deviceName} />
          <AccountInfoRow label={t('me.row.deviceId')} value={formatDeviceId(currentSession?.deviceId, t)} />
          <AccountInfoRow label={t('me.row.platform')} value={formatPlatformName(Platform.OS, t)} />
        </View>

        <View style={styles.accountSection}>
          <Text style={styles.accountSectionTitle}>{t('me.section.about')}</Text>
          <AccountInfoRow label={t('me.row.app')} value={APP_DISPLAY_NAME} />
          <AccountInfoRow label={t('me.row.version')} value={`v${APP_VERSION}`} onPress={handleVersionPress} />
          <AccountInfoRow label={t('me.row.mode')} value={__DEV__ ? t('me.value.dev') : t('me.value.prod')} />
        </View>

        {showLogout ? (
          <View style={styles.accountSection}>
            <Text style={styles.accountSectionTitle}>{t('me.section.actions')}</Text>
            <Pressable
              disabled={isSubmittingLogout}
              onPress={() => {
                setIsSubmittingLogout(true);
                void notificationService.clearRegistration().catch(() => {});
                logoutCurrentDevice(apiBaseUrl)
                  .catch(() => {})
                  .finally(() => {
                    setIsSubmittingLogout(false);
                  });
              }}
              style={({ pressed }) => [
                styles.logoutButton,
                pressed && !isSubmittingLogout ? styles.logoutButtonPressed : null,
                isSubmittingLogout ? styles.logoutButtonDisabled : null
              ]}
            >
              {isSubmittingLogout ? (
                <ActivityIndicator size="small" color={appVisualTokens.colors.brandBlue} />
              ) : (
                <Text style={styles.logoutButtonText}>{t('me.logout')}</Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </View>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  previewStack: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: appVisualTokens.colors.line
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: appVisualTokens.spacing.lg,
    paddingVertical: appVisualTokens.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appVisualTokens.colors.line
  },
  previewIconShell: {
    width: 44,
    height: 44,
    borderRadius: appVisualTokens.radii.pill,
    backgroundColor: appVisualTokens.colors.brandBlueSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  previewTextBlock: {
    flex: 1,
    gap: 2,
    paddingTop: 2
  },
  previewEyebrow: {
    fontSize: 12,
    fontWeight: '600',
    color: appVisualTokens.colors.brandBlue
  },
  previewTitle: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '700',
    color: appVisualTokens.colors.textPrimary
  },
  previewBody: {
    fontSize: 14,
    lineHeight: 21,
    color: appVisualTokens.colors.textSecondary
  },
  accountStack: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: appVisualTokens.colors.line
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: appVisualTokens.spacing.lg,
    paddingVertical: appVisualTokens.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appVisualTokens.colors.line
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: appVisualTokens.radii.pill,
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileAvatarText: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800'
  },
  profileTextBlock: {
    flex: 1,
    gap: appVisualTokens.spacing.xs,
    minWidth: 0
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: appVisualTokens.spacing.sm,
    paddingHorizontal: appVisualTokens.spacing.sm,
    paddingVertical: appVisualTokens.spacing.xs,
    borderRadius: appVisualTokens.radii.pill,
    backgroundColor: appVisualTokens.colors.surfaceMuted
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: appVisualTokens.radii.pill
  },
  statusDotSuccess: {
    backgroundColor: appVisualTokens.colors.success
  },
  statusDotMuted: {
    backgroundColor: appVisualTokens.colors.textTertiary
  },
  statusText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: appVisualTokens.colors.textPrimary
  },
  profileName: {
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '800',
    color: appVisualTokens.colors.textPrimary
  },
  profileMeta: {
    fontSize: 15,
    lineHeight: 22,
    color: appVisualTokens.colors.textSecondary
  },
  accountSection: {
    paddingVertical: appVisualTokens.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appVisualTokens.colors.line
  },
  accountSectionTitle: {
    marginBottom: appVisualTokens.spacing.md,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: appVisualTokens.colors.brandBlue
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: appVisualTokens.spacing.lg,
    paddingVertical: appVisualTokens.spacing.sm
  },
  infoRowPressed: {
    opacity: 0.64
  },
  infoLabel: {
    width: 82,
    fontSize: 14,
    lineHeight: 21,
    color: appVisualTokens.colors.textSecondary
  },
  infoTextBlock: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  infoValue: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    color: appVisualTokens.colors.textPrimary
  },
  logoutButton: {
    minHeight: 46,
    borderRadius: appVisualTokens.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: appVisualTokens.colors.surface,
    borderWidth: 1,
    borderColor: appVisualTokens.colors.brandBlue
  },
  logoutButtonPressed: {
    opacity: 0.72
  },
  logoutButtonDisabled: {
    opacity: 0.5
  },
  logoutButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: appVisualTokens.colors.brandBlue
  }
});
