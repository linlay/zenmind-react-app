import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { useConversationPreviewRowActive } from '../../../shared/components/conversationPreview/ConversationPreviewProvider.tsx';
import { useT, type I18nKey } from '../../../shared/i18n/index.ts';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider.tsx';
import type {
  ChatTimelineTaskNode,
  ChatTimelineTaskStatus,
} from '../../chatTimeline/index.ts';
import { formatChatDetailDuration } from '../chatDetailFormatters.ts';
import { ExecutionTimelineRow } from './ExecutionTimelineRow.tsx';
import {
  getTimelineExecutionStatusColor,
  TASK_TIMELINE_CARD_CLASS,
  TaskTimelineContent,
} from './TaskTimelineContent.tsx';
import { useRunningElapsedMs } from './useRunningElapsedMs.ts';

type TaskTimelineRowProps = {
  getInitialExpanded: (nodeId: string, fallback: boolean) => boolean;
  isLastInRun: boolean;
  nodes: readonly ChatTimelineTaskNode[];
  onExpandedChange: (nodeId: string, expanded: boolean) => void;
};

const STATUS_KEYS: Record<ChatTimelineTaskStatus, I18nKey> = {
  pending: 'plan.status.pending',
  running: 'plan.status.running',
  completed: 'plan.status.completed',
  failed: 'plan.status.failed',
  cancelled: 'plan.status.cancelled',
};

const CURRENT_CLASS = 'text-app-footnote leading-[18px] text-app-secondary';

type TaskGroupSummary = {
  completedAt: number | null;
  completedCount: number;
  current: ChatTimelineTaskNode | null;
  startedAt: number | null;
  status: ChatTimelineTaskStatus;
};

function summarizeTasks(nodes: readonly ChatTimelineTaskNode[]): TaskGroupSummary {
  let startedAt: number | null = null;
  let completedAt: number | null = null;
  let completedCount = 0;
  let cancelledCount = 0;
  let hasFailure = false;
  let current: ChatTimelineTaskNode | null = null;
  let pending: ChatTimelineTaskNode | null = null;
  nodes.forEach((node) => {
    if (node.startedAt !== null && node.startedAt > 0) {
      startedAt = startedAt === null ? node.startedAt : Math.min(startedAt, node.startedAt);
    }
    if (node.completedAt !== null && node.completedAt > 0) {
      completedAt = completedAt === null ? node.completedAt : Math.max(completedAt, node.completedAt);
    }
    if (node.status === 'completed') {
      completedCount += 1;
    } else if (node.status === 'cancelled') {
      cancelledCount += 1;
    } else if (node.status === 'failed') {
      hasFailure = true;
    } else if (node.status === 'running' && !current) {
      current = node;
    } else if (node.status === 'pending' && !pending) {
      pending = node;
    }
  });
  const status: ChatTimelineTaskStatus = hasFailure
    ? 'failed'
    : current
      ? 'running'
      : nodes.length > 0 && completedCount === nodes.length
        ? 'completed'
        : nodes.length > 0 && completedCount + cancelledCount === nodes.length
          ? 'cancelled'
          : 'pending';
  return {
    completedAt,
    completedCount,
    current: current ?? pending,
    startedAt,
    status,
  };
}

export const TaskTimelineRow = memo(function TaskTimelineRow({
  getInitialExpanded,
  isLastInRun,
  nodes,
  onExpandedChange,
}: TaskTimelineRowProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const rowActive = useConversationPreviewRowActive();
  const firstNode = nodes[0];
  const rowId = firstNode?.id || 'task';
  const summary = useMemo(() => summarizeTasks(nodes), [nodes]);
  const status = summary.status;
  const defaultExpanded = status === 'running' || status === 'failed';
  const [expanded, setExpanded] = useState(() => getInitialExpanded(rowId, defaultExpanded));
  const startedAt = summary.startedAt;
  const completedAt = summary.completedAt;
  const elapsedMs = useRunningElapsedMs(startedAt, rowActive && status === 'running');
  const now = elapsedMs !== null && startedAt !== null ? startedAt + elapsedMs : null;
  const durationMs =
    status === 'running' && elapsedMs !== null
      ? elapsedMs
      : startedAt !== null && completedAt !== null
        ? Math.max(0, completedAt - startedAt)
        : firstNode?.durationMs ?? null;
  const duration = formatChatDetailDuration(durationMs, t);
  const badge = t('plan.progress', {
    completed: summary.completedCount,
    total: nodes.length,
  });
  const metadata = [
    t(STATUS_KEYS[status]),
    duration ? t('runtime.duration', { duration }) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const current = summary.current;
  const title =
    nodes.length > 1
      ? t('task.parallelTitle', { count: nodes.length })
      : firstNode?.taskName || firstNode?.taskId || t('task.title');
  const tone = getTimelineExecutionStatusColor(status, theme.colors);

  useEffect(() => {
    setExpanded(getInitialExpanded(rowId, defaultExpanded));
  }, [defaultExpanded, getInitialExpanded, rowId]);

  const handleToggle = useCallback(() => {
    setExpanded((currentValue) => {
      const next = !currentValue;
      onExpandedChange(rowId, next);
      return next;
    });
  }, [onExpandedChange, rowId]);

  if (!firstNode) {
    return null;
  }

  return (
    <ExecutionTimelineRow
      badge={badge}
      collapseLabel={t('task.collapse')}
      collapsedSummary={
        current ? (
          <Text allowFontScaling={false} numberOfLines={1} className={CURRENT_CLASS}>
            {t('task.current', { task: current.taskName || current.taskId })}
          </Text>
        ) : undefined
      }
      expanded={expanded}
      expandLabel={t('task.expand')}
      iconUsage="runtime.planning"
      isLastInRun={isLastInRun}
      metadata={metadata}
      onToggle={handleToggle}
      title={title}
      toneColor={tone}
    >
      <View className={TASK_TIMELINE_CARD_CLASS}>
        <TaskTimelineContent tasks={nodes} now={now} />
      </View>
    </ExecutionTimelineRow>
  );
});
