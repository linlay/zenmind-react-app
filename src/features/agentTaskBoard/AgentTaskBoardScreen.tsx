import { FlashList } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { memo, ReactElement, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../../app/navigation/types';
import type { KanbanIssue } from '../../core/api/services/kanbanApi';
import { AppKeyboardAwareScrollView } from '../../shared/components/AppKeyboardAwareScrollView';
import { ScreenHeader } from '../../shared/components/ScreenHeader';
import { AppIcon, type AppIconUsage } from '../../shared/icons/AppIcon';
import { type I18nKey, useT } from '../../shared/i18n';
import { useAppTheme } from '../../shared/visual/AppThemeProvider';
import { cn } from '../../shared/visual/className';
import { appVisualTokens, getAvatarLabel, getAvatarTone } from '../../shared/visual/foundation';
import { useAppTabBarHeight } from '../../shared/visual/useAppTabBarHeight';
import { getPairedChatSource } from '../chatPersistence/chatSourceRuntime';
import { useAgentTaskBoard } from './AgentTaskBoardProvider';
import { buildKanbanChatDetailParams } from './kanbanChatRoute';
import type { AgentTaskBoardStackParamList } from './navigationTypes';
import { createEmptyTaskDraft, type TaskDraftForm } from './useDesktopKanbanBoard';
import {
  deriveBoardSummary,
  getAgentPreview,
  type AgentOption,
  type BoardQueue,
  type BoardTask,
  type TaskPriority,
  type TaskStage
} from './kanbanViewModel';

type AgentTaskBoardNewTaskScreenProps = NativeStackScreenProps<AgentTaskBoardStackParamList, 'NewTask'>;
type AgentTaskBoardAssignTaskScreenProps = NativeStackScreenProps<AgentTaskBoardStackParamList, 'AssignTask'>;
type AgentTaskBoardTaskDetailScreenProps = NativeStackScreenProps<AgentTaskBoardStackParamList, 'TaskDetail'>;

type LifecycleStep = {
  stage: TaskStage;
  labelKey: I18nKey;
};

const LIFECYCLE = [
  { stage: 'intake', labelKey: 'tasks.lifecycle.intake' },
  { stage: 'assigned', labelKey: 'tasks.lifecycle.assigned' },
  { stage: 'running', labelKey: 'tasks.lifecycle.running' },
  { stage: 'review', labelKey: 'tasks.lifecycle.review' },
  { stage: 'done', labelKey: 'tasks.lifecycle.done' }
] as const satisfies readonly LifecycleStep[];

const QUEUES = [
  { id: 'focus', labelKey: 'tasks.queue.focus' },
  { id: 'running', labelKey: 'tasks.queue.running' },
  { id: 'review', labelKey: 'tasks.queue.review' }
] as const satisfies readonly { id: BoardQueue; labelKey: I18nKey }[];

const PRIORITY_LABEL_KEYS: Record<TaskPriority, I18nKey> = {
  high: 'tasks.priority.high',
  medium: 'tasks.priority.medium',
  low: 'tasks.priority.low'
};

const STAGE_LABEL_KEYS: Record<TaskStage, I18nKey> = {
  intake: 'tasks.stage.intake',
  assigned: 'tasks.stage.assigned',
  running: 'tasks.stage.running',
  review: 'tasks.stage.review',
  done: 'tasks.stage.done'
};

const TASK_PRIORITIES = ['high', 'medium', 'low'] as const satisfies readonly TaskPriority[];

type StatusPillTone = 'brand' | 'warning' | 'danger';

const SCREEN_CLASS = 'flex-1 bg-app-surface';
const HEADER_SAFE_AREA_CLASS = 'bg-app-surface';
const SCROLL_VIEW_CLASS = 'flex-1';
const HOME_LIST_CONTENT_STYLE = {
  paddingHorizontal: appVisualTokens.spacing.xl,
  paddingTop: appVisualTokens.spacing.lg
} satisfies ViewStyle;
const SECONDARY_CONTENT_CLASS = 'gap-app-xl px-app-xl pt-app-lg';
const ACTIVE_OPACITY_CLASS = 'active:opacity-[0.62]';
const DISABLED_CLASS = 'opacity-[0.45]';
const HEADER_ACTION_BUTTON_CLASS = `h-10 w-10 items-center justify-center rounded-app-pill ${ACTIVE_OPACITY_CLASS}`;
const HOME_HEADER_CLASS = 'gap-app-xl';
const HERO_BLOCK_CLASS = 'gap-app-lg border-b border-app-line pb-app-lg';
const HERO_TITLE_ROW_CLASS = 'flex-row items-start gap-app-lg';
const HERO_TEXT_BLOCK_CLASS = 'min-w-0 flex-1 gap-app-sm';
const HERO_EYEBROW_CLASS = 'text-app-caption font-bold text-app-brand-blue';
const HERO_TITLE_CLASS = 'text-app-display-sm font-extrabold text-app-primary';
const HERO_BODY_CLASS = 'text-app-body text-app-secondary';
const HERO_COUNT_BLOCK_CLASS =
  'min-h-[74px] w-[74px] items-center justify-center rounded-app-sm bg-app-brand-blue-soft';
const HERO_COUNT_VALUE_CLASS = 'text-app-display font-extrabold text-app-brand-blue';
const HERO_COUNT_LABEL_CLASS = 'text-app-caption font-bold text-app-brand-blue';
const HERO_ACTION_ROW_CLASS = 'flex-row gap-app-sm';
const BUTTON_CLASS =
  'min-h-[42px] flex-1 items-center justify-center rounded-app-md px-app-md active:opacity-[0.62]';
const BUTTON_PRIMARY_CLASS = 'bg-app-action';
const BUTTON_SECONDARY_CLASS = 'border border-app-line-strong bg-app-surface';
const BUTTON_DANGER_CLASS = 'border border-app-danger-line bg-app-danger-soft';
const BUTTON_TEXT_CLASS = 'text-app-body-sm font-extrabold text-app-primary';
const BUTTON_TEXT_PRIMARY_CLASS = 'text-app-on-action';
const BUTTON_TEXT_DANGER_CLASS = 'text-app-danger';
const STATUS_ROW_CLASS = 'flex-row gap-app-sm';
const STATUS_PILL_CLASS =
  'min-h-[38px] flex-1 flex-row items-center justify-center gap-app-xs rounded-app-pill bg-app-surface-muted';
const STATUS_DOT_CLASS = 'h-[7px] w-[7px] rounded-app-pill';
const STATUS_PILL_LABEL_CLASS = 'text-app-caption text-app-secondary';
const STATUS_PILL_VALUE_CLASS = 'text-app-footnote font-extrabold text-app-primary';
const QUEUE_SWITCH_CLASS = 'flex-row rounded-app-md bg-app-surface-muted p-[3px]';
const QUEUE_SWITCH_ITEM_CLASS =
  'min-h-9 flex-1 items-center justify-center rounded-app-sm active:opacity-[0.62]';
const QUEUE_SWITCH_ITEM_SELECTED_CLASS = 'bg-app-surface';
const QUEUE_SWITCH_TEXT_CLASS = 'text-app-footnote font-extrabold text-app-secondary';
const QUEUE_SWITCH_TEXT_SELECTED_CLASS = 'text-app-brand-blue';
const SECTION_BLOCK_CLASS = 'gap-app-md';
const SECTION_HEADER_CLASS = 'flex-row items-center justify-between gap-app-md';
const SECTION_TITLE_CLASS = 'text-app-title-sm font-extrabold text-app-primary';
const SECTION_META_CLASS = 'text-app-caption text-app-secondary';
const STATE_BLOCK_CLASS = 'gap-app-sm py-app-lg';
const STATE_TITLE_CLASS = 'text-app-body font-extrabold text-app-primary';
const STATE_BODY_CLASS = 'text-[13px] leading-[19px] text-app-secondary';
const TASK_ROW_CLASS = 'min-h-[104px] flex-row items-stretch gap-app-md border-b border-app-line py-app-md';
const TASK_STAGE_BAR_CLASS = 'w-1 rounded-app-pill';
const TASK_ROW_MAIN_CLASS = 'min-w-0 flex-1 justify-center gap-app-xs rounded-app-sm active:bg-app-surface-muted';
const TASK_ROW_TITLE_LINE_CLASS = 'flex-row items-center gap-app-sm';
const TASK_ROW_TITLE_CLASS = 'min-w-0 flex-1 text-app-body-lg font-extrabold text-app-primary';
const PRIORITY_MINI_CLASS =
  'min-h-6 flex-row items-center gap-app-xs rounded-app-pill bg-app-surface-muted px-app-sm';
const PRIORITY_DOT_CLASS = 'h-[6px] w-[6px] rounded-app-pill';
const PRIORITY_MINI_TEXT_CLASS = 'text-app-caption font-extrabold';
const TASK_OUTCOME_CLASS = 'text-[14px] leading-[21px] text-app-primary';
const TASK_ROW_META_CLASS = 'flex-row items-center justify-between gap-app-md';
const TASK_META_TEXT_CLASS = 'shrink text-[12px] leading-[17px] text-app-secondary';
const ROW_ACTION_BUTTON_CLASS =
  'min-h-[34px] min-w-[54px] items-center justify-center self-center rounded-app-pill bg-app-brand-blue-soft active:opacity-[0.62]';
const ROW_ACTION_TEXT_CLASS = 'text-app-footnote font-extrabold text-app-brand-blue';
const AGENT_SUMMARY_LIST_CLASS = 'border-t border-app-line';
const AGENT_FOOTER_CLASS = 'gap-app-md pt-app-xl';
const AGENT_COMPACT_ROW_CLASS = 'min-h-[66px] flex-row items-center gap-app-md border-b border-app-line';
const AGENT_AVATAR_CLASS = 'h-10 w-10 items-center justify-center rounded-app-pill';
const AGENT_AVATAR_TEXT_CLASS = 'text-[17px] font-extrabold leading-[22px]';
const AGENT_COMPACT_TEXT_CLASS = 'min-w-0 flex-1 gap-[2px]';
const AGENT_NAME_CLASS = 'text-[15px] font-extrabold leading-5 text-app-primary';
const AGENT_FIT_CLASS = 'text-[12px] leading-[17px] text-app-secondary';
const AGENT_LOAD_BLOCK_CLASS = 'flex-row items-center gap-app-xs';
const AGENT_LOAD_TEXT_CLASS = 'text-[12px] font-extrabold leading-[17px] text-app-secondary';
const FORM_BLOCK_CLASS = 'gap-app-md border-b border-app-line pb-app-lg';
const FORM_TITLE_CLASS = 'text-app-title-sm font-extrabold text-app-primary';
const DRAFT_FIELD_CLASS = 'gap-app-xs py-app-sm';
const FIELD_LABEL_CLASS = 'text-app-caption font-extrabold text-app-brand-blue';
const TEXT_INPUT_CLASS =
  'min-h-11 rounded-app-sm border border-app-line-strong bg-app-surface px-app-md py-app-sm text-app-body text-app-primary';
const TEXT_AREA_INPUT_CLASS = 'min-h-[108px]';
const PRIORITY_CHOICE_ROW_CLASS = 'flex-row gap-app-sm';
const PRIORITY_CHOICE_CLASS =
  'min-h-[42px] flex-1 flex-row items-center justify-center gap-app-xs rounded-app-sm border border-app-line-strong bg-app-surface active:opacity-[0.62]';
const PRIORITY_CHOICE_SELECTED_CLASS = 'border-app-brand-blue bg-app-brand-blue-soft';
const PRIORITY_CHOICE_TEXT_CLASS = 'text-app-body-sm font-extrabold text-app-secondary';
const PRIORITY_CHOICE_TEXT_SELECTED_CLASS = 'text-app-brand-blue';
const OPTION_ROW_CLASS = 'min-h-[42px] flex-row items-center justify-between gap-app-md';
const OPTION_LABEL_CLASS = 'text-[14px] leading-[21px] text-app-secondary';
const OPTION_VALUE_CLASS = 'shrink text-right text-app-body font-extrabold text-app-primary';
const STICKY_ACTION_BLOCK_CLASS = 'gap-app-sm';
const ASSIGNMENT_SUMMARY_CLASS = 'gap-app-sm border-b border-app-line pb-app-lg';
const ASSIGNMENT_EYEBROW_CLASS = 'text-app-caption font-extrabold text-app-brand-blue';
const ASSIGNMENT_TITLE_CLASS = 'text-[22px] font-extrabold leading-7 text-app-primary';
const ASSIGNMENT_BODY_CLASS = 'text-app-body text-app-secondary';
const AGENT_CHOICE_LIST_CLASS = 'gap-app-sm';
const AGENT_CHOICE_CLASS =
  'min-h-[72px] flex-row items-center gap-app-md rounded-app-sm border border-app-line-strong bg-app-surface p-app-md active:opacity-[0.62]';
const AGENT_CHOICE_SELECTED_CLASS = 'border-app-brand-blue bg-app-brand-blue-soft';
const DETAIL_HERO_CLASS = 'gap-app-md border-b border-app-line pb-app-lg';
const DETAIL_TITLE_ROW_CLASS = 'flex-row items-center justify-between gap-app-md';
const DETAIL_STAGE_CLASS = 'text-app-caption font-extrabold text-app-brand-blue';
const DETAIL_DUE_CLASS = 'text-app-caption text-app-secondary';
const DETAIL_TITLE_CLASS = 'text-[22px] font-extrabold leading-7 text-app-primary';
const DETAIL_BODY_CLASS = 'text-app-body text-app-secondary';
const PROGRESS_TRACK_CLASS = 'h-[6px] overflow-hidden rounded-app-pill bg-app-surface-muted';
const PROGRESS_FILL_CLASS = 'h-[6px] rounded-app-pill bg-app-brand-blue';
const LIFECYCLE_CLASS = 'flex-row justify-between gap-app-sm';
const LIFECYCLE_ITEM_CLASS = 'flex-1 items-center gap-app-sm';
const LIFECYCLE_DOT_CLASS = 'h-[18px] w-[18px] rounded-app-pill';
const LIFECYCLE_DOT_REACHED_CLASS = 'bg-app-brand-blue';
const LIFECYCLE_DOT_PENDING_CLASS = 'bg-app-line-strong';
const LIFECYCLE_TEXT_CLASS = 'text-app-caption text-app-secondary';
const LIFECYCLE_TEXT_REACHED_CLASS = 'font-extrabold text-app-primary';

const STATUS_PILL_DOT_CLASS_BY_TONE = {
  brand: 'bg-app-brand-blue',
  warning: 'bg-app-warning',
  danger: 'bg-app-danger'
} as const satisfies Record<StatusPillTone, string>;

const PRIORITY_DOT_CLASS_BY_PRIORITY = {
  high: 'bg-app-danger',
  medium: 'bg-app-warning',
  low: 'bg-app-success'
} as const satisfies Record<TaskPriority, string>;

const PRIORITY_TEXT_CLASS_BY_PRIORITY = {
  high: 'text-app-danger',
  medium: 'text-app-warning',
  low: 'text-app-success'
} as const satisfies Record<TaskPriority, string>;

const STAGE_BAR_CLASS_BY_STAGE = {
  intake: 'bg-app-secondary',
  assigned: 'bg-app-brand-blue',
  running: 'bg-app-brand-blue',
  review: 'bg-app-warning',
  done: 'bg-app-success'
} as const satisfies Record<TaskStage, string>;

const AGENT_STATUS_DOT_CLASS_BY_STATUS = {
  ready: 'bg-app-success',
  waiting: 'bg-app-warning',
  busy: 'bg-app-tertiary'
} as const satisfies Record<AgentOption['status'], string>;

function clampProgress(value: number): number {
  return Math.min(100, Math.max(0, value));
}

type HeaderActionButtonProps = {
  usage: AppIconUsage;
  onPress: () => void;
};

const HeaderActionButton = memo(function HeaderActionButton({ usage, onPress }: HeaderActionButtonProps) {
  return (
    <Pressable accessibilityRole="button" className={HEADER_ACTION_BUTTON_CLASS} onPress={onPress}>
      <AppIcon usage={usage} />
    </Pressable>
  );
});

type PlainButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
};

