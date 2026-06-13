import { FlashList } from '@shopify/flash-list';
import { memo, ReactElement, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '../../shared/components/ScreenHeader';
import { AppIcon, type AppIconUsage } from '../../shared/icons/AppIcon';
import { type I18nKey, type TFunction, useT } from '../../shared/i18n';
import { useAppTheme, useAppThemeStyles } from '../../shared/visual/AppThemeProvider';
import { appVisualTokens, getAvatarLabel, getAvatarTone, type AppThemeTokens } from '../../shared/visual/foundation';
import { useAppTabBarHeight } from '../../shared/visual/useAppTabBarHeight';
import {
  createKanbanIssueApi,
  getKanbanSnapshotApi,
  moveKanbanIssueApi,
  updateKanbanIssueApi,
  type KanbanSnapshot
} from '../../core/api/services/kanbanApi';
import {
  applyKanbanChangeResult,
  createBoardTaskIndex,
  deriveAgentOptions,
  deriveBoardSummary,
  deriveBoardTasks,
  getAgentPreview,
  nextIssuePosition,
  type AgentOption,
  type BoardViewText,
  type BoardQueue,
  type BoardTask,
  type TaskPriority,
  type TaskStage
} from './kanbanViewModel';

type BoardRoute =
  | { name: 'home' }
  | { name: 'newTask' }
  | { name: 'assignTask'; taskId: string }
  | { name: 'taskDetail'; taskId: string };

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

type TaskDraftForm = {
  title: string;
  description: string;
  priority: TaskPriority;
};

function createEmptyTaskDraft(): TaskDraftForm {
  return {
    title: '',
    description: '',
    priority: 'medium'
  };
}

function createBoardViewText(t: TFunction): BoardViewText {
  return {
    noDescription: t('tasks.fallback.noDescription'),
    completedDue: t('tasks.fallback.completedDue'),
    unscheduledDue: t('tasks.fallback.unscheduledDue'),
    untitledTask: t('tasks.fallback.untitledTask'),
    unassignedAgent: t('tasks.agent.unassigned'),
    actionRunFailed: t('tasks.action.runFailed'),
    actionRunCancelled: t('tasks.action.runCancelled'),
    actionAssignAgent: t('tasks.action.assignAgent'),
    actionWaitingRun: t('tasks.action.waitingRun'),
    actionTrackRun: t('tasks.action.trackRun'),
    actionReview: t('tasks.action.reviewOrReturn'),
    actionArchive: t('tasks.action.archive'),
    blockerRunFailed: t('tasks.blocker.runFailed'),
    blockerRunCancelled: t('tasks.blocker.runCancelled'),
    blockerReviewRequired: t('tasks.blocker.reviewRequired'),
    catalogAgentFallback: t('tasks.agent.catalogFallback'),
    desktopOnline: t('tasks.agent.desktopOnline'),
    existingAssignee: t('tasks.agent.existingAssignee')
  };
}

function getPriorityColor(theme: AppThemeTokens, priority: TaskPriority): string {
  if (priority === 'high') {
    return theme.colors.danger;
  }
  if (priority === 'medium') {
    return theme.colors.warning;
  }
  return theme.colors.success;
}

function getStageColor(theme: AppThemeTokens, stage: TaskStage): string {
  if (stage === 'intake') {
    return theme.colors.textSecondary;
  }
  if (stage === 'assigned' || stage === 'running') {
    return theme.colors.brandBlue;
  }
  if (stage === 'review') {
    return theme.colors.warning;
  }
  return theme.colors.success;
}

function getAgentStatusColor(theme: AppThemeTokens, status: AgentOption['status']): string {
  if (status === 'ready') {
    return theme.colors.success;
  }
  if (status === 'waiting') {
    return theme.colors.warning;
  }
  return theme.colors.textTertiary;
}

function clampProgress(value: number): number {
  return Math.min(100, Math.max(0, value));
}

type HeaderActionButtonProps = {
  usage: AppIconUsage;
  onPress: () => void;
};

const HeaderActionButton = memo(function HeaderActionButton({ usage, onPress }: HeaderActionButtonProps) {
  const styles = useAppThemeStyles(createStyles);

  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.headerActionButton, pressed ? styles.pressed : null]}
      onPress={onPress}
    >
      <AppIcon usage={usage} size={22} />
    </Pressable>
  );
});

type PlainButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
};

const PlainButton = memo(function PlainButton({
  label,
  onPress,
  variant = 'secondary',
  disabled = false
}: PlainButtonProps) {
  const styles = useAppThemeStyles(createStyles);
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        isPrimary ? styles.buttonPrimary : styles.buttonSecondary,
        disabled ? styles.disabled : null,
        pressed ? styles.pressed : null
      ]}
      onPress={onPress}
    >
      <Text style={[styles.buttonText, isPrimary ? styles.buttonTextPrimary : null]}>{label}</Text>
    </Pressable>
  );
});

type StatusPillProps = {
  label: string;
  value: string;
  tone?: string;
};

