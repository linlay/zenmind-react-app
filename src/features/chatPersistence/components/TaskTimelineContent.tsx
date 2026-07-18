import { memo, useMemo } from 'react';
import { Text, View } from 'react-native';

import { useT } from '../../../shared/i18n/index.ts';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider.tsx';
import { cn } from '../../../shared/visual/className.ts';
import type { AppVisualColors } from '../../../shared/visual/foundation.ts';
import {
  buildChatTimelineTaskView,
  type ChatTimelinePlanStatus,
  type ChatTimelinePlanStep,
  type ChatTimelineTaskNode,
} from '../../chatTimeline/index.ts';
import {
  formatChatDetailDuration,
  formatChatDetailTimestamp,
} from '../chatDetailFormatters.ts';

type TaskTimelineContentProps = {
  now: number | null;
  steps?: readonly ChatTimelinePlanStep[];
  tasks: readonly ChatTimelineTaskNode[];
};

export const TASK_TIMELINE_CARD_CLASS =
  'overflow-hidden rounded-app-md border border-app-line bg-app-surface';

const TASK_ROW_CLASS = 'border-b border-app-line px-app-md py-[10px]';
const TASK_ROW_LAST_CLASS = 'border-b-0';
const PARALLEL_CLASS =
  'mb-[7px] self-start rounded-app-pill bg-app-brand-soft px-[8px] py-[3px] text-[11px] font-bold leading-[15px] text-app-brand-blue';
const TASK_MAIN_CLASS = 'flex-row gap-app-sm';
const TASK_DOT_CLASS = 'mt-[6px] h-[8px] w-[8px] shrink-0 rounded-app-pill';
const TASK_BODY_CLASS = 'min-w-0 flex-1 gap-[3px]';
const TASK_TITLE_ROW_CLASS = 'min-w-0 flex-row items-start gap-app-sm';
const TASK_TITLE_CLASS =
  'min-w-0 flex-1 text-app-footnote font-semibold leading-[18px] text-app-primary';
const TASK_STATUS_CLASS = 'shrink-0 text-[11px] font-bold leading-[16px]';
const TASK_META_CLASS = 'text-[11px] leading-[16px] text-app-tertiary';
const TASK_OWNER_CLASS = 'text-app-caption font-semibold leading-[17px] text-app-secondary';
const TASK_ERROR_CLASS = 'text-app-caption font-semibold leading-[17px] text-app-danger';
const EMPTY_CLASS = 'px-app-md py-app-lg text-center text-app-footnote text-app-tertiary';

const STATUS_KEYS = {
  pending: 'plan.status.pending',
  running: 'plan.status.running',
  completed: 'plan.status.completed',
  failed: 'plan.status.failed',
  cancelled: 'plan.status.cancelled',
} as const;

export function getTimelineExecutionStatusColor(
  status: ChatTimelinePlanStatus,
  colors: AppVisualColors,
): string {
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

function runningDurationMs(
  status: ChatTimelinePlanStatus,
  startedAt: number | null,
  durationMs: number | null,
  now: number | null,
): number | null {
  if (status === 'running' && startedAt !== null && now !== null) {
    return Math.max(0, now - startedAt);
  }
  return durationMs;
}

export const TaskTimelineContent = memo(function TaskTimelineContent({
  now,
  steps = [],
  tasks,
}: TaskTimelineContentProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const items = useMemo(() => buildChatTimelineTaskView(steps, tasks), [steps, tasks]);
  const today = t('chatDetail.timestamp.today');
  const yesterday = t('chatDetail.timestamp.yesterday');
  const displayNow = now ?? Date.now();

  if (items.length === 0) {
    return (
      <Text allowFontScaling={false} className={EMPTY_CLASS}>
        {t('task.empty')}
      </Text>
    );
  }

  return items.map((item, index) => {
    const color = getTimelineExecutionStatusColor(item.status, theme.colors);
    const duration = formatChatDetailDuration(
      runningDurationMs(item.status, item.startedAt, item.durationMs, now),
      t,
    );
    const started = item.startedAt
      ? formatChatDetailTimestamp(item.startedAt, displayNow, today, yesterday)
      : '';
    const completed = item.completedAt
      ? formatChatDetailTimestamp(item.completedAt, displayNow, today, yesterday)
      : '';
    const timeText = [
      started ? t('task.startedAt', { time: started }) : '',
      completed ? t('task.completedAt', { time: completed }) : '',
      duration ? t('runtime.duration', { duration }) : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const owner = item.subAgentKey || item.agentKey;
    const relationText = [
      owner ? t('task.agent', { agent: owner }) : '',
      item.parentTaskName ? t('task.parent', { task: item.parentTaskName }) : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const indentStyle = item.depth > 0 ? { marginLeft: item.depth * 12 } : undefined;

    return (
      <View
        key={item.taskId}
        className={cn(TASK_ROW_CLASS, index === items.length - 1 && TASK_ROW_LAST_CLASS)}
        style={indentStyle}
      >
        {item.parallelCount > 1 && item.parallelIndex === 0 ? (
          <Text allowFontScaling={false} className={PARALLEL_CLASS}>
            {t('task.parallel', { count: item.parallelCount })}
          </Text>
        ) : null}
        <View className={TASK_MAIN_CLASS}>
          <View className={TASK_DOT_CLASS} style={{ backgroundColor: color }} />
          <View className={TASK_BODY_CLASS}>
            <View className={TASK_TITLE_ROW_CLASS}>
              <Text allowFontScaling={false} className={TASK_TITLE_CLASS}>
                {item.taskName || item.taskId}
              </Text>
              <Text allowFontScaling={false} className={TASK_STATUS_CLASS} style={{ color }}>
                {t(STATUS_KEYS[item.status])}
              </Text>
            </View>
            {relationText ? (
              <Text allowFontScaling={false} className={TASK_OWNER_CLASS}>
                {relationText}
              </Text>
            ) : null}
            {timeText ? (
              <Text allowFontScaling={false} className={TASK_META_CLASS}>
                {timeText}
              </Text>
            ) : null}
            {item.errorReason ? (
              <Text allowFontScaling={false} className={TASK_ERROR_CLASS}>
                {t('plan.failureReason', { reason: item.errorReason })}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    );
  });
});
