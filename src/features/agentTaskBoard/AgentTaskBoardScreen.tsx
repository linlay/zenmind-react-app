import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { FlashList } from '@shopify/flash-list';
import { ReactElement, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '../../shared/components/ScreenHeader';
import { AppIcon, type AppIconUsage } from '../../shared/icons/AppIcon';
import { type I18nKey, type TFunction, useT } from '../../shared/i18n';
import { useAppTheme, useAppThemeStyles } from '../../shared/visual/AppThemeProvider';
import { appVisualTokens, getAvatarLabel, getAvatarTone, type AppThemeTokens } from '../../shared/visual/foundation';

type TaskStage = 'intake' | 'assigned' | 'running' | 'review' | 'done';
type TaskPriority = 'high' | 'medium' | 'low';
type BoardQueue = 'focus' | 'running' | 'review';
type BoardRoute =
  | { name: 'home' }
  | { name: 'newTask' }
  | { name: 'assignTask'; taskId?: string }
  | { name: 'taskDetail'; taskId: string };

type BoardTask = {
  id: string;
  titleKey: I18nKey;
  outcomeKey: I18nKey;
  stage: TaskStage;
  priority: TaskPriority;
  agentName: string;
  agentKey?: I18nKey;
  dueKey: I18nKey;
  nextActionKey: I18nKey;
  blockerKey?: I18nKey;
  progress: number;
};

type AgentOption = {
  name: string;
  load: string;
  fitKey: I18nKey;
  status: 'ready' | 'busy' | 'waiting';
};

type LifecycleStep = {
  stage: TaskStage;
  labelKey: I18nKey;
};

type BoardSummary = {
  visibleTasks: readonly BoardTask[];
  intakeCount: number;
  reviewCount: number;
  blockedCount: number;
  focusTask: BoardTask | undefined;
};

const TASKS: readonly BoardTask[] = [
  {
    id: 'task-001',
    titleKey: 'tasks.sample.task001.title',
    outcomeKey: 'tasks.sample.task001.outcome',
    stage: 'running',
    priority: 'high',
    agentName: 'UI Agent',
    dueKey: 'tasks.sample.task001.due',
    nextActionKey: 'tasks.sample.task001.nextAction',
    progress: 68
  },
  {
    id: 'task-002',
    titleKey: 'tasks.sample.task002.title',
    outcomeKey: 'tasks.sample.task002.outcome',
    stage: 'intake',
    priority: 'medium',
    agentName: '',
    agentKey: 'tasks.agent.unassigned',
    dueKey: 'tasks.sample.task002.due',
    nextActionKey: 'tasks.sample.task002.nextAction',
    progress: 10
  },
  {
    id: 'task-003',
    titleKey: 'tasks.sample.task003.title',
    outcomeKey: 'tasks.sample.task003.outcome',
    stage: 'intake',
    priority: 'high',
    agentName: '',
    agentKey: 'tasks.agent.unassigned',
    dueKey: 'tasks.sample.task003.due',
    nextActionKey: 'tasks.sample.task003.nextAction',
    blockerKey: 'tasks.sample.task003.blocker',
    progress: 0
  },
  {
    id: 'task-004',
    titleKey: 'tasks.sample.task004.title',
    outcomeKey: 'tasks.sample.task004.outcome',
    stage: 'assigned',
    priority: 'medium',
    agentName: 'Ops Agent',
    dueKey: 'tasks.sample.task004.due',
    nextActionKey: 'tasks.sample.task004.nextAction',
    progress: 28
  },
  {
    id: 'task-005',
    titleKey: 'tasks.sample.task005.title',
    outcomeKey: 'tasks.sample.task005.outcome',
    stage: 'review',
    priority: 'high',
    agentName: 'Reviewer',
    dueKey: 'tasks.sample.task005.due',
    nextActionKey: 'tasks.sample.task005.nextAction',
    blockerKey: 'tasks.sample.task005.blocker',
    progress: 86
  },
  {
    id: 'task-006',
    titleKey: 'tasks.sample.task006.title',
    outcomeKey: 'tasks.sample.task006.outcome',
    stage: 'done',
    priority: 'low',
    agentName: 'Writer',
    dueKey: 'tasks.sample.task006.due',
    nextActionKey: 'tasks.sample.task006.nextAction',
    progress: 100
  }
] as const;

const AGENTS: readonly AgentOption[] = [
  {
    name: 'UI Agent',
    load: '2/4',
    fitKey: 'tasks.agent.fit.ui',
    status: 'ready'
  },
  {
    name: 'Planner',
    load: '1/3',
    fitKey: 'tasks.agent.fit.planner',
    status: 'ready'
  },
  {
    name: 'Ops Agent',
    load: '3/3',
    fitKey: 'tasks.agent.fit.ops',
    status: 'busy'
  },
  {
    name: 'Reviewer',
    load: '2/2',
    fitKey: 'tasks.agent.fit.reviewer',
    status: 'waiting'
  }
] as const;

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

function getTaskById(taskId: string | undefined): BoardTask {
  return TASKS.find((task) => task.id === taskId) ?? TASKS[0];
}

function formatTaskAgentName(task: BoardTask, t: TFunction): string {
  return task.agentKey ? t(task.agentKey) : task.agentName;
}

function getBoardSummary(queue: BoardQueue): BoardSummary {
  const visibleTasks: BoardTask[] = [];
  let intakeCount = 0;
  let reviewCount = 0;
  let blockedCount = 0;
  let firstBlockedTask: BoardTask | undefined;
  let firstIntakeTask: BoardTask | undefined;

  TASKS.forEach((task) => {
    const isIntake = task.stage === 'intake';
    const isReview = task.stage === 'review';
    const isBlocked = Boolean(task.blockerKey);

    if (isIntake) {
      intakeCount += 1;
      firstIntakeTask ??= task;
    }
    if (isReview) {
      reviewCount += 1;
    }
    if (isBlocked) {
      blockedCount += 1;
      firstBlockedTask ??= task;
    }

    if (
      (queue === 'focus' && (isIntake || isBlocked)) ||
      (queue === 'running' && (task.stage === 'assigned' || task.stage === 'running')) ||
      (queue === 'review' && isReview)
    ) {
      visibleTasks.push(task);
    }
  });

  return {
    visibleTasks,
    intakeCount,
    reviewCount,
    blockedCount,
    focusTask: firstBlockedTask ?? firstIntakeTask
  };
}

function getAgentPreview(): readonly AgentOption[] {
  const readyAgents = AGENTS.filter((agent) => agent.status === 'ready');
  if (readyAgents.length >= 3) {
    return readyAgents.slice(0, 3);
  }

  return [...readyAgents, ...AGENTS.filter((agent) => agent.status !== 'ready')].slice(0, 3);
}

type HeaderActionButtonProps = {
  usage: AppIconUsage;
  onPress: () => void;
};

function HeaderActionButton({ usage, onPress }: HeaderActionButtonProps) {
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
}

type PlainButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
};

