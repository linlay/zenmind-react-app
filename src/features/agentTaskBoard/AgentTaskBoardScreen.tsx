import { FlashList } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { memo, ReactElement, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../../app/navigation/types';
import type { KanbanIssue } from '../../core/api/services/kanbanApi';
import { ScreenHeader } from '../../shared/components/ScreenHeader';
import { AppIcon, type AppIconUsage } from '../../shared/icons/AppIcon';
import { type I18nKey, useT } from '../../shared/i18n';
import { useAppTheme, useAppThemeStyles } from '../../shared/visual/AppThemeProvider';
import { appVisualTokens, getAvatarLabel, getAvatarTone, type AppThemeTokens } from '../../shared/visual/foundation';
import { useAppTabBarHeight } from '../../shared/visual/useAppTabBarHeight';
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
  variant?: 'primary' | 'secondary' | 'danger';
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
  const isDanger = variant === 'danger';

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        isPrimary ? styles.buttonPrimary : styles.buttonSecondary,
        isDanger ? styles.buttonDanger : null,
        disabled ? styles.disabled : null,
        pressed ? styles.pressed : null
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.buttonText,
          isPrimary ? styles.buttonTextPrimary : null,
          isDanger ? styles.buttonTextDanger : null
        ]}
      >
        {label}
      </Text>
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
  onBack: () => void;
  children: ReactNode;
};

function SecondaryPage({ title, onBack, children }: SecondaryPageProps) {
  const insets = useSafeAreaInsets();
  const styles = useAppThemeStyles(createStyles);
  const contentBottomPadding = insets.bottom + appVisualTokens.spacing.xxl;
  const backAction = useMemo(
    () => [<HeaderActionButton key="back" usage="chatDetail.back" onPress={onBack} />] as const satisfies readonly [
      ReactElement
    ],
    [onBack]
  );

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
  const styles = useAppThemeStyles(createStyles);
  const canSubmit = draft.title.trim().length > 0 && !saving;

  return (
    <SecondaryPage title={t('tasks.page.newTask')} onBack={onBack}>
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

      {error ? (
        <View style={styles.stateBlock}>
          <Text style={styles.stateTitle}>{error}</Text>
        </View>
      ) : null}

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
  const styles = useAppThemeStyles(createStyles);
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
      <View style={styles.assignmentSummary}>
        <Text style={styles.assignmentEyebrow}>{t(STAGE_LABEL_KEYS[task.stage])}</Text>
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
                onSelect={handleSelectAgent}
              />
            ))
          ) : (
            <Text style={styles.stateBody}>{t('tasks.agent.empty')}</Text>
          )}
        </View>
      </View>

      <View style={styles.formBlock}>
        <Text style={styles.formTitle}>{t('tasks.form.afterAssign')}</Text>
        <OptionRow label={t('tasks.form.enterStage')} value={t('tasks.stage.running')} />
        <OptionRow label={t('tasks.form.notifyBy')} value={t('tasks.form.notifyByValue')} />
        <OptionRow label={t('tasks.form.manualReview')} value={t('tasks.form.manualReviewValue')} />
      </View>

      {error ? (
        <View style={styles.stateBlock}>
          <Text style={styles.stateTitle}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.stickyActionBlock}>
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
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const tone = getAvatarTone(agent.name);
  const statusColor = getAgentStatusColor(theme, agent.status);
  const handleSelect = useCallback(() => {
    onSelect(agent.key);
  }, [agent.key, onSelect]);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.agentChoice,
        selected ? styles.agentChoiceSelected : null,
        pressed ? styles.pressed : null
      ]}
      onPress={handleSelect}
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
  const styles = useAppThemeStyles(createStyles);
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

      {error ? (
        <View style={styles.stateBlock}>
          <Text style={styles.stateTitle}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.stickyActionBlock}>
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
  const styles = useAppThemeStyles(createStyles);
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
  const styles = useAppThemeStyles(createStyles);
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
        <View style={styles.stateBlock}>
          <Text style={styles.stateTitle}>{loading ? t('common.loading') : t('tasks.emptyHint')}</Text>
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
  const styles = useAppThemeStyles(createStyles);
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
      const params = buildKanbanChatDetailParams(nextIssue, agentName);
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
        <View style={styles.stateBlock}>
          <Text style={styles.stateTitle}>{loading ? t('common.loading') : t('tasks.emptyHint')}</Text>
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
    buttonDanger: {
      borderColor: theme.colors.dangerLine,
      backgroundColor: theme.colors.dangerSoft
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
    buttonTextDanger: {
      color: theme.colors.danger
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
    }
  });
}
