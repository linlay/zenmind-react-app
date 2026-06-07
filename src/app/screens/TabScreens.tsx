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

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(timestamp) || Number.isNaN(date.getTime())) {
    return '未同步';
  }

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(
    date.getHours()
  )}:${pad2(date.getMinutes())}`;
}

function formatAccessExpiry(timestamp: number | undefined): string {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return '未同步';
  }

  const remainingMs = timestamp - Date.now();
  const dateText = formatDateTime(timestamp);
  if (remainingMs <= 0) {
    return `已过期 · ${dateText}`;
  }

  const remainingMinutes = Math.ceil(remainingMs / 60_000);
  if (remainingMinutes < 60) {
    return `${remainingMinutes} 分钟后 · ${dateText}`;
  }

  const remainingHours = Math.ceil(remainingMinutes / 60);
  if (remainingHours < 24) {
    return `${remainingHours} 小时后 · ${dateText}`;
  }

  return `${Math.ceil(remainingHours / 24)} 天后 · ${dateText}`;
}

function formatDeviceId(deviceId: string | undefined): string {
  const normalized = String(deviceId || '').trim();
  if (!normalized) {
    return '未返回';
  }
  if (normalized.length <= 14) {
    return normalized;
  }
  return `${normalized.slice(0, 7)}...${normalized.slice(-5)}`;
}

function formatPlatformName(platform: string): string {
  if (platform === 'ios') {
    return 'iOS';
  }
  if (platform === 'android') {
    return 'Android';
  }
  if (platform === 'web') {
    return 'Web';
  }
  return platform || '未知';
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
      <Pressable
        style={({ pressed }) => [styles.infoRow, pressed ? styles.infoRowPressed : null]}
        onPress={onPress}
      >
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
  return (
    <TabScreen
      eyebrow="Drive"
      title="网盘"
      description="文件、目录和预览区域先沿用统一的产品语气，后续再接入真实同步、上传和引用链路。"
    >
      <View style={styles.previewStack}>
        <PreviewCard
          iconUsage="preview.driveFiles"
          eyebrow="文件"
          title="最近文件、目录层级和预览统一承接"
          body="首页继续偏浏览与选择，减少在移动端堆砌过重的控制栏。"
        />
        <PreviewCard
          iconUsage="preview.driveReference"
          eyebrow="引用"
          title="文件与对话链路自然连通"
          body="后续可以把上传、引用和分享动作接到这里，不打断整体视觉语言。"
        />
      </View>
    </TabScreen>
  );
}

export function MeScreen() {
  const { session } = useAuthSession();
  const authRequired = isAuthRequired();
  const [isSubmittingLogout, setIsSubmittingLogout] = useState(false);
  const currentSession = session;
  const showLogout = authRequired && Boolean(currentSession);
  const apiBaseUrl = getApiBaseUrl();
  const handleVersionPress = useDevelopmentDebugVersionTrigger();
  const accountName = authRequired ? currentSession?.username || '未登录' : '本地访问';
  const deviceName = currentSession?.deviceName || '当前设备';
  const avatarTone = getAvatarTone(accountName);
  const sessionStateText = authRequired ? (currentSession ? '已登录' : '未登录') : '无需登录';
  const sessionToneStyle =
    currentSession || !authRequired ? styles.statusDotSuccess : styles.statusDotMuted;
  const profileDescription = authRequired
    ? currentSession
      ? `${deviceName} · ${formatAccessExpiry(currentSession.accessExpireAtMs)}`
      : '当前没有活动登录会话。'
    : '认证门卫已关闭。';

  return (
    <TabScreen eyebrow="Account" title="用户" description={profileDescription}>
      <View style={styles.accountStack}>
        <View style={styles.profileHeader}>
          <View
            style={[
              styles.profileAvatar,
              {
                backgroundColor: avatarTone.backgroundColor,
              },
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
          <Text style={styles.accountSectionTitle}>会话</Text>
          <AccountInfoRow label="登录门卫" value={authRequired ? '已开启' : '已关闭'} />
          <AccountInfoRow
            label="访问有效期"
            value={
              currentSession ? formatAccessExpiry(currentSession.accessExpireAtMs) : '无活动会话'
            }
          />
          <AccountInfoRow label="服务地址" value={apiBaseUrl || '未配置'} />
        </View>

        <View style={styles.accountSection}>
          <Text style={styles.accountSectionTitle}>设备</Text>
          <AccountInfoRow label="设备名称" value={deviceName} />
          <AccountInfoRow label="设备 ID" value={formatDeviceId(currentSession?.deviceId)} />
          <AccountInfoRow label="平台" value={formatPlatformName(Platform.OS)} />
        </View>

        <View style={styles.accountSection}>
          <Text style={styles.accountSectionTitle}>关于</Text>
          <AccountInfoRow label="应用" value={APP_DISPLAY_NAME} />
          <AccountInfoRow label="版本" value={`v${APP_VERSION}`} onPress={handleVersionPress} />
          <AccountInfoRow label="模式" value={__DEV__ ? '开发版' : '正式版'} />
        </View>

        {showLogout ? (
          <View style={styles.accountSection}>
            <Text style={styles.accountSectionTitle}>操作</Text>
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
                isSubmittingLogout ? styles.logoutButtonDisabled : null,
              ]}
            >
              {isSubmittingLogout ? (
                <ActivityIndicator size="small" color={appVisualTokens.colors.brandBlue} />
              ) : (
                <Text style={styles.logoutButtonText}>退出当前设备</Text>
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
    borderTopColor: appVisualTokens.colors.line,
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: appVisualTokens.spacing.lg,
    paddingVertical: appVisualTokens.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appVisualTokens.colors.line,
  },
  previewIconShell: {
    width: 44,
    height: 44,
    borderRadius: appVisualTokens.radii.pill,
    backgroundColor: appVisualTokens.colors.brandBlueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTextBlock: {
    flex: 1,
    gap: 2,
    paddingTop: 2,
  },
  previewEyebrow: {
    fontSize: 12,
    fontWeight: '600',
    color: appVisualTokens.colors.brandBlue,
  },
  previewTitle: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '700',
    color: appVisualTokens.colors.textPrimary,
  },
  previewBody: {
    fontSize: 14,
    lineHeight: 21,
    color: appVisualTokens.colors.textSecondary,
  },
  accountStack: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: appVisualTokens.colors.line,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: appVisualTokens.spacing.lg,
    paddingVertical: appVisualTokens.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appVisualTokens.colors.line,
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: appVisualTokens.radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
  },
  profileTextBlock: {
    flex: 1,
    gap: appVisualTokens.spacing.xs,
    minWidth: 0,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: appVisualTokens.spacing.sm,
    paddingHorizontal: appVisualTokens.spacing.sm,
    paddingVertical: appVisualTokens.spacing.xs,
    borderRadius: appVisualTokens.radii.pill,
    backgroundColor: appVisualTokens.colors.surfaceMuted,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: appVisualTokens.radii.pill,
  },
  statusDotSuccess: {
    backgroundColor: appVisualTokens.colors.success,
  },
  statusDotMuted: {
    backgroundColor: appVisualTokens.colors.textTertiary,
  },
  statusText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: appVisualTokens.colors.textPrimary,
  },
  profileName: {
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '800',
    color: appVisualTokens.colors.textPrimary,
  },
  profileMeta: {
    fontSize: 15,
    lineHeight: 22,
    color: appVisualTokens.colors.textSecondary,
  },
  accountSection: {
    paddingVertical: appVisualTokens.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appVisualTokens.colors.line,
  },
  accountSectionTitle: {
    marginBottom: appVisualTokens.spacing.md,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: appVisualTokens.colors.brandBlue,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: appVisualTokens.spacing.lg,
    paddingVertical: appVisualTokens.spacing.sm,
  },
  infoRowPressed: {
    opacity: 0.64,
  },
  infoLabel: {
    width: 82,
    fontSize: 14,
    lineHeight: 21,
    color: appVisualTokens.colors.textSecondary,
  },
  infoTextBlock: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  infoValue: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    color: appVisualTokens.colors.textPrimary,
  },
  logoutButton: {
    minHeight: 46,
    borderRadius: appVisualTokens.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: appVisualTokens.colors.surface,
    borderWidth: 1,
    borderColor: appVisualTokens.colors.brandBlue,
  },
  logoutButtonPressed: {
    opacity: 0.72,
  },
  logoutButtonDisabled: {
    opacity: 0.5,
  },
  logoutButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: appVisualTokens.colors.brandBlue,
  },
});