function PlainButton({ label, onPress, variant = 'secondary' }: PlainButtonProps) {
  const styles = useAppThemeStyles(createStyles);
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        isPrimary ? styles.buttonPrimary : styles.buttonSecondary,
        pressed ? styles.pressed : null
      ]}
      onPress={onPress}
    >
      <Text style={[styles.buttonText, isPrimary ? styles.buttonTextPrimary : null]}>{label}</Text>
    </Pressable>
  );
}

type StatusPillProps = {
  label: string;
  value: string;
  tone?: string;
};

function StatusPill({ label, value, tone }: StatusPillProps) {
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
}

type HomeScreenProps = {
  selectedQueue: BoardQueue;
  contentBottomPadding: number;
  onSelectQueue: (queue: BoardQueue) => void;
  onOpenNewTask: () => void;
  onOpenAssign: (taskId?: string) => void;
  onOpenTask: (taskId: string) => void;
};

function HomeScreen({
  selectedQueue,
  contentBottomPadding,
  onSelectQueue,
  onOpenNewTask,
  onOpenAssign,
  onOpenTask
}: HomeScreenProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const summary = useMemo(() => getBoardSummary(selectedQueue), [selectedQueue]);
  const agentPreview = useMemo(getAgentPreview, []);
  const focusTask = summary.focusTask;

  return (
    <FlashList
      data={summary.visibleTasks}
      keyExtractor={(task) => task.id}
      renderItem={({ item }) => (
        <TaskRow task={item} onOpenTask={() => onOpenTask(item.id)} onOpenAssign={() => onOpenAssign(item.id)} />
      )}
      ListHeaderComponent={
        <View style={styles.homeHeader}>
          <View style={styles.heroBlock}>
            <View style={styles.heroTitleRow}>
              <View style={styles.heroTextBlock}>
                <Text style={styles.heroEyebrow}>{t('tasks.hero.todayFocus')}</Text>
                <Text style={styles.heroTitle}>{focusTask ? t(focusTask.titleKey) : t('tasks.hero.stable')}</Text>
                <Text style={styles.heroBody}>
                  {focusTask?.blockerKey
                    ? t(focusTask.blockerKey)
                    : focusTask
                      ? t(focusTask.nextActionKey)
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
                onPress={() => onOpenAssign(focusTask?.id)}
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
        </View>
      }
      ListFooterComponent={
        <View style={styles.agentFooter}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('tasks.section.availableAgents')}</Text>
            <Text style={styles.sectionMeta}>{t('tasks.section.availableAgentsHint')}</Text>
          </View>
          <View style={styles.agentSummaryList}>
            {agentPreview.map((agent) => (
              <AgentCompactRow key={agent.name} agent={agent} />
            ))}
          </View>
        </View>
      }
      contentContainerStyle={[styles.homeListContent, { paddingBottom: contentBottomPadding }]}
      showsVerticalScrollIndicator={false}
      drawDistance={420}
    />
  );
}

