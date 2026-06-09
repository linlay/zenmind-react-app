import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '../../../shared/components/ScreenHeader';
import { AppIconButton } from '../../../shared/icons/AppIconButton';
import type { AppIconUsage } from '../../../shared/icons/AppIcon';
import { useT } from '../../../shared/i18n';
import { useAppThemeStyles } from '../../../shared/visual/AppThemeProvider';
import { appVisualTokens, type AppThemeTokens } from '../../../shared/visual/foundation';
import type { ChatDetailHeaderStatusTone } from '../chatDetailViewModel';

type ChatDetailHeaderProps = {
  title: string;
  subtitle: string;
  statusLabel: string;
  statusTone: ChatDetailHeaderStatusTone;
  onBack: () => void;
  onStartNewConversation: () => void;
  onOpenMenu: () => void;
};

function getStatusPillStyle(styles: ReturnType<typeof createStyles>, statusTone: ChatDetailHeaderStatusTone) {
  switch (statusTone) {
    case 'running':
      return styles.statusPill_running;
    case 'error':
      return styles.statusPill_error;
    default:
      return styles.statusPill_idle;
  }
}

function getStatusPillTextStyle(styles: ReturnType<typeof createStyles>, statusTone: ChatDetailHeaderStatusTone) {
  switch (statusTone) {
    case 'running':
      return styles.statusPillText_running;
    case 'error':
      return styles.statusPillText_error;
    default:
      return styles.statusPillText_idle;
  }
}

const HeaderIconButton = memo(function HeaderIconButton({
  usage,
  accessibilityLabel,
  onPress
}: {
  usage: AppIconUsage;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const styles = useAppThemeStyles(createStyles);

  return (
    <AppIconButton
      usage={usage}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={10}
      style={styles.headerActionButton}
      pressedStyle={styles.headerActionPressed}
    />
  );
});

const ChatDetailHeaderTitle = memo(function ChatDetailHeaderTitle({
  title,
  subtitle,
  statusLabel,
  statusTone
}: {
  title: string;
  subtitle: string;
  statusLabel: string;
  statusTone: ChatDetailHeaderStatusTone;
}) {
  const styles = useAppThemeStyles(createStyles);

  return (
    <View style={styles.headerTitleBlock}>
      <Text allowFontScaling={false} numberOfLines={1} style={styles.headerTitleText}>
        {title}
      </Text>
      {subtitle || statusLabel ? (
        <View style={styles.headerMetaRow}>
          {subtitle ? (
            <Text allowFontScaling={false} numberOfLines={1} style={styles.headerSubtitleText}>
              {subtitle}
            </Text>
          ) : null}
          {statusLabel ? (
            <View style={[styles.statusPill, getStatusPillStyle(styles, statusTone)]}>
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                style={[styles.statusPillText, getStatusPillTextStyle(styles, statusTone)]}
              >
                {statusLabel}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

export const ChatDetailHeader = memo(function ChatDetailHeader({
  title,
  subtitle,
  statusLabel,
  statusTone,
  onBack,
  onStartNewConversation,
  onOpenMenu
}: ChatDetailHeaderProps) {
  const t = useT();
  const styles = useAppThemeStyles(createStyles);
  const leftActions = useMemo(
    () =>
      [
        <HeaderIconButton
          key="back"
          usage="chatDetail.back"
          accessibilityLabel={t('chatDetail.back')}
          onPress={onBack}
        />,
        <HeaderIconButton
          key="new-conversation"
          usage="chatDetail.newConversation"
          accessibilityLabel={t('chatDetail.newConversation')}
          onPress={onStartNewConversation}
        />
      ] as const,
    [onBack, onStartNewConversation, t]
  );
  const rightActions = useMemo(
    () =>
      [
        <HeaderIconButton
          key="menu"
          usage="chatDetail.openHistory"
          accessibilityLabel={t('chatDetail.openHistory')}
          onPress={onOpenMenu}
        />
      ] as const,
    [onOpenMenu, t]
  );
  const headerTitle = useMemo(
    () => <ChatDetailHeaderTitle title={title} subtitle={subtitle} statusLabel={statusLabel} statusTone={statusTone} />,
    [statusLabel, statusTone, subtitle, title]
  );

  return (
    <ScreenHeader
      style={styles.detailHeader}
      titleContainerStyle={styles.titleContainer}
      leftActions={leftActions}
      title={headerTitle}
      rightActions={rightActions}
    />
  );
});

function createStyles(theme: AppThemeTokens) {
  return StyleSheet.create({
    detailHeader: {
      position: 'relative',
      height: 58,
      backgroundColor: theme.colors.background,
      borderBottomWidth: 0,
      zIndex: 20
    },
    titleContainer: {
      height: 58
    },
    headerActionButton: {
      width: 34,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center'
    },
    headerActionPressed: {
      opacity: 0.58
    },
    headerTitleBlock: {
      width: '100%',
      alignItems: 'center',
      gap: 2
    },
    headerTitleText: {
      fontSize: 18,
      lineHeight: 22,
      fontWeight: '600',
      color: theme.colors.textPrimary,
      textAlign: 'center'
    },
    headerSubtitleText: {
      flexShrink: 1,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
      color: theme.colors.textSecondary,
      textAlign: 'center'
    },
    headerMetaRow: {
      maxWidth: '100%',
      minHeight: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6
    },
    statusPill: {
      height: 18,
      borderRadius: appVisualTokens.radii.pill,
      paddingHorizontal: 7,
      alignItems: 'center',
      justifyContent: 'center'
    },
    statusPill_idle: {
      backgroundColor: theme.colors.surfaceMuted
    },
    statusPill_running: {
      backgroundColor: theme.colors.brandBlueSoft
    },
    statusPill_error: {
      backgroundColor: theme.colors.dangerSoft
    },
    statusPillText: {
      fontSize: 10,
      lineHeight: 13,
      fontWeight: '700'
    },
    statusPillText_idle: {
      color: theme.colors.textSecondary
    },
    statusPillText_running: {
      color: theme.colors.brandBlueStrong
    },
    statusPillText_error: {
      color: theme.colors.danger
    }
  });
}