const StatusPill = memo(function StatusPill({ label, value, tone }: StatusPillProps) {
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const resolvedTone = tone ?? theme.colors.brandBlue;

  return (
    <View style={styles.statusPill}>
      <View style={[styles.statusDot, { backgroundColor: resolvedTone }]} />
      <Text style={styles.statusPillLabel}>{label}</Text>
      <Text style={styles.statusPillValue}>{value}</Text>
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
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const summary = useMemo(() => deriveBoardSummary(tasks, selectedQueue), [selectedQueue, tasks]);
  const agentPreview = useMemo(() => getAgentPreview(agents), [agents]);
  const focusTask = summary.focusTask;
  const focusTaskId = focusTask?.id;
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
        <View style={styles.homeHeader}>
          <View style={styles.heroBlock}>
            <View style={styles.heroTitleRow}>
              <View style={styles.heroTextBlock}>
                <Text style={styles.heroEyebrow}>{t('tasks.hero.todayFocus')}</Text>
                <Text style={styles.heroTitle}>{focusTask ? focusTask.title : t('tasks.hero.stable')}</Text>
                <Text style={styles.heroBody}>
                  {focusTask?.blocker
                    ? focusTask.blocker
                    : focusTask
                      ? focusTask.nextAction
                      : t('tasks.hero.noIntervention')}
                </Text>
              </View>
              <View style={styles.heroCountBlock}>
                <Text style={styles.heroCountValue}>{summary.intakeCount + summary.reviewCount}</Text>
                <Text style={styles.heroCountLabel}>{t('tasks.hero.pending')}</Text>
              </View>
            </View>

            <View style={styles.heroActionRow}>
              <PlainButton
                label={t('tasks.action.assignTask')}
                variant="primary"
                disabled={!focusTask}
                onPress={handleAssignFocusTask}
              />
              <PlainButton label={t('tasks.action.newTask')} onPress={onOpenNewTask} />
            </View>
          </View>

          <View style={styles.statusRow}>
            <StatusPill label={t('tasks.stage.intake')} value={`${summary.intakeCount}`} />
            <StatusPill label={t('tasks.stage.review')} value={`${summary.reviewCount}`} tone={theme.colors.warning} />
            <StatusPill
              label={t('tasks.status.blocked')}
              value={`${summary.blockedCount}`}
              tone={theme.colors.danger}
            />
          </View>

          <View style={styles.queueSwitch}>
            {QUEUES.map((queue) => {
              const selected = selectedQueue === queue.id;
              return (
                <Pressable
                  key={queue.id}
                  style={({ pressed }) => [
                    styles.queueSwitchItem,
                    selected ? styles.queueSwitchItemSelected : null,
                    pressed ? styles.pressed : null
                  ]}
                  onPress={() => onSelectQueue(queue.id)}
                >
                  <Text style={[styles.queueSwitchText, selected ? styles.queueSwitchTextSelected : null]}>
                    {t(queue.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('tasks.section.tasks')}</Text>
            <Text style={styles.sectionMeta}>{t('tasks.countItems', { count: summary.visibleTasks.length })}</Text>
          </View>
          {error ? (
            <View style={styles.stateBlock}>
              <Text style={styles.stateTitle}>{error}</Text>
              <PlainButton label={t('common.retry')} onPress={onRetry} />
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.stateBlock}>
          <Text style={styles.stateTitle}>{loading ? t('common.loading') : t('tasks.hero.stable')}</Text>
          <Text style={styles.stateBody}>
            {loading
              ? t('tasks.loadingHint')
              : tasks.length > 0
                ? t('tasks.hero.noIntervention')
                : t('tasks.emptyHint')}
          </Text>
        </View>
      }
      ListFooterComponent={
        <View style={styles.agentFooter}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('tasks.section.availableAgents')}</Text>
            <Text style={styles.sectionMeta}>{t('tasks.section.availableAgentsHint')}</Text>
          </View>
          <View style={styles.agentSummaryList}>
            {agentPreview.length > 0 ? (
              agentPreview.map((agent) => <AgentCompactRow key={agent.key} agent={agent} />)
            ) : (
              <Text style={styles.stateBody}>{t('tasks.agent.empty')}</Text>
            )}
          </View>
        </View>
      }
      contentContainerStyle={[styles.homeListContent, { paddingBottom: contentBottomPadding }]}
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
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const priorityColor = getPriorityColor(theme, task.priority);
  const stageColor = getStageColor(theme, task.stage);
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
    <View style={styles.taskRow}>
      <View style={[styles.taskStageBar, { backgroundColor: stageColor }]} />
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.taskRowMain, pressed ? styles.rowPressed : null]}
        onPress={handleOpenTask}
      >
        <View style={styles.taskRowTitleLine}>
          <Text numberOfLines={1} style={styles.taskRowTitle}>
            {task.title}
          </Text>
          <View style={styles.priorityMini}>
            <View style={[styles.priorityDot, { backgroundColor: priorityColor }]} />
            <Text style={[styles.priorityMiniText, { color: priorityColor }]}>
              {t(PRIORITY_LABEL_KEYS[task.priority])}
            </Text>
          </View>
        </View>
        <Text numberOfLines={2} style={styles.taskOutcome}>
          {task.outcome}
        </Text>
        <View style={styles.taskRowMeta}>
          <Text numberOfLines={1} style={styles.taskMetaText}>
            {t(STAGE_LABEL_KEYS[task.stage])} · {task.agentName}
          </Text>
          <Text style={styles.taskMetaText}>{task.dueLabel}</Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.rowActionButton, pressed ? styles.pressed : null]}
        onPress={actionHandler}
      >
        <Text style={styles.rowActionText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
});

type AgentCompactRowProps = {
  agent: AgentOption;
};

const AgentCompactRow = memo(function AgentCompactRow({ agent }: AgentCompactRowProps) {
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const tone = getAvatarTone(agent.name);
  const statusColor = getAgentStatusColor(theme, agent.status);

  return (
    <View style={styles.agentCompactRow}>
      <View style={[styles.agentAvatar, { backgroundColor: tone.backgroundColor }]}>
        <Text style={[styles.agentAvatarText, { color: tone.foregroundColor }]}>{getAvatarLabel(agent.name)}</Text>
      </View>
      <View style={styles.agentCompactText}>
        <Text numberOfLines={1} style={styles.agentName}>
          {agent.name}
        </Text>
        <Text numberOfLines={1} style={styles.agentFit}>
          {agent.fitText}
        </Text>
      </View>
      <View style={styles.agentLoadBlock}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={styles.agentLoadText}>{agent.load}</Text>
      </View>
    </View>
  );
});

type SecondaryPageProps = {
  title: string;
  contentBottomPadding: number;
  onBack: () => void;
  children: ReactElement | readonly ReactElement[];
};

function SecondaryPage({ title, contentBottomPadding, onBack, children }: SecondaryPageProps) {
  const styles = useAppThemeStyles(createStyles);
  const backAction = [
    <HeaderActionButton key="back" usage="chatDetail.back" onPress={onBack} />
  ] as const satisfies readonly [ReactElement];

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <ScreenHeader title={title} leftActions={backAction} />
      </SafeAreaView>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.secondaryContent, { paddingBottom: contentBottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}

type NewTaskPageProps = {
  draft: TaskDraftForm;
  contentBottomPadding: number;
  onBack: () => void;
  onChangeDescription: (description: string) => void;
  onChangePriority: (priority: TaskPriority) => void;
  onChangeTitle: (title: string) => void;
  onCreateDraft: () => void;
  saving: boolean;
};

function NewTaskPage({
  draft,
  contentBottomPadding,
  onBack,
  onChangeDescription,
  onChangePriority,
  onChangeTitle,
  onCreateDraft,
  saving
}: NewTaskPageProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const canSubmit = draft.title.trim().length > 0 && !saving;

  return (
    <SecondaryPage title={t('tasks.page.newTask')} contentBottomPadding={contentBottomPadding} onBack={onBack}>
      <View style={styles.formBlock}>
        <Text style={styles.formTitle}>{t('tasks.form.draft')}</Text>
        <View style={styles.draftField}>
          <Text style={styles.fieldLabel}>{t('tasks.form.title')}</Text>
          <TextInput
            accessibilityLabel={t('tasks.form.title')}
            autoCapitalize="sentences"
            placeholder={t('tasks.form.titlePlaceholder')}
            placeholderTextColor={theme.colors.textTertiary}
            returnKeyType="next"
            style={styles.textInput}
            value={draft.title}
            onChangeText={onChangeTitle}
          />
        </View>
        <View style={styles.draftField}>
          <Text style={styles.fieldLabel}>{t('tasks.form.description')}</Text>
          <TextInput
            accessibilityLabel={t('tasks.form.description')}
            multiline
            placeholder={t('tasks.form.descriptionPlaceholder')}
            placeholderTextColor={theme.colors.textTertiary}
            style={[styles.textInput, styles.textAreaInput]}
            textAlignVertical="top"
            value={draft.description}
            onChangeText={onChangeDescription}
          />
        </View>
      </View>

      <View style={styles.formBlock}>
        <Text style={styles.formTitle}>{t('tasks.form.execution')}</Text>
        <View style={styles.draftField}>
          <Text style={styles.fieldLabel}>{t('tasks.form.priority')}</Text>
          <View style={styles.priorityChoiceRow}>
            {TASK_PRIORITIES.map((priority) => {
              const selected = draft.priority === priority;
              const priorityColor = getPriorityColor(theme, priority);
              return (
                <Pressable
                  key={priority}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.priorityChoice,
                    selected ? styles.priorityChoiceSelected : null,
                    pressed ? styles.pressed : null
                  ]}
                  onPress={() => onChangePriority(priority)}
                >
                  <View style={[styles.priorityDot, { backgroundColor: priorityColor }]} />
                  <Text style={[styles.priorityChoiceText, selected ? styles.priorityChoiceTextSelected : null]}>
                    {t(PRIORITY_LABEL_KEYS[priority])}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <OptionRow label={t('tasks.form.initialStage')} value={t('tasks.stage.intake')} />
      </View>

      <View style={styles.stickyActionBlock}>
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
  const styles = useAppThemeStyles(createStyles);

  return (
    <View style={styles.optionRow}>
      <Text style={styles.optionLabel}>{label}</Text>
      <Text style={styles.optionValue}>{value}</Text>
    </View>
  );
}

type AssignTaskPageProps = {
  task: BoardTask;
  agents: readonly AgentOption[];
  contentBottomPadding: number;
  saving: boolean;
  onBack: () => void;
  onAssign: (taskId: string, agent: AgentOption) => void;
};

function AssignTaskPage({ task, agents, contentBottomPadding, saving, onBack, onAssign }: AssignTaskPageProps) {
  const t = useT();
  const styles = useAppThemeStyles(createStyles);
  const [selectedAgentKey, setSelectedAgentKey] = useState<string>(agents[0]?.key ?? '');
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.key === selectedAgentKey) ?? agents[0],
    [agents, selectedAgentKey]
  );

  useEffect(() => {
    if (!selectedAgent || selectedAgent.key !== selectedAgentKey) {
      setSelectedAgentKey(selectedAgent?.key ?? '');
    }
  }, [selectedAgent, selectedAgentKey]);

  return (
    <SecondaryPage title={t('tasks.page.assignTask')} contentBottomPadding={contentBottomPadding} onBack={onBack}>
      <View style={styles.assignmentSummary}>
        <Text style={styles.assignmentEyebrow}>{t('tasks.stage.intake')}</Text>
        <Text style={styles.assignmentTitle}>{task.title}</Text>
        <Text style={styles.assignmentBody}>{task.outcome}</Text>
      </View>

      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('tasks.section.selectAgent')}</Text>
          <Text style={styles.sectionMeta}>{t('tasks.section.sortByFit')}</Text>
        </View>
        <View style={styles.agentChoiceList}>
          {agents.length > 0 ? (
            agents.map((agent) => (
              <AgentChoice
                key={agent.key}
                agent={agent}
                selected={selectedAgent?.key === agent.key}
                onSelect={() => setSelectedAgentKey(agent.key)}
              />
            ))
          ) : (
            <Text style={styles.stateBody}>{t('tasks.agent.empty')}</Text>
          )}
        </View>
      </View>

      <View style={styles.formBlock}>
        <Text style={styles.formTitle}>{t('tasks.form.afterAssign')}</Text>
        <OptionRow label={t('tasks.form.enterStage')} value={t('tasks.stage.assigned')} />
        <OptionRow label={t('tasks.form.notifyBy')} value={t('tasks.form.notifyByValue')} />
        <OptionRow label={t('tasks.form.manualReview')} value={t('tasks.form.manualReviewValue')} />
      </View>

      <View style={styles.stickyActionBlock}>
        <PlainButton
          label={selectedAgent ? t('tasks.action.assignTo', { name: selectedAgent.name }) : t('tasks.action.assign')}
          variant="primary"
          disabled={!selectedAgent || saving}
          onPress={() => {
            if (selectedAgent) {
              onAssign(task.id, selectedAgent);
            }
          }}
        />
      </View>
    </SecondaryPage>
  );
}

type AgentChoiceProps = {
  agent: AgentOption;
  selected: boolean;
  onSelect: () => void;
};

function AgentChoice({ agent, selected, onSelect }: AgentChoiceProps) {
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const tone = getAvatarTone(agent.name);
  const statusColor = getAgentStatusColor(theme, agent.status);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.agentChoice,
        selected ? styles.agentChoiceSelected : null,
        pressed ? styles.pressed : null
      ]}
      onPress={onSelect}
    >
      <View style={[styles.agentAvatar, { backgroundColor: tone.backgroundColor }]}>
        <Text style={[styles.agentAvatarText, { color: tone.foregroundColor }]}>{getAvatarLabel(agent.name)}</Text>
      </View>
      <View style={styles.agentCompactText}>
        <Text numberOfLines={1} style={styles.agentName}>
          {agent.name}
        </Text>
        <Text numberOfLines={2} style={styles.agentFit}>
          {agent.fitText}
        </Text>
      </View>
      <View style={styles.agentLoadBlock}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={styles.agentLoadText}>{agent.load}</Text>
      </View>
    </Pressable>
  );
}