type TaskRowProps = {
  task: BoardTask;
  onOpenTask: () => void;
  onOpenAssign: () => void;
};

function TaskRow({ task, onOpenTask, onOpenAssign }: TaskRowProps) {
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
  const actionHandler = shouldAssign ? onOpenAssign : onOpenTask;

  return (
    <View style={styles.taskRow}>
      <View style={[styles.taskStageBar, { backgroundColor: stageColor }]} />
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.taskRowMain, pressed ? styles.rowPressed : null]}
        onPress={onOpenTask}
      >
        <View style={styles.taskRowTitleLine}>
          <Text numberOfLines={1} style={styles.taskRowTitle}>
            {t(task.titleKey)}
          </Text>
          <View style={styles.priorityMini}>
            <View style={[styles.priorityDot, { backgroundColor: priorityColor }]} />
            <Text style={[styles.priorityMiniText, { color: priorityColor }]}>
              {t(PRIORITY_LABEL_KEYS[task.priority])}
            </Text>
          </View>
        </View>
        <Text numberOfLines={2} style={styles.taskOutcome}>
          {t(task.outcomeKey)}
        </Text>
        <View style={styles.taskRowMeta}>
          <Text numberOfLines={1} style={styles.taskMetaText}>
            {t(STAGE_LABEL_KEYS[task.stage])} · {formatTaskAgentName(task, t)}
          </Text>
          <Text style={styles.taskMetaText}>{t(task.dueKey)}</Text>
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
}

type AgentCompactRowProps = {
  agent: AgentOption;
};

function AgentCompactRow({ agent }: AgentCompactRowProps) {
  const t = useT();
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
          {t(agent.fitKey)}
        </Text>
      </View>
      <View style={styles.agentLoadBlock}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={styles.agentLoadText}>{agent.load}</Text>
      </View>
    </View>
  );
}