const PlainButton = memo(function PlainButton({
  label,
  onPress,
  variant = 'secondary',
  disabled = false
}: PlainButtonProps) {
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  const buttonClass = cn(
    BUTTON_CLASS,
    isPrimary ? BUTTON_PRIMARY_CLASS : BUTTON_SECONDARY_CLASS,
    isDanger ? BUTTON_DANGER_CLASS : null,
    disabled ? DISABLED_CLASS : null
  );
  const textClass = cn(
    BUTTON_TEXT_CLASS,
    isPrimary ? BUTTON_TEXT_PRIMARY_CLASS : null,
    isDanger ? BUTTON_TEXT_DANGER_CLASS : null
  );

  return (
    <Pressable accessibilityRole="button" disabled={disabled} className={buttonClass} onPress={onPress}>
      <Text className={textClass}>{label}</Text>
    </Pressable>
  );
});

type StatusPillProps = {
  label: string;
  value: string;
  tone?: StatusPillTone;
};

const StatusPill = memo(function StatusPill({ label, value, tone }: StatusPillProps) {
  const dotClass = cn(STATUS_DOT_CLASS, STATUS_PILL_DOT_CLASS_BY_TONE[tone ?? 'brand']);

  return (
    <View className={STATUS_PILL_CLASS}>
      <View className={dotClass} />
      <Text className={STATUS_PILL_LABEL_CLASS}>{label}</Text>
      <Text className={STATUS_PILL_VALUE_CLASS}>{value}</Text>
    </View>
  );
});

