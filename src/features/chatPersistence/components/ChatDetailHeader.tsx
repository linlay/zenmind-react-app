import { memo, useMemo } from 'react';
import { Text, View } from 'react-native';

import { ScreenHeader } from '../../../shared/components/ScreenHeader';
import { AppIconButton } from '../../../shared/icons/AppIconButton';
import type { AppIconUsage } from '../../../shared/icons/AppIcon';
import { useT } from '../../../shared/i18n';
import { cn } from '../../../shared/visual/className';
import type { ChatTimelineUsageSummary } from '../../chatTimeline/index.ts';
import {
  hasDisplayableChatTimelineUsageSummary,
  type ChatDetailHeaderStatusTone
} from '../chatDetailViewModel';
import type { ChatReasoningEffort } from '../types';
import { ChatUsageHeaderBadge } from './ChatUsageHeaderBadge';

type ChatDetailHeaderProps = {
  title: string;
  subtitle: string;
  statusLabel: string;
  statusTone: ChatDetailHeaderStatusTone;
  usageSummary: ChatTimelineUsageSummary | null;
  modelKey: string | null;
  reasoningEffort: ChatReasoningEffort | null;
  onBack: () => void;
  onStartNewConversation: () => void;
  onOpenMenu: () => void;
};

const CHAT_DETAIL_USAGE_ACTION_RAIL_WIDTH = 120;
const DETAIL_HEADER_CLASS = 'relative z-20 h-[58px] border-b-0 bg-app-background';
const DETAIL_TITLE_CONTAINER_CLASS = 'h-[58px]';
const HEADER_ACTION_BUTTON_CLASS = 'h-[34px] w-[34px] items-center justify-center active:opacity-[0.58]';
const HEADER_TITLE_BLOCK_CLASS = 'w-full items-center gap-[2px]';
const HEADER_TITLE_TEXT_CLASS = 'text-center text-[18px] font-semibold leading-[22px] text-app-primary';
const HEADER_META_ROW_CLASS = 'min-h-[18px] max-w-full flex-row items-center justify-center gap-[6px]';
const HEADER_SUBTITLE_TEXT_CLASS =
  'shrink text-center text-[12px] font-medium leading-[16px] text-app-secondary';
const STATUS_PILL_CLASS = 'h-[18px] items-center justify-center rounded-app-pill px-[7px]';
const STATUS_PILL_IDLE_CLASS = 'bg-app-surface-muted';
const STATUS_PILL_RUNNING_CLASS = 'bg-app-brand-blue-soft';
const STATUS_PILL_ERROR_CLASS = 'bg-app-danger-soft';
const STATUS_PILL_TEXT_CLASS = 'text-[10px] font-bold leading-[13px]';
const STATUS_PILL_TEXT_IDLE_CLASS = 'text-app-secondary';
const STATUS_PILL_TEXT_RUNNING_CLASS = 'text-app-brand-blue-strong';
const STATUS_PILL_TEXT_ERROR_CLASS = 'text-app-danger';

function getStatusPillClass(statusTone: ChatDetailHeaderStatusTone) {
  switch (statusTone) {
    case 'running':
      return STATUS_PILL_RUNNING_CLASS;
    case 'error':
      return STATUS_PILL_ERROR_CLASS;
    default:
      return STATUS_PILL_IDLE_CLASS;
  }
}

function getStatusPillTextClass(statusTone: ChatDetailHeaderStatusTone) {
  switch (statusTone) {
    case 'running':
      return STATUS_PILL_TEXT_RUNNING_CLASS;
    case 'error':
      return STATUS_PILL_TEXT_ERROR_CLASS;
    default:
      return STATUS_PILL_TEXT_IDLE_CLASS;
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
  return (
    <AppIconButton
      usage={usage}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={10}
      className={HEADER_ACTION_BUTTON_CLASS}
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
  return (
    <View className={HEADER_TITLE_BLOCK_CLASS}>
      <Text allowFontScaling={false} numberOfLines={1} className={HEADER_TITLE_TEXT_CLASS}>
        {title}
      </Text>
      {subtitle || statusLabel ? (
        <View className={HEADER_META_ROW_CLASS}>
          {subtitle ? (
            <Text allowFontScaling={false} numberOfLines={1} className={HEADER_SUBTITLE_TEXT_CLASS}>
              {subtitle}
            </Text>
          ) : null}
          {statusLabel ? (
            <View className={cn(STATUS_PILL_CLASS, getStatusPillClass(statusTone))}>
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                className={cn(STATUS_PILL_TEXT_CLASS, getStatusPillTextClass(statusTone))}
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
  usageSummary,
  modelKey,
  reasoningEffort,
  onBack,
  onStartNewConversation,
  onOpenMenu
}: ChatDetailHeaderProps) {
  const t = useT();
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
  const usageAction = useMemo(() => {
    if (!hasDisplayableChatTimelineUsageSummary(usageSummary)) {
      return null;
    }

    return (
      <ChatUsageHeaderBadge
        key="usage"
        usageSummary={usageSummary}
        modelKey={modelKey}
        reasoningEffort={reasoningEffort}
      />
    );
  }, [modelKey, reasoningEffort, usageSummary]);
  const rightActions = useMemo(
    () => {
      const historyAction = (
        <HeaderIconButton
          key="menu"
          usage="chatDetail.openHistory"
          accessibilityLabel={t('chatDetail.openHistory')}
          onPress={onOpenMenu}
        />
      );

      return usageAction ? ([usageAction, historyAction] as const) : ([historyAction] as const);
    },
    [onOpenMenu, t, usageAction]
  );
  const headerTitle = useMemo(
    () => <ChatDetailHeaderTitle title={title} subtitle={subtitle} statusLabel={statusLabel} statusTone={statusTone} />,
    [statusLabel, statusTone, subtitle, title]
  );

  return (
    <ScreenHeader
      className={DETAIL_HEADER_CLASS}
      titleContainerClassName={DETAIL_TITLE_CONTAINER_CLASS}
      leftActions={leftActions}
      title={headerTitle}
      rightActions={rightActions}
      actionRailWidth={usageAction ? CHAT_DETAIL_USAGE_ACTION_RAIL_WIDTH : undefined}
    />
  );
});