type SecondaryPageProps = {
  title: string;
  onBack: () => void;
  children: ReactElement | readonly ReactElement[];
};

function SecondaryPage({ title, onBack, children }: SecondaryPageProps) {
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
        contentContainerStyle={styles.secondaryContent}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}

type NewTaskPageProps = {
  onBack: () => void;
  onOpenAssign: () => void;
};

function NewTaskPage({ onBack, onOpenAssign }: NewTaskPageProps) {
  const t = useT();
  const styles = useAppThemeStyles(createStyles);

  return (
    <SecondaryPage title={t('tasks.page.newTask')} onBack={onBack}>
      <View style={styles.formBlock}>
        <Text style={styles.formTitle}>{t('tasks.form.draft')}</Text>
        <DraftField label={t('tasks.form.goal')} value={t('tasks.form.goalValue')} />
        <DraftField label={t('tasks.form.deliverable')} value={t('tasks.form.deliverableValue')} />
        <DraftField label={t('tasks.form.context')} value={t('tasks.form.contextValue')} />
      </View>

      <View style={styles.formBlock}>
        <Text style={styles.formTitle}>{t('tasks.form.execution')}</Text>
        <OptionRow label={t('tasks.form.priority')} value={t('tasks.priority.high')} />
        <OptionRow label={t('tasks.form.dueTime')} value={t('tasks.sample.task001.due')} />
        <OptionRow label={t('tasks.form.initialStage')} value={t('tasks.stage.intake')} />
      </View>

      <View style={styles.stickyActionBlock}>
        <PlainButton label={t('tasks.action.generateDraft')} variant="primary" onPress={onOpenAssign} />
        <PlainButton label={t('tasks.action.saveIncomplete')} onPress={onBack} />
      </View>
    </SecondaryPage>
  );
}

type DraftFieldProps = {
  label: string;
  value: string;
};