type TaskDetailPageProps = {
  task: BoardTask;
  contentBottomPadding: number;
  saving: boolean;
  onBack: () => void;
  onOpenAssign: (taskId: string) => void;
  onCompleteReview: (task: BoardTask) => void;
};

function TaskDetailPage({
  task,
  contentBottomPadding,
  saving,
  onBack,
  onOpenAssign,
  onCompleteReview
}: TaskDetailPageProps) {
  const t = useT();
  const styles = useAppThemeStyles(createStyles);
  const activeIndex = LIFECYCLE.findIndex((step) => step.stage === task.stage);
  const progress = clampProgress(task.progress);
  const handlePrimaryAction = useCallback(() => {
    if (task.stage === 'review') {
      onCompleteReview(task);
      return;
    }
    onOpenAssign(task.id);
  }, [onCompleteReview, onOpenAssign, task]);

  return (
    <SecondaryPage title={t('tasks.page.taskDetail')} contentBottomPadding={contentBottomPadding} onBack={onBack}>
      <View style={styles.detailHero}>
        <View style={styles.detailTitleRow}>
          <Text style={styles.detailStage}>{t(STAGE_LABEL_KEYS[task.stage])}</Text>
          <Text style={styles.detailDue}>{task.dueLabel}</Text>
        </View>
        <Text style={styles.detailTitle}>{task.title}</Text>
        <Text style={styles.detailBody}>{task.outcome}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      </View>

      <View style={styles.formBlock}>
        <Text style={styles.formTitle}>{t('tasks.form.nextStep')}</Text>
        <OptionRow label={t('tasks.form.action')} value={task.nextAction} />
        <OptionRow label={t('tasks.form.owner')} value={task.agentName} />
        <OptionRow label={t('tasks.form.risk')} value={task.blocker ?? t('tasks.risk.none')} />
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>{t('tasks.section.lifecycle')}</Text>
        <View style={styles.lifecycle}>
          {LIFECYCLE.map((step, index) => {
            const reached = index <= activeIndex;
            return (
              <View key={step.stage} style={styles.lifecycleItem}>
                <View
                  style={[styles.lifecycleDot, reached ? styles.lifecycleDotReached : styles.lifecycleDotPending]}
                />
                <Text style={[styles.lifecycleText, reached ? styles.lifecycleTextReached : null]}>
                  {t(step.labelKey)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.formBlock}>
        <Text style={styles.formTitle}>{t('tasks.section.recentRecords')}</Text>
        <TimelineRow time="13:20" text={t('tasks.record.firstPlan')} />
        <TimelineRow time="13:42" text={t('tasks.record.waitingOwner')} />
        <TimelineRow time="14:10" text={t('tasks.record.readyForReview')} />
      </View>

      <View style={styles.stickyActionBlock}>
        <PlainButton
          label={
            saving
              ? t('common.loading')
              : task.stage === 'intake'
                ? t('tasks.action.goAssign')
                : task.stage === 'review'
                  ? t('tasks.action.passReview')
                  : t('tasks.action.reassign')
          }
          variant="primary"
          disabled={saving}
          onPress={handlePrimaryAction}
        />
      </View>
    </SecondaryPage>
  );
}

type TimelineRowProps = {
  time: string;
  text: string;
};

const TimelineRow = memo(function TimelineRow({ time, text }: TimelineRowProps) {
  const styles = useAppThemeStyles(createStyles);

  return (
    <View style={styles.timelineRow}>
      <Text style={styles.timelineTime}>{time}</Text>
      <Text style={styles.timelineText}>{text}</Text>
    </View>
  );
});

function messageFromError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export function AgentTaskBoardScreen() {
  const t = useT();
  const styles = useAppThemeStyles(createStyles);
  const [route, setRoute] = useState<BoardRoute>({ name: 'home' });
  const [selectedQueue, setSelectedQueue] = useState<BoardQueue>('focus');
  const [snapshot, setSnapshot] = useState<KanbanSnapshot | null>(null);
  const [draft, setDraft] = useState<TaskDraftForm>(createEmptyTaskDraft);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const tabBarHeight = useAppTabBarHeight();
  const contentBottomPadding = tabBarHeight + appVisualTokens.spacing.xxl;
  const genericError = t('tasks.error.generic');
  const boardText = useMemo(() => createBoardViewText(t), [t]);
  const tasks = useMemo(() => deriveBoardTasks(snapshot, boardText), [boardText, snapshot]);
  const taskById = useMemo(() => createBoardTaskIndex(tasks), [tasks]);
  const agents = useMemo(() => deriveAgentOptions(snapshot, tasks, boardText), [boardText, snapshot, tasks]);

  const loadBoard = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const nextSnapshot = await getKanbanSnapshotApi('default', signal);
        setSnapshot(nextSnapshot);
      } catch (loadError) {
        if ((loadError as { name?: string }).name === 'AbortError') {
          return;
        }
        setError(messageFromError(loadError, genericError));
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [genericError]
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadBoard(controller.signal);
    return () => controller.abort();
  }, [loadBoard]);

  const openHome = useCallback(() => setRoute({ name: 'home' }), []);
  const openNewTask = useCallback(() => setRoute({ name: 'newTask' }), []);
  const openAssign = useCallback((taskId: string) => setRoute({ name: 'assignTask', taskId }), []);
  const openTask = useCallback((taskId: string) => setRoute({ name: 'taskDetail', taskId }), []);
  const retryLoadBoard = useCallback(() => {
    void loadBoard();
  }, [loadBoard]);
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
    const title = draft.title.trim();
    if (saving || !title) {
      return;
    }
    const description = draft.description.trim();
    setSaving(true);
    setError(null);
    try {
      const result = await createKanbanIssueApi({
        title,
        description,
        projectId: snapshot?.projectId ?? 'default',
        status: 'backlog',
        priority: draft.priority,
        severity: 'medium'
      });
      setSnapshot((current) => applyKanbanChangeResult(current, result));
      setDraft(createEmptyTaskDraft());
      const nextTaskId = result.issue?.id ?? result.issues?.[0]?.id;
      setRoute(nextTaskId ? { name: 'assignTask', taskId: nextTaskId } : { name: 'home' });
    } catch (createError) {
      setError(messageFromError(createError, genericError));
      setRoute({ name: 'home' });
    } finally {
      setSaving(false);
    }
  }, [draft.description, draft.priority, draft.title, genericError, saving, snapshot?.projectId]);
  const assignTask = useCallback(
    async (taskId: string, agent: AgentOption) => {
      if (saving) {
        return;
      }
      const task = taskById.get(taskId);
      setSaving(true);
      setError(null);
      try {
        const result = await updateKanbanIssueApi(
          taskId,
          {
            assigneeAgentKey: agent.key,
            status: 'todo',
            baseIssueRevision: task?.revision
          },
          snapshot?.projectId ?? 'default'
        );
        setSnapshot((current) => applyKanbanChangeResult(current, result));
        setRoute({ name: 'taskDetail', taskId });
      } catch (assignError) {
        setError(messageFromError(assignError, genericError));
        setRoute({ name: 'home' });
      } finally {
        setSaving(false);
      }
    },
    [genericError, saving, snapshot?.projectId, taskById]
  );
  const completeReview = useCallback(
    async (task: BoardTask) => {
      if (saving) {
        return;
      }
      setSaving(true);
      setError(null);
      try {
        const result = await moveKanbanIssueApi(
          task.id,
          'completed',
          nextIssuePosition(tasks, 'completed'),
          task.revision,
          snapshot?.projectId ?? 'default'
        );
        setSnapshot((current) => applyKanbanChangeResult(current, result));
        setRoute({ name: 'taskDetail', taskId: task.id });
      } catch (completeError) {
        setError(messageFromError(completeError, genericError));
        setRoute({ name: 'home' });
      } finally {
        setSaving(false);
      }
    },
    [genericError, saving, snapshot?.projectId, tasks]
  );
  const headerActions = useMemo(
    () =>
      [<HeaderActionButton key="add" usage="chatHome.add" onPress={openNewTask} />] as const satisfies readonly [
        ReactElement
      ],
    [openNewTask]
  );

  if (route.name === 'newTask') {
    return (
      <NewTaskPage
        draft={draft}
        contentBottomPadding={contentBottomPadding}
        onBack={openHome}
        onChangeDescription={updateDraftDescription}
        onChangePriority={updateDraftPriority}
        onChangeTitle={updateDraftTitle}
        onCreateDraft={createDraftTask}
        saving={saving}
      />
    );
  }

  if (route.name === 'assignTask') {
    const task = taskById.get(route.taskId);
    if (!task) {
      return (
        <SecondaryPage title={t('tasks.page.assignTask')} contentBottomPadding={contentBottomPadding} onBack={openHome}>
          <View style={styles.stateBlock}>
            <Text style={styles.stateTitle}>{t('tasks.emptyHint')}</Text>
          </View>
        </SecondaryPage>
      );
    }
    return (
      <AssignTaskPage
        task={task}
        agents={agents}
        contentBottomPadding={contentBottomPadding}
        saving={saving}
        onBack={openHome}
        onAssign={assignTask}
      />
    );
  }

  if (route.name === 'taskDetail') {
    const task = taskById.get(route.taskId);
    if (!task) {
      return (
        <SecondaryPage title={t('tasks.page.taskDetail')} contentBottomPadding={contentBottomPadding} onBack={openHome}>
          <View style={styles.stateBlock}>
            <Text style={styles.stateTitle}>{t('tasks.emptyHint')}</Text>
          </View>
        </SecondaryPage>
      );
    }
    return (
      <TaskDetailPage
        task={task}
        contentBottomPadding={contentBottomPadding}
        saving={saving}
        onBack={openHome}
        onOpenAssign={openAssign}
        onCompleteReview={completeReview}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
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

function createStyles(theme: AppThemeTokens) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.surface
    },
    headerSafeArea: {
      backgroundColor: theme.colors.surface
    },
    scrollView: {
      flex: 1
    },
    content: {
      paddingHorizontal: appVisualTokens.spacing.xl,
      paddingTop: appVisualTokens.spacing.lg,
      gap: appVisualTokens.spacing.xl
    },
    homeListContent: {
      paddingHorizontal: appVisualTokens.spacing.xl,
      paddingTop: appVisualTokens.spacing.lg
    },
    homeHeader: {
      gap: appVisualTokens.spacing.xl
    },
    secondaryContent: {
      paddingHorizontal: appVisualTokens.spacing.xl,
      paddingTop: appVisualTokens.spacing.lg,
      paddingBottom: appVisualTokens.spacing.xxl,
      gap: appVisualTokens.spacing.xl
    },
    pressed: {
      opacity: 0.62
    },
    disabled: {
      opacity: 0.45
    },
    headerActionButton: {
      width: 40,
      height: 40,
      borderRadius: appVisualTokens.radii.pill,
      alignItems: 'center',
      justifyContent: 'center'
    },
    heroBlock: {
      gap: appVisualTokens.spacing.lg,
      paddingBottom: appVisualTokens.spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.line
    },
    heroTitleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: appVisualTokens.spacing.lg
    },
    heroTextBlock: {
      flex: 1,
      minWidth: 0,
      gap: appVisualTokens.spacing.sm
    },
    heroEyebrow: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
      color: theme.colors.brandBlue
    },
    heroTitle: {
      fontSize: 24,
      lineHeight: 30,
      fontWeight: '800',
      color: theme.colors.textPrimary
    },
    heroBody: {
      fontSize: 15,
      lineHeight: 22,
      color: theme.colors.textSecondary
    },
    heroCountBlock: {
      width: 74,
      minHeight: 74,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: appVisualTokens.radii.sm,
      backgroundColor: theme.colors.brandBlueSoft
    },
    heroCountValue: {
      fontSize: 28,
      lineHeight: 34,
      fontWeight: '800',
      color: theme.colors.brandBlue
    },
    heroCountLabel: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
      color: theme.colors.brandBlue
    },
    heroActionRow: {
      flexDirection: 'row',
      gap: appVisualTokens.spacing.sm
    },
    button: {
      minHeight: 42,
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: appVisualTokens.radii.md,
      paddingHorizontal: appVisualTokens.spacing.md
    },
    buttonPrimary: {
      backgroundColor: theme.colors.brandBlueAction
    },
    buttonSecondary: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.lineStrong,
      backgroundColor: theme.colors.surface
    },
    buttonText: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '800',
      color: theme.colors.textPrimary
    },
    buttonTextPrimary: {
      color: theme.colors.onBrandBlueAction
    },
    statusRow: {
      flexDirection: 'row',
      gap: appVisualTokens.spacing.sm
    },
    statusPill: {
      flex: 1,
      minHeight: 38,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: appVisualTokens.spacing.xs,
      borderRadius: appVisualTokens.radii.pill,
      backgroundColor: theme.colors.surfaceMuted
    },
    statusDot: {
      width: 7,
      height: 7,
      borderRadius: appVisualTokens.radii.pill
    },
    statusPillLabel: {
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.textSecondary
    },
    statusPillValue: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '800',
      color: theme.colors.textPrimary
    },
    queueSwitch: {
      flexDirection: 'row',
      padding: 3,
      borderRadius: appVisualTokens.radii.md,
      backgroundColor: theme.colors.surfaceMuted
    },
    queueSwitchItem: {
      flex: 1,
      minHeight: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: appVisualTokens.radii.sm
    },
    queueSwitchItemSelected: {
      backgroundColor: theme.colors.surface
    },
    queueSwitchText: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '800',
      color: theme.colors.textSecondary
    },
    queueSwitchTextSelected: {
      color: theme.colors.brandBlue
    },
    sectionBlock: {
      gap: appVisualTokens.spacing.md
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: appVisualTokens.spacing.md
    },
    sectionTitle: {
      fontSize: 17,
      lineHeight: 23,
      fontWeight: '800',
      color: theme.colors.textPrimary
    },
    sectionMeta: {
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.textSecondary
    },
    stateBlock: {
      gap: appVisualTokens.spacing.sm,
      paddingVertical: appVisualTokens.spacing.lg
    },
    stateTitle: {
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '800',
      color: theme.colors.textPrimary
    },
    stateBody: {
      fontSize: 13,
      lineHeight: 19,
      color: theme.colors.textSecondary
    },
    taskRow: {
      minHeight: 104,
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: appVisualTokens.spacing.md,
      paddingVertical: appVisualTokens.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.line
    },
    rowPressed: {
      backgroundColor: theme.colors.surfaceMuted
    },
    taskStageBar: {
      width: 4,
      borderRadius: appVisualTokens.radii.pill
    },
    taskRowMain: {
      flex: 1,
      minWidth: 0,
      gap: appVisualTokens.spacing.xs,
      justifyContent: 'center',
      borderRadius: appVisualTokens.radii.sm
    },
    taskRowTitleLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: appVisualTokens.spacing.sm
    },
    taskRowTitle: {
      flex: 1,
      minWidth: 0,
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '800',
      color: theme.colors.textPrimary
    },
    priorityMini: {
      minHeight: 24,
      flexDirection: 'row',
      alignItems: 'center',
      gap: appVisualTokens.spacing.xs,
      paddingHorizontal: appVisualTokens.spacing.sm,
      borderRadius: appVisualTokens.radii.pill,
      backgroundColor: theme.colors.surfaceMuted
    },
    priorityDot: {
      width: 6,
      height: 6,
      borderRadius: appVisualTokens.radii.pill
    },
    priorityMiniText: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '800'
    },
    taskOutcome: {
      fontSize: 14,
      lineHeight: 21,
      color: theme.colors.textPrimary
    },
    taskRowMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: appVisualTokens.spacing.md
    },
    taskMetaText: {
      flexShrink: 1,
      fontSize: 12,
      lineHeight: 17,
      color: theme.colors.textSecondary
    },
    rowActionButton: {
      alignSelf: 'center',
      minWidth: 54,
      minHeight: 34,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: appVisualTokens.radii.pill,
      backgroundColor: theme.colors.brandBlueSoft
    },
    rowActionText: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '800',
      color: theme.colors.brandBlue
    },
    agentSummaryList: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.line
    },
    agentFooter: {
      gap: appVisualTokens.spacing.md,
      paddingTop: appVisualTokens.spacing.xl
    },
    agentCompactRow: {
      minHeight: 66,
      flexDirection: 'row',
      alignItems: 'center',
      gap: appVisualTokens.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.line
    },
    agentAvatar: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: appVisualTokens.radii.pill
    },
    agentAvatarText: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '800'
    },
    agentCompactText: {
      flex: 1,
      minWidth: 0,
      gap: 2
    },
    agentName: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '800',
      color: theme.colors.textPrimary
    },
    agentFit: {
      fontSize: 12,
      lineHeight: 17,
      color: theme.colors.textSecondary
    },
    agentLoadBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: appVisualTokens.spacing.xs
    },
    agentLoadText: {
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '800',
      color: theme.colors.textSecondary
    },
    formBlock: {
      gap: appVisualTokens.spacing.md,
      paddingBottom: appVisualTokens.spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.line
    },
    formTitle: {
      fontSize: 17,
      lineHeight: 23,
      fontWeight: '800',
      color: theme.colors.textPrimary
    },
    draftField: {
      gap: appVisualTokens.spacing.xs,
      paddingVertical: appVisualTokens.spacing.sm
    },
    fieldLabel: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '800',
      color: theme.colors.brandBlue
    },
    textInput: {
      minHeight: 44,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.lineStrong,
      borderRadius: appVisualTokens.radii.sm,
      paddingHorizontal: appVisualTokens.spacing.md,
      paddingVertical: appVisualTokens.spacing.sm,
      fontSize: 15,
      lineHeight: 22,
      color: theme.colors.textPrimary,
      backgroundColor: theme.colors.surface
    },
    textAreaInput: {
      minHeight: 108
    },
    priorityChoiceRow: {
      flexDirection: 'row',
      gap: appVisualTokens.spacing.sm
    },
    priorityChoice: {
      flex: 1,
      minHeight: 42,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: appVisualTokens.spacing.xs,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.lineStrong,
      borderRadius: appVisualTokens.radii.sm,
      backgroundColor: theme.colors.surface
    },
    priorityChoiceSelected: {
      borderColor: theme.colors.brandBlue,
      backgroundColor: theme.colors.brandBlueSoft
    },
    priorityChoiceText: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '800',
      color: theme.colors.textSecondary
    },
    priorityChoiceTextSelected: {
      color: theme.colors.brandBlue
    },
    optionRow: {
      minHeight: 42,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: appVisualTokens.spacing.md
    },
    optionLabel: {
      fontSize: 14,
      lineHeight: 21,
      color: theme.colors.textSecondary
    },
    optionValue: {
      flexShrink: 1,
      fontSize: 15,
      lineHeight: 22,
      fontWeight: '800',
      color: theme.colors.textPrimary,
      textAlign: 'right'
    },
    stickyActionBlock: {
      gap: appVisualTokens.spacing.sm
    },
    assignmentSummary: {
      gap: appVisualTokens.spacing.sm,
      paddingBottom: appVisualTokens.spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.line
    },
    assignmentEyebrow: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '800',
      color: theme.colors.brandBlue
    },
    assignmentTitle: {
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '800',
      color: theme.colors.textPrimary
    },
    assignmentBody: {
      fontSize: 15,
      lineHeight: 22,
      color: theme.colors.textSecondary
    },
    agentChoiceList: {
      gap: appVisualTokens.spacing.sm
    },
    agentChoice: {
      minHeight: 72,
      flexDirection: 'row',
      alignItems: 'center',
      gap: appVisualTokens.spacing.md,
      padding: appVisualTokens.spacing.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.lineStrong,
      borderRadius: appVisualTokens.radii.sm,
      backgroundColor: theme.colors.surface
    },
    agentChoiceSelected: {
      borderColor: theme.colors.brandBlue,
      backgroundColor: theme.colors.brandBlueSoft
    },
    detailHero: {
      gap: appVisualTokens.spacing.md,
      paddingBottom: appVisualTokens.spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.line
    },
    detailTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: appVisualTokens.spacing.md
    },
    detailStage: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '800',
      color: theme.colors.brandBlue
    },
    detailDue: {
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.textSecondary
    },
    detailTitle: {
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '800',
      color: theme.colors.textPrimary
    },
    detailBody: {
      fontSize: 15,
      lineHeight: 22,
      color: theme.colors.textSecondary
    },
    progressTrack: {
      height: 6,
      overflow: 'hidden',
      borderRadius: appVisualTokens.radii.pill,
      backgroundColor: theme.colors.surfaceMuted
    },
    progressFill: {
      height: 6,
      borderRadius: appVisualTokens.radii.pill,
      backgroundColor: theme.colors.brandBlue
    },
    lifecycle: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: appVisualTokens.spacing.sm
    },
    lifecycleItem: {
      flex: 1,
      alignItems: 'center',
      gap: appVisualTokens.spacing.sm
    },
    lifecycleDot: {
      width: 18,
      height: 18,
      borderRadius: appVisualTokens.radii.pill
    },
    lifecycleDotReached: {
      backgroundColor: theme.colors.brandBlue
    },
    lifecycleDotPending: {
      backgroundColor: theme.colors.lineStrong
    },
    lifecycleText: {
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.textSecondary
    },
    lifecycleTextReached: {
      fontWeight: '800',
      color: theme.colors.textPrimary
    },
    timelineRow: {
      flexDirection: 'row',
      gap: appVisualTokens.spacing.md,
      paddingVertical: appVisualTokens.spacing.sm
    },
    timelineTime: {
      width: 46,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '800',
      color: theme.colors.textSecondary
    },
    timelineText: {
      flex: 1,
      minWidth: 0,
      fontSize: 14,
      lineHeight: 21,
      color: theme.colors.textPrimary
    }
  });
}