type HomeScreenProps = {
  tasks: readonly BoardTask[];
  agents: readonly AgentOption[];
  selectedQueue: BoardQueue;
  contentBottomPadding: number;
  loading: boolean;
  error: string | null;
  onSelectQueue: (queue: BoardQueue) => void;
  onOpenNewTask: () => void;
  onOpenAssign: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
  onRetry: () => void;
};

const HomeScreen = memo(function HomeScreen({
  tasks,
  agents,
  selectedQueue,
  contentBottomPadding,
  loading,
  error,
  onSelectQueue,
  onOpenNewTask,
  onOpenAssign,
  onOpenTask,
  onRetry
}: HomeScreenProps) {
  const t = useT();
  const summary = useMemo(() => deriveBoardSummary(tasks, selectedQueue), [selectedQueue, tasks]);
  const agentPreview = useMemo(() => getAgentPreview(agents), [agents]);
  const focusTask = summary.focusTask;
  const focusTaskId = focusTask?.id;
  const contentContainerStyle = useMemo(
    () => [HOME_LIST_CONTENT_STYLE, { paddingBottom: contentBottomPadding }],
    [contentBottomPadding]
  );
  const renderTask = useCallback(
    ({ item }: { item: BoardTask }) => <TaskRow task={item} onOpenTask={onOpenTask} onOpenAssign={onOpenAssign} />,
    [onOpenAssign, onOpenTask]
  );
  const handleAssignFocusTask = useCallback(() => {
    if (focusTaskId) {
      onOpenAssign(focusTaskId);
    }
  }, [focusTaskId, onOpenAssign]);

  return (
    <FlashList
      data={summary.visibleTasks}
      keyExtractor={(task) => task.id}
      renderItem={renderTask}
      ListHeaderComponent={
        <View className={HOME_HEADER_CLASS}>
          <View className={HERO_BLOCK_CLASS}>
            <View className={HERO_TITLE_ROW_CLASS}>
              <View className={HERO_TEXT_BLOCK_CLASS}>
                <Text className={HERO_EYEBROW_CLASS}>{t('tasks.hero.todayFocus')}</Text>
                <Text className={HERO_TITLE_CLASS}>{focusTask ? focusTask.title : t('tasks.hero.stable')}</Text>
                <Text className={HERO_BODY_CLASS}>
                  {focusTask?.blocker
                    ? focusTask.blocker
                    : focusTask
                      ? focusTask.nextAction
                      : t('tasks.hero.noIntervention')}
                </Text>
              </View>
              <View className={HERO_COUNT_BLOCK_CLASS}>
                <Text className={HERO_COUNT_VALUE_CLASS}>{summary.intakeCount + summary.reviewCount}</Text>
                <Text className={HERO_COUNT_LABEL_CLASS}>{t('tasks.hero.pending')}</Text>
              </View>
            </View>

            <View className={HERO_ACTION_ROW_CLASS}>
              <PlainButton
                label={t('tasks.action.assignTask')}
                variant="primary"
                disabled={!focusTask}
                onPress={handleAssignFocusTask}
              />
              <PlainButton label={t('tasks.action.newTask')} onPress={onOpenNewTask} />
            </View>
          </View>

          <View className={STATUS_ROW_CLASS}>
            <StatusPill label={t('tasks.stage.intake')} value={`${summary.intakeCount}`} />
            <StatusPill label={t('tasks.stage.review')} value={`${summary.reviewCount}`} tone="warning" />
            <StatusPill
              label={t('tasks.status.blocked')}
              value={`${summary.blockedCount}`}
              tone="danger"
            />
          </View>

          <View className={QUEUE_SWITCH_CLASS}>
            {QUEUES.map((queue) => {
              const selected = selectedQueue === queue.id;
              return (
                <Pressable
                  key={queue.id}
                  className={cn(QUEUE_SWITCH_ITEM_CLASS, selected ? QUEUE_SWITCH_ITEM_SELECTED_CLASS : null)}
                  onPress={() => onSelectQueue(queue.id)}
                >
                  <Text className={cn(QUEUE_SWITCH_TEXT_CLASS, selected ? QUEUE_SWITCH_TEXT_SELECTED_CLASS : null)}>
                    {t(queue.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className={SECTION_HEADER_CLASS}>
            <Text className={SECTION_TITLE_CLASS}>{t('tasks.section.tasks')}</Text>
            <Text className={SECTION_META_CLASS}>{t('tasks.countItems', { count: summary.visibleTasks.length })}</Text>
          </View>
          {error ? (
            <View className={STATE_BLOCK_CLASS}>
              <Text className={STATE_TITLE_CLASS}>{error}</Text>
              <PlainButton label={t('common.retry')} onPress={onRetry} />
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <View className={STATE_BLOCK_CLASS}>
          <Text className={STATE_TITLE_CLASS}>{loading ? t('common.loading') : t('tasks.hero.stable')}</Text>
          <Text className={STATE_BODY_CLASS}>
            {loading
              ? t('tasks.loadingHint')
              : tasks.length > 0
                ? t('tasks.hero.noIntervention')
                : t('tasks.emptyHint')}
          </Text>
        </View>
      }
      ListFooterComponent={
        <View className={AGENT_FOOTER_CLASS}>
          <View className={SECTION_HEADER_CLASS}>
            <Text className={SECTION_TITLE_CLASS}>{t('tasks.section.availableAgents')}</Text>
            <Text className={SECTION_META_CLASS}>{t('tasks.section.availableAgentsHint')}</Text>
          </View>
          <View className={AGENT_SUMMARY_LIST_CLASS}>
            {agentPreview.length > 0 ? (
              agentPreview.map((agent) => <AgentCompactRow key={agent.key} agent={agent} />)
            ) : (
              <Text className={STATE_BODY_CLASS}>{t('tasks.agent.empty')}</Text>
            )}
          </View>
        </View>
      }
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator={false}
      drawDistance={420}
    />
  );
});

type TaskRowProps = {
  task: BoardTask;
  onOpenTask: (taskId: string) => void;
  onOpenAssign: (taskId: string) => void;
};

const TaskRow = memo(function TaskRow({ task, onOpenTask, onOpenAssign }: TaskRowProps) {
  const t = useT();
  const priorityDotClass = cn(PRIORITY_DOT_CLASS, PRIORITY_DOT_CLASS_BY_PRIORITY[task.priority]);
  const priorityTextClass = cn(PRIORITY_MINI_TEXT_CLASS, PRIORITY_TEXT_CLASS_BY_PRIORITY[task.priority]);
  const stageBarClass = cn(TASK_STAGE_BAR_CLASS, STAGE_BAR_CLASS_BY_STAGE[task.stage]);
  const shouldAssign = task.stage === 'intake';
  const actionLabel = shouldAssign
    ? t('tasks.action.assign')
    : task.stage === 'review'
      ? t('tasks.action.review')
      : t('tasks.action.view');
  const handleOpenTask = useCallback(() => {
    onOpenTask(task.id);
  }, [onOpenTask, task.id]);
  const handleOpenAssign = useCallback(() => {
    onOpenAssign(task.id);
  }, [onOpenAssign, task.id]);
  const actionHandler = shouldAssign ? handleOpenAssign : handleOpenTask;

  return (
    <View className={TASK_ROW_CLASS}>
      <View className={stageBarClass} />
      <Pressable
        accessibilityRole="button"
        className={TASK_ROW_MAIN_CLASS}
        onPress={handleOpenTask}
      >
        <View className={TASK_ROW_TITLE_LINE_CLASS}>
          <Text numberOfLines={1} className={TASK_ROW_TITLE_CLASS}>
            {task.title}
          </Text>
          <View className={PRIORITY_MINI_CLASS}>
            <View className={priorityDotClass} />
            <Text className={priorityTextClass}>{t(PRIORITY_LABEL_KEYS[task.priority])}</Text>
          </View>
        </View>
        <Text numberOfLines={2} className={TASK_OUTCOME_CLASS}>
          {task.outcome}
        </Text>
        <View className={TASK_ROW_META_CLASS}>
          <Text numberOfLines={1} className={TASK_META_TEXT_CLASS}>
            {t(STAGE_LABEL_KEYS[task.stage])} · {task.agentName}
          </Text>
          <Text className={TASK_META_TEXT_CLASS}>{task.dueLabel}</Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" className={ROW_ACTION_BUTTON_CLASS} onPress={actionHandler}>
        <Text className={ROW_ACTION_TEXT_CLASS}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
});

type AgentCompactRowProps = {
  agent: AgentOption;
};

const AgentCompactRow = memo(function AgentCompactRow({ agent }: AgentCompactRowProps) {
  const tone = getAvatarTone(agent.name);
  const statusDotClass = cn(STATUS_DOT_CLASS, AGENT_STATUS_DOT_CLASS_BY_STATUS[agent.status]);

  return (
    <View className={AGENT_COMPACT_ROW_CLASS}>
      <View className={AGENT_AVATAR_CLASS} style={{ backgroundColor: tone.backgroundColor }}>
        <Text className={AGENT_AVATAR_TEXT_CLASS} style={{ color: tone.foregroundColor }}>
          {getAvatarLabel(agent.name)}
        </Text>
      </View>
      <View className={AGENT_COMPACT_TEXT_CLASS}>
        <Text numberOfLines={1} className={AGENT_NAME_CLASS}>
          {agent.name}
        </Text>
        <Text numberOfLines={1} className={AGENT_FIT_CLASS}>
          {agent.fitText}
        </Text>
      </View>
      <View className={AGENT_LOAD_BLOCK_CLASS}>
        <View className={statusDotClass} />
        <Text className={AGENT_LOAD_TEXT_CLASS}>{agent.load}</Text>
      </View>
    </View>
  );
});

type SecondaryPageProps = {
  title: string;
  onBack: () => void;
  children: ReactNode;
};

function SecondaryPage({ title, onBack, children }: SecondaryPageProps) {
  const insets = useSafeAreaInsets();
  const contentBottomPadding = insets.bottom + appVisualTokens.spacing.xxl;
  const contentBottomStyle = useMemo(() => ({ paddingBottom: contentBottomPadding }), [contentBottomPadding]);
  const backAction = useMemo(
    () => [<HeaderActionButton key="back" usage="chatDetail.back" onPress={onBack} />] as const satisfies readonly [
      ReactElement
    ],
    [onBack]
  );

  return (
    <View className={SCREEN_CLASS}>
      <SafeAreaView edges={['top']} className={HEADER_SAFE_AREA_CLASS}>
        <ScreenHeader title={title} leftActions={backAction} />
      </SafeAreaView>
      <AppKeyboardAwareScrollView className={SCROLL_VIEW_CLASS} showsVerticalScrollIndicator={false}>
        <View className={SECONDARY_CONTENT_CLASS} style={contentBottomStyle}>
          {children}
        </View>
      </AppKeyboardAwareScrollView>
    </View>
  );
}

type NewTaskPageProps = {
  draft: TaskDraftForm;
  error: string | null;
  onBack: () => void;
  onChangeDescription: (description: string) => void;
  onChangePriority: (priority: TaskPriority) => void;
  onChangeTitle: (title: string) => void;
  onCreateDraft: () => void;
  saving: boolean;
};

function NewTaskPage({
  draft,
  error,
  onBack,
  onChangeDescription,
  onChangePriority,
  onChangeTitle,
  onCreateDraft,
  saving
}: NewTaskPageProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const canSubmit = draft.title.trim().length > 0 && !saving;

  return (
    <SecondaryPage title={t('tasks.page.newTask')} onBack={onBack}>
      <View className={FORM_BLOCK_CLASS}>
        <Text className={FORM_TITLE_CLASS}>{t('tasks.form.draft')}</Text>
        <View className={DRAFT_FIELD_CLASS}>
          <Text className={FIELD_LABEL_CLASS}>{t('tasks.form.title')}</Text>
          <TextInput
            accessibilityLabel={t('tasks.form.title')}
            autoCapitalize="sentences"
            placeholder={t('tasks.form.titlePlaceholder')}
            placeholderTextColor={theme.colors.textTertiary}
            returnKeyType="next"
            className={TEXT_INPUT_CLASS}
            value={draft.title}
            onChangeText={onChangeTitle}
          />
        </View>
        <View className={DRAFT_FIELD_CLASS}>
          <Text className={FIELD_LABEL_CLASS}>{t('tasks.form.description')}</Text>
          <TextInput
            accessibilityLabel={t('tasks.form.description')}
            multiline
            placeholder={t('tasks.form.descriptionPlaceholder')}
            placeholderTextColor={theme.colors.textTertiary}
            className={cn(TEXT_INPUT_CLASS, TEXT_AREA_INPUT_CLASS)}
            textAlignVertical="top"
            value={draft.description}
            onChangeText={onChangeDescription}
          />
        </View>
      </View>

      <View className={FORM_BLOCK_CLASS}>
        <Text className={FORM_TITLE_CLASS}>{t('tasks.form.execution')}</Text>
        <View className={DRAFT_FIELD_CLASS}>
          <Text className={FIELD_LABEL_CLASS}>{t('tasks.form.priority')}</Text>
          <View className={PRIORITY_CHOICE_ROW_CLASS}>
            {TASK_PRIORITIES.map((priority) => {
              const selected = draft.priority === priority;
              const priorityDotClass = cn(PRIORITY_DOT_CLASS, PRIORITY_DOT_CLASS_BY_PRIORITY[priority]);
              return (
                <Pressable
                  key={priority}
                  accessibilityRole="button"
                  className={cn(PRIORITY_CHOICE_CLASS, selected ? PRIORITY_CHOICE_SELECTED_CLASS : null)}
                  onPress={() => onChangePriority(priority)}
                >
                  <View className={priorityDotClass} />
                  <Text className={cn(PRIORITY_CHOICE_TEXT_CLASS, selected ? PRIORITY_CHOICE_TEXT_SELECTED_CLASS : null)}>
                    {t(PRIORITY_LABEL_KEYS[priority])}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <OptionRow label={t('tasks.form.initialStage')} value={t('tasks.stage.intake')} />
      </View>

      {error ? (
        <View className={STATE_BLOCK_CLASS}>
          <Text className={STATE_TITLE_CLASS}>{error}</Text>
        </View>
      ) : null}

      <View className={STICKY_ACTION_BLOCK_CLASS}>
        <PlainButton
          label={saving ? t('common.loading') : t('tasks.action.createTask')}
          variant="primary"
          disabled={!canSubmit}
          onPress={onCreateDraft}
        />
        <PlainButton label={t('tasks.action.saveIncomplete')} onPress={onBack} />
      </View>
    </SecondaryPage>
  );
}

type OptionRowProps = {
  label: string;
  value: string;
};

function OptionRow({ label, value }: OptionRowProps) {
  return (
    <View className={OPTION_ROW_CLASS}>
      <Text className={OPTION_LABEL_CLASS}>{label}</Text>
      <Text className={OPTION_VALUE_CLASS}>{value}</Text>
    </View>
  );
}

type AssignTaskPageProps = {
  task: BoardTask;
  agents: readonly AgentOption[];
  error: string | null;
  pending: boolean;
  running: boolean;
  onBack: () => void;
  onAssign: (taskId: string, agent: AgentOption) => void;
};

type AgentSelection = {
  selectedAgent: AgentOption | undefined;
  selectedAgentKey: string;
};

function resolveAgentSelection(
  agents: readonly AgentOption[],
  taskAgentName: string,
  selectedAgentKey: string
): AgentSelection {
  let firstAgent: AgentOption | undefined;
  let preferredAgent: AgentOption | undefined;
  let selectedAgent: AgentOption | undefined;

  for (const agent of agents) {
    firstAgent ??= agent;
    if (!preferredAgent && (agent.key === taskAgentName || agent.name === taskAgentName)) {
      preferredAgent = agent;
    }
    if (!selectedAgent && agent.key === selectedAgentKey) {
      selectedAgent = agent;
    }
    if (preferredAgent && selectedAgent) {
      break;
    }
  }

  const resolvedAgent = selectedAgent ?? preferredAgent ?? firstAgent;
  return {
    selectedAgent: resolvedAgent,
    selectedAgentKey: resolvedAgent?.key ?? ''
  };
}

function AssignTaskPage({
  task,
  agents,
  error,
  pending,
  running,
  onBack,
  onAssign
}: AssignTaskPageProps) {
  const t = useT();
  const [selectedAgentKey, setSelectedAgentKey] = useState<string>('');
  const agentSelection = useMemo(
    () => resolveAgentSelection(agents, task.agentName, selectedAgentKey),
    [agents, selectedAgentKey, task.agentName]
  );
  const selectedAgent = agentSelection.selectedAgent;

  useEffect(() => {
    if (selectedAgentKey !== agentSelection.selectedAgentKey) {
      setSelectedAgentKey(agentSelection.selectedAgentKey);
    }
  }, [agentSelection.selectedAgentKey, selectedAgentKey]);
  const handleSelectAgent = useCallback((agentKey: string) => {
    setSelectedAgentKey((current) => (current === agentKey ? current : agentKey));
  }, []);
  const handleAssignSelectedAgent = useCallback(() => {
    if (selectedAgent) {
      onAssign(task.id, selectedAgent);
    }
  }, [onAssign, selectedAgent, task.id]);

  return (
    <SecondaryPage title={t('tasks.page.assignTask')} onBack={onBack}>
      <View className={ASSIGNMENT_SUMMARY_CLASS}>
        <Text className={ASSIGNMENT_EYEBROW_CLASS}>{t(STAGE_LABEL_KEYS[task.stage])}</Text>
        <Text className={ASSIGNMENT_TITLE_CLASS}>{task.title}</Text>
        <Text className={ASSIGNMENT_BODY_CLASS}>{task.outcome}</Text>
      </View>

      <View className={SECTION_BLOCK_CLASS}>
        <View className={SECTION_HEADER_CLASS}>
          <Text className={SECTION_TITLE_CLASS}>{t('tasks.section.selectAgent')}</Text>
          <Text className={SECTION_META_CLASS}>{t('tasks.section.sortByFit')}</Text>
        </View>
        <View className={AGENT_CHOICE_LIST_CLASS}>
          {agents.length > 0 ? (
            agents.map((agent) => (
              <AgentChoice
                key={agent.key}
                agent={agent}
                selected={selectedAgent?.key === agent.key}
                onSelect={handleSelectAgent}
              />
            ))
          ) : (
            <Text className={STATE_BODY_CLASS}>{t('tasks.agent.empty')}</Text>
          )}
        </View>
      </View>

      <View className={FORM_BLOCK_CLASS}>
        <Text className={FORM_TITLE_CLASS}>{t('tasks.form.afterAssign')}</Text>
        <OptionRow label={t('tasks.form.enterStage')} value={t('tasks.stage.running')} />
        <OptionRow label={t('tasks.form.notifyBy')} value={t('tasks.form.notifyByValue')} />
        <OptionRow label={t('tasks.form.manualReview')} value={t('tasks.form.manualReviewValue')} />
      </View>

      {error ? (
        <View className={STATE_BLOCK_CLASS}>
          <Text className={STATE_TITLE_CLASS}>{error}</Text>
        </View>
      ) : null}

      <View className={STICKY_ACTION_BLOCK_CLASS}>
        <PlainButton
          label={
            pending ? t('common.loading') : running ? t('tasks.action.alreadyRunning') : t('tasks.action.assignAndRun')
          }
          variant="primary"
          disabled={!selectedAgent || pending || running}
          onPress={handleAssignSelectedAgent}
        />
      </View>
    </SecondaryPage>
  );
}

type AgentChoiceProps = {
  agent: AgentOption;
  selected: boolean;
  onSelect: (agentKey: string) => void;
};

const AgentChoice = memo(function AgentChoice({ agent, selected, onSelect }: AgentChoiceProps) {
  const tone = getAvatarTone(agent.name);
  const statusDotClass = cn(STATUS_DOT_CLASS, AGENT_STATUS_DOT_CLASS_BY_STATUS[agent.status]);
  const handleSelect = useCallback(() => {
    onSelect(agent.key);
  }, [agent.key, onSelect]);

  return (
    <Pressable
      className={cn(AGENT_CHOICE_CLASS, selected ? AGENT_CHOICE_SELECTED_CLASS : null)}
      onPress={handleSelect}
    >
      <View className={AGENT_AVATAR_CLASS} style={{ backgroundColor: tone.backgroundColor }}>
        <Text className={AGENT_AVATAR_TEXT_CLASS} style={{ color: tone.foregroundColor }}>
          {getAvatarLabel(agent.name)}
        </Text>
      </View>
      <View className={AGENT_COMPACT_TEXT_CLASS}>
        <Text numberOfLines={1} className={AGENT_NAME_CLASS}>
          {agent.name}
        </Text>
        <Text numberOfLines={2} className={AGENT_FIT_CLASS}>
          {agent.fitText}
        </Text>
      </View>
      <View className={AGENT_LOAD_BLOCK_CLASS}>
        <View className={statusDotClass} />
        <Text className={AGENT_LOAD_TEXT_CLASS}>{agent.load}</Text>
      </View>
    </Pressable>
  );
});

type TaskDetailPageProps = {
  task: BoardTask;
  issue: KanbanIssue;
  error: string | null;
  pending: boolean;
  onBack: () => void;
  onOpenAssign: (taskId: string) => void;
  onOpenChat: (issue: KanbanIssue, agentName: string) => void;
  onCompleteReview: (task: BoardTask) => void;
  onDeleteTask: (task: BoardTask, issue: KanbanIssue) => void;
};

function TaskDetailPage({
  task,
  issue,
  error,
  pending,
  onBack,
  onOpenAssign,
  onOpenChat,
  onCompleteReview,
  onDeleteTask
}: TaskDetailPageProps) {
  const t = useT();
  const activeIndex = LIFECYCLE.findIndex((step) => step.stage === task.stage);
  const progress = clampProgress(task.progress);
  const canOpenChat = Boolean(String(issue.chatId || '').trim());
  const canRestart = issue.runState === 'failed' || issue.runState === 'cancelled';
  const canAssignAndRun = !canRestart && (task.stage === 'intake' || task.stage === 'assigned');
  const canCompleteReview = !canRestart && task.stage === 'review';
  const showPrimaryAction = canRestart || canAssignAndRun || canCompleteReview;
  const primaryActionLabel = canRestart
    ? t('tasks.action.restart')
    : canCompleteReview
      ? t('tasks.action.completeReview')
      : t('tasks.action.assignAndRun');
  const chatActionIsPrimary = canOpenChat && !showPrimaryAction;
  const handlePrimaryAction = useCallback(() => {
    if (canCompleteReview) {
      onCompleteReview(task);
      return;
    }
    onOpenAssign(task.id);
  }, [canCompleteReview, onCompleteReview, onOpenAssign, task]);
  const handleOpenChat = useCallback(() => {
    onOpenChat(issue, task.agentName);
  }, [issue, onOpenChat, task.agentName]);
  const handleDeleteTask = useCallback(() => {
    onDeleteTask(task, issue);
  }, [issue, onDeleteTask, task]);

  return (
    <SecondaryPage title={t('tasks.page.taskDetail')} onBack={onBack}>
      <View className={DETAIL_HERO_CLASS}>
        <View className={DETAIL_TITLE_ROW_CLASS}>
          <Text className={DETAIL_STAGE_CLASS}>{t(STAGE_LABEL_KEYS[task.stage])}</Text>
          <Text className={DETAIL_DUE_CLASS}>{task.dueLabel}</Text>
        </View>
        <Text className={DETAIL_TITLE_CLASS}>{task.title}</Text>
        <Text className={DETAIL_BODY_CLASS}>{task.outcome}</Text>
        <View className={PROGRESS_TRACK_CLASS}>
          <View className={PROGRESS_FILL_CLASS} style={{ width: `${progress}%` }} />
        </View>
      </View>

      <View className={FORM_BLOCK_CLASS}>
        <Text className={FORM_TITLE_CLASS}>{t('tasks.form.nextStep')}</Text>
        <OptionRow label={t('tasks.form.action')} value={task.nextAction} />
        <OptionRow label={t('tasks.form.owner')} value={task.agentName} />
        <OptionRow label={t('tasks.form.risk')} value={task.blocker ?? t('tasks.risk.none')} />
      </View>

      <View className={SECTION_BLOCK_CLASS}>
        <Text className={SECTION_TITLE_CLASS}>{t('tasks.section.lifecycle')}</Text>
        <View className={LIFECYCLE_CLASS}>
          {LIFECYCLE.map((step, index) => {
            const reached = index <= activeIndex;
            return (
              <View key={step.stage} className={LIFECYCLE_ITEM_CLASS}>
                <View
                  className={cn(
                    LIFECYCLE_DOT_CLASS,
                    reached ? LIFECYCLE_DOT_REACHED_CLASS : LIFECYCLE_DOT_PENDING_CLASS
                  )}
                />
                <Text className={cn(LIFECYCLE_TEXT_CLASS, reached ? LIFECYCLE_TEXT_REACHED_CLASS : null)}>
                  {t(step.labelKey)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {error ? (
        <View className={STATE_BLOCK_CLASS}>
          <Text className={STATE_TITLE_CLASS}>{error}</Text>
        </View>
      ) : null}

      <View className={STICKY_ACTION_BLOCK_CLASS}>
        <PlainButton
          label={canOpenChat ? t('tasks.action.openChat') : t('tasks.action.chatUnavailable')}
          variant={chatActionIsPrimary ? 'primary' : 'secondary'}
          disabled={!canOpenChat}
          onPress={handleOpenChat}
        />
        {showPrimaryAction ? (
          <PlainButton
            label={pending ? t('common.loading') : primaryActionLabel}
            variant={chatActionIsPrimary ? 'secondary' : 'primary'}
            disabled={pending}
            onPress={handlePrimaryAction}
          />
        ) : null}
        <PlainButton
          label={t('tasks.action.deleteTask')}
          variant="danger"
          disabled={pending}
          onPress={handleDeleteTask}
        />
      </View>
    </SecondaryPage>
  );
}

export function AgentTaskBoardScreen() {
  const t = useT();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [selectedQueue, setSelectedQueue] = useState<BoardQueue>('focus');
  const tabBarHeight = useAppTabBarHeight();
  const contentBottomPadding = tabBarHeight + appVisualTokens.spacing.xxl;
  const { tasks, agents, loading, error, refresh } = useAgentTaskBoard();

  const openNewTask = useCallback(() => {
    navigation.navigate('TaskBoardFlow', { screen: 'NewTask' });
  }, [navigation]);
  const openAssign = useCallback(
    (taskId: string) => {
      navigation.navigate('TaskBoardFlow', { screen: 'AssignTask', params: { taskId } });
    },
    [navigation]
  );
  const openTask = useCallback(
    (taskId: string) => {
      navigation.navigate('TaskBoardFlow', { screen: 'TaskDetail', params: { taskId } });
    },
    [navigation]
  );
  const retryLoadBoard = useCallback(() => {
    void refresh();
  }, [refresh]);
  const headerActions = useMemo(
    () =>
      [<HeaderActionButton key="add" usage="chatHome.add" onPress={openNewTask} />] as const satisfies readonly [
        ReactElement
      ],
    [openNewTask]
  );

  return (
    <View className={SCREEN_CLASS}>
      <SafeAreaView edges={['top']} className={HEADER_SAFE_AREA_CLASS}>
        <ScreenHeader title={t('tabs.tasks')} rightActions={headerActions} />
      </SafeAreaView>

      <HomeScreen
        tasks={tasks}
        agents={agents}
        selectedQueue={selectedQueue}
        contentBottomPadding={contentBottomPadding}
        loading={loading}
        error={error}
        onSelectQueue={setSelectedQueue}
        onOpenNewTask={openNewTask}
        onOpenAssign={openAssign}
        onOpenTask={openTask}
        onRetry={retryLoadBoard}
      />
    </View>
  );
}

export function AgentTaskBoardNewTaskScreen({ navigation }: AgentTaskBoardNewTaskScreenProps) {
  const { createTask, creating, error } = useAgentTaskBoard();
  const [draft, setDraft] = useState<TaskDraftForm>(createEmptyTaskDraft);
  const handleGoBack = useCallback(() => navigation.goBack(), [navigation]);
  const updateDraftTitle = useCallback((title: string) => {
    setDraft((current) => (current.title === title ? current : { ...current, title }));
  }, []);
  const updateDraftDescription = useCallback((description: string) => {
    setDraft((current) => (current.description === description ? current : { ...current, description }));
  }, []);
  const updateDraftPriority = useCallback((priority: TaskPriority) => {
    setDraft((current) => (current.priority === priority ? current : { ...current, priority }));
  }, []);
  const createDraftTask = useCallback(async () => {
    const nextTaskId = await createTask(draft);
    if (nextTaskId) {
      setDraft(createEmptyTaskDraft());
      navigation.replace('AssignTask', { taskId: nextTaskId });
    }
  }, [createTask, draft, navigation]);

  return (
    <NewTaskPage
      draft={draft}
      error={error}
      onBack={handleGoBack}
      onChangeDescription={updateDraftDescription}
      onChangePriority={updateDraftPriority}
      onChangeTitle={updateDraftTitle}
      onCreateDraft={createDraftTask}
      saving={creating}
    />
  );
}

export function AgentTaskBoardAssignTaskScreen({ navigation, route }: AgentTaskBoardAssignTaskScreenProps) {
  const t = useT();
  const { taskById, issueById, agents, loading, error, pendingIssueIds, assignAndRunTask } = useAgentTaskBoard();
  const taskId = route.params.taskId;
  const task = taskById.get(taskId);
  const issue = issueById.get(taskId);
  const pending = pendingIssueIds.has(taskId);
  const handleGoBack = useCallback(() => navigation.goBack(), [navigation]);
  const handleAssignAndRunTask = useCallback(
    async (nextTaskId: string, agent: AgentOption) => {
      try {
        await assignAndRunTask(nextTaskId, agent);
        if (navigation.getState().routes.length > 1) {
          navigation.goBack();
          return;
        }
        navigation.replace('TaskDetail', { taskId: nextTaskId });
      } catch {
        // The hook keeps the user-facing error; stay on the current page.
      }
    },
    [assignAndRunTask, navigation]
  );

  if (!task) {
    return (
      <SecondaryPage title={t('tasks.page.assignTask')} onBack={handleGoBack}>
        <View className={STATE_BLOCK_CLASS}>
          <Text className={STATE_TITLE_CLASS}>{loading ? t('common.loading') : t('tasks.emptyHint')}</Text>
        </View>
      </SecondaryPage>
    );
  }

  return (
    <AssignTaskPage
      task={task}
      agents={agents}
      error={error}
      pending={pending}
      running={issue?.runState === 'running'}
      onBack={handleGoBack}
      onAssign={handleAssignAndRunTask}
    />
  );
}

export function AgentTaskBoardTaskDetailScreen({ navigation, route }: AgentTaskBoardTaskDetailScreenProps) {
  const t = useT();
  const { taskById, issueById, loading, error, pendingIssueIds, completeReview, deleteTask } = useAgentTaskBoard();
  const taskId = route.params.taskId;
  const task = taskById.get(taskId);
  const issue = issueById.get(taskId);
  const pending = pendingIssueIds.has(taskId);
  const handleGoBack = useCallback(() => navigation.goBack(), [navigation]);
  const openAssign = useCallback(
    (nextTaskId: string) => {
      navigation.navigate('AssignTask', { taskId: nextTaskId });
    },
    [navigation]
  );
  const openKanbanChat = useCallback(
    (nextIssue: KanbanIssue, agentName: string) => {
      const source = getPairedChatSource();
      if (!source) {
        return;
      }
      const params = buildKanbanChatDetailParams(nextIssue, agentName, source);
      if (params) {
        navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate('ChatDetail', params);
      }
    },
    [navigation]
  );
  const handleCompleteReview = useCallback(
    async (nextTask: BoardTask) => {
      try {
        await completeReview(nextTask);
      } catch {
        // The hook keeps the user-facing error; stay on the current page.
      }
    },
    [completeReview]
  );
  const closeTaskBoardFlow = useCallback(() => {
    const parentNavigation = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
    if (parentNavigation?.canGoBack()) {
      parentNavigation.goBack();
      return;
    }
    navigation.goBack();
  }, [navigation]);
  const handleDeleteTask = useCallback(
    (nextTask: BoardTask, nextIssue: KanbanIssue) => {
      const isRunningTask = nextIssue.runState === 'running' || (nextTask.stage === 'running' && !nextIssue.runState);
      Alert.alert(
        isRunningTask ? t('tasks.delete.runningTitle') : t('tasks.delete.title'),
        isRunningTask
          ? t('tasks.delete.runningBody', { title: nextTask.title })
          : t('tasks.delete.body', { title: nextTask.title }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('tasks.action.deleteTask'),
            style: 'destructive',
            onPress: () => {
              void deleteTask(nextTask)
                .then(closeTaskBoardFlow)
                .catch(() => {
                  // The hook keeps the Desktop error visible on the detail page.
                });
            }
          }
        ]
      );
    },
    [closeTaskBoardFlow, deleteTask, t]
  );

  if (!task || !issue) {
    return (
      <SecondaryPage title={t('tasks.page.taskDetail')} onBack={handleGoBack}>
        <View className={STATE_BLOCK_CLASS}>
          <Text className={STATE_TITLE_CLASS}>{loading ? t('common.loading') : t('tasks.emptyHint')}</Text>
        </View>
      </SecondaryPage>
    );
  }

  return (
    <TaskDetailPage
      task={task}
      issue={issue}
      error={error}
      pending={pending}
      onBack={handleGoBack}
      onOpenAssign={openAssign}
      onOpenChat={openKanbanChat}
      onCompleteReview={handleCompleteReview}
      onDeleteTask={handleDeleteTask}
    />
  );
}
