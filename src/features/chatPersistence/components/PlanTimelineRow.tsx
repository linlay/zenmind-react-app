import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useConversationPreviewRowActive } from '../../../shared/components/conversationPreview/ConversationPreviewProvider.tsx';
import { AppIcon } from '../../../shared/icons/AppIcon.tsx';
import { useT, type I18nKey } from '../../../shared/i18n/index.ts';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider.tsx';
import { cn } from '../../../shared/visual/className.ts';
import type { AppVisualColors } from '../../../shared/visual/foundation.ts';
import type {
  ChatTimelinePlanNode,
  ChatTimelinePlanStatus,
  ChatTimelinePlanStep,
} from '../../chatTimeline/index.ts';
import { formatChatDetailDuration } from '../chatDetailFormatters.ts';
import { ChatTimelineRail } from './ChatTimelineRail.tsx';
import { useRunningElapsedMs } from './useRunningElapsedMs.ts';

type PlanTimelineRowProps = {
  node: ChatTimelinePlanNode;
  isLastInRun: boolean;
  getInitialExpanded: (nodeId: string, fallback: boolean) => boolean;
  onExpandedChange: (nodeId: string, expanded: boolean) => void;
};

const STATUS_KEYS: Record<ChatTimelinePlanStatus, I18nKey> = {
  pending: 'plan.status.pending',
  running: 'plan.status.running',
  completed: 'plan.status.completed',
  failed: 'plan.status.failed',
  cancelled: 'plan.status.cancelled',
};

const ROW_CLASS = 'mb-4 flex-row items-stretch gap-2';
const BODY_CLASS = 'min-w-0 flex-1 gap-[7px]';
const HEADER_CLASS =
  'min-h-[38px] flex-row items-center gap-app-sm rounded-app-sm px-app-xs active:bg-app-surface-muted';
const HEADER_TEXT_CLASS = 'min-w-0 flex-1 gap-[2px]';
const TITLE_ROW_CLASS = 'min-w-0 flex-row items-center gap-app-sm';
const TITLE_CLASS = 'min-w-0 flex-1 text-[14px] font-bold leading-5 text-app-primary';
const PROGRESS_CLASS =
  'shrink-0 rounded-app-pill bg-app-brand-soft px-[8px] py-[3px] text-[11px] font-bold leading-[15px] text-app-brand-blue';
const META_CLASS = 'text-app-caption leading-[17px] text-app-secondary';
const CURRENT_CLASS = 'text-app-footnote leading-[18px] text-app-secondary';
const CARD_CLASS = 'overflow-hidden rounded-app-md border border-app-line bg-app-surface';
const STEP_CLASS = 'flex-row gap-app-sm border-b border-app-line px-app-md py-[10px]';
const STEP_LAST_CLASS = 'border-b-0';
const STEP_DOT_CLASS = 'mt-[6px] h-[8px] w-[8px] shrink-0 rounded-app-pill';
const STEP_BODY_CLASS = 'min-w-0 flex-1 gap-[2px]';
const STEP_TITLE_ROW_CLASS = 'min-w-0 flex-row items-start gap-app-sm';
const STEP_TITLE_CLASS =
  'min-w-0 flex-1 text-app-footnote font-semibold leading-[18px] text-app-primary';
const STEP_STATUS_CLASS = 'shrink-0 text-[11px] font-bold leading-[16px]';
const STEP_DURATION_CLASS = 'text-[11px] leading-[16px] tabular-nums text-app-tertiary';
const STEP_ERROR_CLASS = 'text-app-caption font-semibold leading-[17px] text-app-danger';
const SUMMARY_CLASS = 'gap-[3px] border-t border-app-line px-app-md py-[10px]';
const SUMMARY_LABEL_CLASS = 'text-[11px] font-bold leading-[16px] text-app-success';
const SUMMARY_TEXT_CLASS = 'text-app-footnote leading-[18px] text-app-secondary';
const ERROR_CLASS =
  'border-t border-app-danger-line bg-app-danger-soft px-app-md py-[9px] text-app-footnote font-semibold leading-[18px] text-app-danger';
const EMPTY_CLASS = 'px-app-md py-app-lg text-center text-app-footnote text-app-tertiary';
const FOLD_CLASS = 'h-[28px] w-[28px] shrink-0 items-center justify-center rounded-app-sm';

function statusColor(status: ChatTimelinePlanStatus, colors: AppVisualColors): string {
  if (status === 'completed') {
    return colors.success;
  }
  if (status === 'failed') {
    return colors.danger;
  }
  if (status === 'running') {
    return colors.brandBlue;
  }
  if (status === 'cancelled') {
    return colors.warning;
  }
  return colors.textTertiary;
}

function stepDurationMs(step: ChatTimelinePlanStep, now: number | null): number | null {
  if (step.status === 'running' && step.startedAt !== null && now !== null) {
    return Math.max(0, now - step.startedAt);
  }
  return step.durationMs;
}