function DraftField({ label, value }: DraftFieldProps) {
  const styles = useAppThemeStyles(createStyles);

  return (
    <View style={styles.draftField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
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
  onBack: () => void;
  onOpenTask: (taskId: string) => void;
};

function AssignTaskPage({ task, onBack, onOpenTask }: AssignTaskPageProps) {
  const t = useT();
  const styles = useAppThemeStyles(createStyles);
  const [selectedAgent, setSelectedAgent] = useState<string>(AGENTS[0].name);

  return (
    <SecondaryPage title={t('tasks.page.assignTask')} onBack={onBack}>
      <View style={styles.assignmentSummary}>
        <Text style={styles.assignmentEyebrow}>{t('tasks.stage.intake')}</Text>
        <Text style={styles.assignmentTitle}>{t(task.titleKey)}</Text>
        <Text style={styles.assignmentBody}>{t(task.outcomeKey)}</Text>
      </View>

      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('tasks.section.selectAgent')}</Text>
          <Text style={styles.sectionMeta}>{t('tasks.section.sortByFit')}</Text>
        </View>
        <View style={styles.agentChoiceList}>
          {AGENTS.map((agent) => (
            <AgentChoice
              key={agent.name}
              agent={agent}
              selected={selectedAgent === agent.name}
              onSelect={() => setSelectedAgent(agent.name)}
            />
          ))}
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
          label={t('tasks.action.assignTo', { name: selectedAgent })}
          variant="primary"
          onPress={() => onOpenTask(task.id)}
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
  const t = useT();
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
          {t(agent.fitKey)}
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
  onBack: () => void;
  onOpenAssign: (taskId: string) => void;
};

function TaskDetailPage({ task, onBack, onOpenAssign }: TaskDetailPageProps) {
  const t = useT();
  const styles = useAppThemeStyles(createStyles);
  const activeIndex = LIFECYCLE.findIndex((step) => step.stage === task.stage);
  const progress = clampProgress(task.progress);

  return (
    <SecondaryPage title={t('tasks.page.taskDetail')} onBack={onBack}>
      <View style={styles.detailHero}>
        <View style={styles.detailTitleRow}>
          <Text style={styles.detailStage}>{t(STAGE_LABEL_KEYS[task.stage])}</Text>
          <Text style={styles.detailDue}>{t(task.dueKey)}</Text>
        </View>
        <Text style={styles.detailTitle}>{t(task.titleKey)}</Text>
        <Text style={styles.detailBody}>{t(task.outcomeKey)}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      </View>

      <View style={styles.formBlock}>
        <Text style={styles.formTitle}>{t('tasks.form.nextStep')}</Text>
        <OptionRow label={t('tasks.form.action')} value={t(task.nextActionKey)} />
        <OptionRow label={t('tasks.form.owner')} value={formatTaskAgentName(task, t)} />
        <OptionRow label={t('tasks.form.risk')} value={task.blockerKey ? t(task.blockerKey) : t('tasks.risk.none')} />
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
            task.stage === 'intake'
              ? t('tasks.action.goAssign')
              : task.stage === 'review'
                ? t('tasks.action.passReview')
                : t('tasks.action.reassign')
          }
          variant="primary"
          onPress={() => onOpenAssign(task.id)}
        />
      </View>
    </SecondaryPage>
  );
}

type TimelineRowProps = {
  time: string;
  text: string;
};

function TimelineRow({ time, text }: TimelineRowProps) {
  const styles = useAppThemeStyles(createStyles);

  return (
    <View style={styles.timelineRow}>
      <Text style={styles.timelineTime}>{time}</Text>
      <Text style={styles.timelineText}>{text}</Text>
    </View>
  );
}

export function AgentTaskBoardScreen() {
  const t = useT();
  const styles = useAppThemeStyles(createStyles);
  const [route, setRoute] = useState<BoardRoute>({ name: 'home' });
  const [selectedQueue, setSelectedQueue] = useState<BoardQueue>('focus');
  const tabBarHeight = useBottomTabBarHeight();
  const contentBottomPadding = tabBarHeight + appVisualTokens.spacing.xxl;
  const headerActions = [
    <HeaderActionButton key="add" usage="chatHome.add" onPress={() => setRoute({ name: 'newTask' })} />
  ] as const satisfies readonly [ReactElement];

  if (route.name === 'newTask') {
    return (
      <NewTaskPage
        onBack={() => setRoute({ name: 'home' })}
        onOpenAssign={() => setRoute({ name: 'assignTask', taskId: 'task-002' })}
      />
    );
  }

  if (route.name === 'assignTask') {
    const task = getTaskById(route.taskId);
    return (
      <AssignTaskPage
        task={task}
        onBack={() => setRoute({ name: 'home' })}
        onOpenTask={(taskId) => setRoute({ name: 'taskDetail', taskId })}
      />
    );
  }

  if (route.name === 'taskDetail') {
    const task = getTaskById(route.taskId);
    return (
      <TaskDetailPage
        task={task}
        onBack={() => setRoute({ name: 'home' })}
        onOpenAssign={(taskId) => setRoute({ name: 'assignTask', taskId })}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <ScreenHeader title={t('tabs.tasks')} rightActions={headerActions} />
      </SafeAreaView>

      <HomeScreen
        selectedQueue={selectedQueue}
        contentBottomPadding={contentBottomPadding}
        onSelectQueue={setSelectedQueue}
        onOpenNewTask={() => setRoute({ name: 'newTask' })}
        onOpenAssign={(taskId) => setRoute({ name: 'assignTask', taskId })}
        onOpenTask={(taskId) => setRoute({ name: 'taskDetail', taskId })}
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
    fieldValue: {
      fontSize: 15,
      lineHeight: 22,
      color: theme.colors.textPrimary
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
