import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { useConversationPreviewRowActive } from '../../../shared/components/conversationPreview/ConversationPreviewProvider.tsx';
import { useT, type I18nKey } from '../../../shared/i18n/index.ts';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider.tsx';
import type {
  ChatTimelinePlanNode,
  ChatTimelinePlanStatus,
  ChatTimelineTaskNode,
} from '../../chatTimeline/index.ts';
import { buildChatTimelineTaskView } from '../../chatTimeline/index.ts';
import { formatChatDetailDuration } from '../chatDetailFormatters.ts';
import { ExecutionTimelineRow } from './ExecutionTimelineRow.tsx';
import {
  getTimelineExecutionStatusColor,
  TASK_TIMELINE_CARD_CLASS,
  TaskTimelineContent,
} from './TaskTimelineContent.tsx';
import { useRunningElapsedMs } from './useRunningElapsedMs.ts';

type PlanTimelineRowProps = {
  node: ChatTimelinePlanNode;
  tasks: readonly ChatTimelineTaskNode[];
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

const CURRENT_CLASS = 'text-app-footnote leading-[18px] text-app-secondary';
const SUMMARY_CLASS = 'gap-[3px] border-t border-app-line px-app-md py-[10px]';
const SUMMARY_LABEL_CLASS = 'text-[11px] font-bold leading-[16px] text-app-success';
const SUMMARY_TEXT_CLASS = 'text-app-footnote leading-[18px] text-app-secondary';
const ERROR_CLASS =
  'border-t border-app-danger-line bg-app-danger-soft px-app-md py-[9px] text-app-footnote font-semibold leading-[18px] text-app-danger';

export const PlanTimelineRow = memo(function PlanTimelineRow({
  node,
  tasks,
  isLastInRun,
  getInitialExpanded,
  onExpandedChange,
}: PlanTimelineRowProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const rowActive = useConversationPreviewRowActive();
  const taskItems = useMemo(
    () => buildChatTimelineTaskView(node.steps, tasks),
    [node.steps, tasks],
  );
  const displayStatus = useMemo<ChatTimelinePlanStatus>(() => {
    if (node.status === 'failed' || taskItems.some((task) => task.status === 'failed')) {
      return 'failed';
    }
    if (node.status === 'cancelled') {
      return 'cancelled';
    }
    if (node.status === 'completed' || (taskItems.length > 0 && taskItems.every((task) => task.status === 'completed'))) {
      return 'completed';
    }
    if (node.status === 'running' || taskItems.some((task) => task.status === 'running')) {
      return 'running';
    }
    return 'pending';
  }, [node.status, taskItems]);
  const defaultExpanded = displayStatus === 'running' || displayStatus === 'failed';
  const [expanded, setExpanded] = useState(() => getInitialExpanded(node.id, defaultExpanded));
  const currentStep = useMemo(
    () => {
      if (displayStatus !== 'running' && displayStatus !== 'pending') {
        return null;
      }
      return (
        taskItems.find((step) => step.status === 'running') ??
        taskItems.find((step) => step.status === 'pending') ??
        null
      );
    },
    [displayStatus, taskItems],
  );
  const clockStartedAt = node.startedAt ?? currentStep?.startedAt ?? null;
  const elapsedMs = useRunningElapsedMs(clockStartedAt, rowActive && displayStatus === 'running');
  const now = elapsedMs !== null && clockStartedAt !== null ? clockStartedAt + elapsedMs : null;
  const durationMs =
    displayStatus === 'running' && clockStartedAt !== null && now !== null
      ? Math.max(0, now - clockStartedAt)
      : node.durationMs;
  const duration = formatChatDetailDuration(durationMs, t);
  const completedCount = taskItems.filter((step) => step.status === 'completed').length;
  const progress = t('plan.progress', {
    completed: completedCount,
    total: taskItems.length,
  });
  const metadata = [
    t(STATUS_KEYS[displayStatus]),
    duration ? t('runtime.duration', { duration }) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const planTone = getTimelineExecutionStatusColor(displayStatus, theme.colors);

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
    <ExecutionTimelineRow
      badge={progress}
      collapseLabel={t('plan.collapse')}
      collapsedSummary={
        currentStep ? (
          <Text allowFontScaling={false} numberOfLines={1} className={CURRENT_CLASS}>
            {t('plan.current', { step: currentStep.taskName })}
          </Text>
        ) : undefined
      }
      expanded={expanded}
      expandLabel={t('plan.expand')}
      iconUsage="runtime.planning"
      isLastInRun={isLastInRun}
      metadata={metadata}
      onToggle={handleToggle}
      title={node.title || t('plan.title')}
      toneColor={planTone}
    >
      <View className={TASK_TIMELINE_CARD_CLASS}>
        <TaskTimelineContent steps={node.steps} tasks={tasks} now={now} />
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
    </ExecutionTimelineRow>
  );
});