export const PlanTimelineRow = memo(function PlanTimelineRow({
  node,
  isLastInRun,
  getInitialExpanded,
  onExpandedChange,
}: PlanTimelineRowProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const rowActive = useConversationPreviewRowActive();
  const defaultExpanded = node.status === 'running' || node.status === 'failed';
  const [expanded, setExpanded] = useState(() => getInitialExpanded(node.id, defaultExpanded));
  const currentStep = useMemo(
    () =>
      node.steps.find((step) => step.status === 'running') ??
      node.steps.find((step) => step.status === 'pending') ??
      null,
    [node.steps],
  );
  const clockStartedAt = node.startedAt ?? currentStep?.startedAt ?? null;
  const elapsedMs = useRunningElapsedMs(clockStartedAt, rowActive && node.status === 'running');
  const now = elapsedMs !== null && clockStartedAt !== null ? clockStartedAt + elapsedMs : null;
  const durationMs =
    node.status === 'running' && node.startedAt !== null && now !== null
      ? Math.max(0, now - node.startedAt)
      : node.durationMs;
  const duration = formatChatDetailDuration(durationMs, t);
  const completedCount = node.steps.filter((step) => step.status === 'completed').length;
  const progress = t('plan.progress', {
    completed: completedCount,
    total: node.steps.length,
  });
  const metadata = [
    t(STATUS_KEYS[node.status]),
    duration ? t('runtime.duration', { duration }) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const planTone = statusColor(node.status, theme.colors);

  useEffect(() => {
    setExpanded(getInitialExpanded(node.id, defaultExpanded));
  }, [defaultExpanded, getInitialExpanded, node.id]);

  const handleToggle = useCallback(() => {
    setExpanded((current) => {
      const next = !current;
      onExpandedChange(node.id, next);
      return next;
    });
  }, [node.id, onExpandedChange]);

  return (
    <View className={ROW_CLASS}>
      <ChatTimelineRail iconUsage="runtime.planning" terminal={isLastInRun} toneColor={planTone} />
      <View className={BODY_CLASS}>
        <Pressable
          accessibilityLabel={expanded ? t('plan.collapse') : t('plan.expand')}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={handleToggle}
          className={HEADER_CLASS}
        >
          <View className={HEADER_TEXT_CLASS}>
            <View className={TITLE_ROW_CLASS}>
              <Text allowFontScaling={false} numberOfLines={1} className={TITLE_CLASS}>
                {node.title || t('plan.title')}
              </Text>
              <Text allowFontScaling={false} className={PROGRESS_CLASS}>
                {progress}
              </Text>
            </View>
            <Text allowFontScaling={false} className={META_CLASS}>
              {metadata}
            </Text>
          </View>
          <View className={FOLD_CLASS}>
            <AppIcon usage={expanded ? 'runtime.planCollapse' : 'runtime.planExpand'} />
          </View>
        </Pressable>

        {currentStep && !expanded ? (
          <Text allowFontScaling={false} numberOfLines={1} className={CURRENT_CLASS}>
            {t('plan.current', { step: currentStep.description })}
          </Text>
        ) : null}

        {expanded ? (
          <View className={CARD_CLASS}>
            {node.steps.length > 0 ? (
              node.steps.map((step, index) => {
                const color = statusColor(step.status, theme.colors);
                const stepDuration = formatChatDetailDuration(stepDurationMs(step, now), t);
                return (
                  <View
                    key={step.taskId}
                    className={cn(STEP_CLASS, index === node.steps.length - 1 && STEP_LAST_CLASS)}
                  >
                    <View className={STEP_DOT_CLASS} style={{ backgroundColor: color }} />
                    <View className={STEP_BODY_CLASS}>
                      <View className={STEP_TITLE_ROW_CLASS}>
                        <Text allowFontScaling={false} className={STEP_TITLE_CLASS}>
                          {step.description || step.taskId}
                        </Text>
                        <Text
                          allowFontScaling={false}
                          className={STEP_STATUS_CLASS}
                          style={{ color }}
                        >
                          {t(STATUS_KEYS[step.status])}
                        </Text>
                      </View>
                      {stepDuration ? (
                        <Text allowFontScaling={false} className={STEP_DURATION_CLASS}>
                          {t('runtime.duration', { duration: stepDuration })}
                        </Text>
                      ) : null}
                      {step.errorReason ? (
                        <Text allowFontScaling={false} className={STEP_ERROR_CLASS}>
                          {t('plan.failureReason', { reason: step.errorReason })}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })
            ) : (
              <Text allowFontScaling={false} className={EMPTY_CLASS}>
                {t('plan.empty')}
              </Text>
            )}
            {node.summary ? (
              <View className={SUMMARY_CLASS}>
                <Text allowFontScaling={false} className={SUMMARY_LABEL_CLASS}>
                  {t('plan.summary')}
                </Text>
                <Text allowFontScaling={false} className={SUMMARY_TEXT_CLASS}>
                  {node.summary}
                </Text>
              </View>
            ) : null}
            {node.errorReason ? (
              <Text allowFontScaling={false} className={ERROR_CLASS}>
                {t('plan.failureReason', { reason: node.errorReason })}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
});
