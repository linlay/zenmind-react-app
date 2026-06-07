import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { FlashList } from '@shopify/flash-list';
import { ReactElement, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '../../shared/components/ScreenHeader';
import { AppIcon, type AppIconUsage } from '../../shared/icons/AppIcon';
import { appVisualTokens, getAvatarLabel, getAvatarTone } from '../../shared/visual/foundation';

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
  title: string;
  outcome: string;
  stage: TaskStage;
  priority: TaskPriority;
  agent: string;
  due: string;
  nextAction: string;
  blocker?: string;
  progress: number;
};

type AgentOption = {
  name: string;
  role: string;
  load: string;
  fit: string;
  status: 'ready' | 'busy' | 'waiting';
};

type LifecycleStep = {
  stage: TaskStage;
  label: string;
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
    title: '移动端任务看板重构',
    outcome: '输出一版更聚焦的移动端任务处置流。',
    stage: 'running',
    priority: 'high',
    agent: 'UI Agent',
    due: '今天 18:00',
    nextAction: '确认首屏信息层级',
    progress: 68,
  },
  {
    id: 'task-002',
    title: '知识库 stale 巡检',
    outcome: '检查任务卡、模块卡和生成索引是否一致。',
    stage: 'intake',
    priority: 'medium',
    agent: '未分配',
    due: '今天 20:00',
    nextAction: '选择执行 Agent',
    progress: 10,
  },
  {
    id: 'task-003',
    title: '导入异常归因',
    outcome: '按日志样例归类失败原因并给出修复建议。',
    stage: 'intake',
    priority: 'high',
    agent: '未分配',
    due: '明天 11:00',
    nextAction: '补充上下文后分配',
    blocker: '缺 2 条日志',
    progress: 0,
  },
  {
    id: 'task-004',
    title: '执行权限边界检查',
    outcome: '确认智能体工具调用不会越过仓库审批策略。',
    stage: 'assigned',
    priority: 'medium',
    agent: 'Ops Agent',
    due: '今天 21:00',
    nextAction: '等待执行窗口',
    progress: 28,
  },
  {
    id: 'task-005',
    title: '复核执行记录',
    outcome: '确认工具调用、产物和人工批准点可追溯。',
    stage: 'review',
    priority: 'high',
    agent: 'Reviewer',
    due: '今天 22:00',
    nextAction: '通过或退回',
    blocker: '需人工确认',
    progress: 86,
  },
  {
    id: 'task-006',
    title: '发布节奏摘要',
    outcome: '生成面向负责人的任务进展日报。',
    stage: 'done',
    priority: 'low',
    agent: 'Writer',
    due: '已完成',
    nextAction: '归档',
    progress: 100,
  },
] as const;

const AGENTS: readonly AgentOption[] = [
  {
    name: 'UI Agent',
    role: '界面与交互',
    load: '2/4',
    fit: '适合移动端 UI 调整',
    status: 'ready',
  },
  {
    name: 'Planner',
    role: '任务拆解',
    load: '1/3',
    fit: '适合梳理上下文和验收口径',
    status: 'ready',
  },
  {
    name: 'Ops Agent',
    role: '脚本与环境',
    load: '3/3',
    fit: '队列已满，适合延后',
    status: 'busy',
  },
  {
    name: 'Reviewer',
    role: '复核审计',
    load: '2/2',
    fit: '等待人工确认',
    status: 'waiting',
  },
] as const;

const LIFECYCLE = [
  { stage: 'intake', label: '收集' },
  { stage: 'assigned', label: '分配' },
  { stage: 'running', label: '执行' },
  { stage: 'review', label: '复核' },
  { stage: 'done', label: '完成' },
] as const satisfies readonly LifecycleStep[];

const QUEUES = [
  { id: 'focus', label: '待处理' },
  { id: 'running', label: '执行中' },
  { id: 'review', label: '待复核' },
] as const satisfies readonly { id: BoardQueue; label: string }[];

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

const STAGE_LABELS: Record<TaskStage, string> = {
  intake: '待分配',
  assigned: '已分配',
  running: '执行中',
  review: '待复核',
  done: '已完成',
};

function getPriorityColor(priority: TaskPriority): string {
  if (priority === 'high') {
    return appVisualTokens.colors.danger;
  }
  if (priority === 'medium') {
    return appVisualTokens.colors.warning;
  }
  return appVisualTokens.colors.success;
}

function getStageColor(stage: TaskStage): string {
  if (stage === 'intake') {
    return appVisualTokens.colors.textSecondary;
  }
  if (stage === 'assigned' || stage === 'running') {
    return appVisualTokens.colors.brandBlue;
  }
  if (stage === 'review') {
    return appVisualTokens.colors.warning;
  }
  return appVisualTokens.colors.success;
}

function getAgentStatusColor(status: AgentOption['status']): string {
  if (status === 'ready') {
    return appVisualTokens.colors.success;
  }
  if (status === 'waiting') {
    return appVisualTokens.colors.warning;
  }
  return appVisualTokens.colors.textTertiary;
}

function clampProgress(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function getTaskById(taskId: string | undefined): BoardTask {
  return TASKS.find((task) => task.id === taskId) ?? TASKS[0];
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
    const isBlocked = Boolean(task.blocker);

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
    focusTask: firstBlockedTask ?? firstIntakeTask,
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
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        isPrimary ? styles.buttonPrimary : styles.buttonSecondary,
        pressed ? styles.pressed : null,
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

function StatusPill({ label, value, tone = appVisualTokens.colors.brandBlue }: StatusPillProps) {
  return (
    <View style={styles.statusPill}>
      <View style={[styles.statusDot, { backgroundColor: tone }]} />
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
  onOpenTask,
}: HomeScreenProps) {
  const summary = useMemo(() => getBoardSummary(selectedQueue), [selectedQueue]);
  const agentPreview = useMemo(getAgentPreview, []);
  const focusTask = summary.focusTask;

  return (
    <FlashList
      data={summary.visibleTasks}
      keyExtractor={(task) => task.id}
      renderItem={({ item }) => (
        <TaskRow
          task={item}
          onOpenTask={() => onOpenTask(item.id)}
          onOpenAssign={() => onOpenAssign(item.id)}
        />
      )}
      ListHeaderComponent={
        <View style={styles.homeHeader}>
          <View style={styles.heroBlock}>
            <View style={styles.heroTitleRow}>
              <View style={styles.heroTextBlock}>
                <Text style={styles.heroEyebrow}>今日焦点</Text>
                <Text style={styles.heroTitle}>{focusTask?.title ?? '任务队列稳定'}</Text>
                <Text style={styles.heroBody}>
                  {focusTask?.blocker ?? focusTask?.nextAction ?? '暂无需要人工介入的任务。'}
                </Text>
              </View>
              <View style={styles.heroCountBlock}>
                <Text style={styles.heroCountValue}>
                  {summary.intakeCount + summary.reviewCount}
                </Text>
                <Text style={styles.heroCountLabel}>待处理</Text>
              </View>
            </View>

            <View style={styles.heroActionRow}>
              <PlainButton
                label="分配任务"
                variant="primary"
                onPress={() => onOpenAssign(focusTask?.id)}
              />
              <PlainButton label="新增任务" onPress={onOpenNewTask} />
            </View>
          </View>

          <View style={styles.statusRow}>
            <StatusPill label="待分配" value={`${summary.intakeCount}`} />
            <StatusPill
              label="待复核"
              value={`${summary.reviewCount}`}
              tone={appVisualTokens.colors.warning}
            />
            <StatusPill
              label="有阻塞"
              value={`${summary.blockedCount}`}
              tone={appVisualTokens.colors.danger}
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
                    pressed ? styles.pressed : null,
                  ]}
                  onPress={() => onSelectQueue(queue.id)}
                >
                  <Text
                    style={[
                      styles.queueSwitchText,
                      selected ? styles.queueSwitchTextSelected : null,
                    ]}
                  >
                    {queue.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>任务</Text>
            <Text style={styles.sectionMeta}>{summary.visibleTasks.length} 项</Text>
          </View>
        </View>
      }
      ListFooterComponent={
        <View style={styles.agentFooter}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>可用智能体</Text>
            <Text style={styles.sectionMeta}>优先显示可接单</Text>
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
  const priorityColor = getPriorityColor(task.priority);
  const stageColor = getStageColor(task.stage);
  const shouldAssign = task.stage === 'intake';
  const actionLabel = shouldAssign ? '分配' : task.stage === 'review' ? '复核' : '查看';
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
            {task.title}
          </Text>
          <View style={styles.priorityMini}>
            <View style={[styles.priorityDot, { backgroundColor: priorityColor }]} />
            <Text style={[styles.priorityMiniText, { color: priorityColor }]}>
              {PRIORITY_LABELS[task.priority]}
            </Text>
          </View>
        </View>
        <Text numberOfLines={2} style={styles.taskOutcome}>
          {task.outcome}
        </Text>
        <View style={styles.taskRowMeta}>
          <Text numberOfLines={1} style={styles.taskMetaText}>
            {STAGE_LABELS[task.stage]} · {task.agent}
          </Text>
          <Text style={styles.taskMetaText}>{task.due}</Text>
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
  const tone = getAvatarTone(agent.name);
  const statusColor = getAgentStatusColor(agent.status);

  return (
    <View style={styles.agentCompactRow}>
      <View style={[styles.agentAvatar, { backgroundColor: tone.backgroundColor }]}>
        <Text style={[styles.agentAvatarText, { color: tone.foregroundColor }]}>
          {getAvatarLabel(agent.name)}
        </Text>
      </View>
      <View style={styles.agentCompactText}>
        <Text numberOfLines={1} style={styles.agentName}>
          {agent.name}
        </Text>
        <Text numberOfLines={1} style={styles.agentFit}>
          {agent.fit}
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
  const backAction = [
    <HeaderActionButton key="back" usage="chatDetail.back" onPress={onBack} />,
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
  return (
    <SecondaryPage title="新增任务" onBack={onBack}>
      <View style={styles.formBlock}>
        <Text style={styles.formTitle}>任务草案</Text>
        <DraftField label="任务目标" value="重构移动端任务看板，让负责人一眼看到待处理事项。" />
        <DraftField label="预期产物" value="一版主屏 + 新增任务 + 分配任务 + 任务详情交互稿。" />
        <DraftField label="上下文来源" value="当前仓库 UI 主题、PC 看板截图、任务生命周期规则。" />
      </View>

      <View style={styles.formBlock}>
        <Text style={styles.formTitle}>执行设置</Text>
        <OptionRow label="优先级" value="高" />
        <OptionRow label="截止时间" value="今天 18:00" />
        <OptionRow label="初始状态" value="待分配" />
      </View>

      <View style={styles.stickyActionBlock}>
        <PlainButton label="生成任务草案" variant="primary" onPress={onOpenAssign} />
        <PlainButton label="存为待补充" onPress={onBack} />
      </View>
    </SecondaryPage>
  );
}

type DraftFieldProps = {
  label: string;
  value: string;
};

function DraftField({ label, value }: DraftFieldProps) {
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
  const [selectedAgent, setSelectedAgent] = useState<string>(AGENTS[0].name);

  return (
    <SecondaryPage title="分配任务" onBack={onBack}>
      <View style={styles.assignmentSummary}>
        <Text style={styles.assignmentEyebrow}>待分配</Text>
        <Text style={styles.assignmentTitle}>{task.title}</Text>
        <Text style={styles.assignmentBody}>{task.outcome}</Text>
      </View>

      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>选择智能体</Text>
          <Text style={styles.sectionMeta}>按匹配度排序</Text>
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
        <Text style={styles.formTitle}>分配后动作</Text>
        <OptionRow label="进入阶段" value="已分配" />
        <OptionRow label="通知方式" value="站内任务提醒" />
        <OptionRow label="人工复核" value="高优先任务完成后复核" />
      </View>

      <View style={styles.stickyActionBlock}>
        <PlainButton
          label={`分配给 ${selectedAgent}`}
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
  const tone = getAvatarTone(agent.name);
  const statusColor = getAgentStatusColor(agent.status);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.agentChoice,
        selected ? styles.agentChoiceSelected : null,
        pressed ? styles.pressed : null,
      ]}
      onPress={onSelect}
    >
      <View style={[styles.agentAvatar, { backgroundColor: tone.backgroundColor }]}>
        <Text style={[styles.agentAvatarText, { color: tone.foregroundColor }]}>
          {getAvatarLabel(agent.name)}
        </Text>
      </View>
      <View style={styles.agentCompactText}>
        <Text numberOfLines={1} style={styles.agentName}>
          {agent.name}
        </Text>
        <Text numberOfLines={2} style={styles.agentFit}>
          {agent.fit}
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
  const activeIndex = LIFECYCLE.findIndex((step) => step.stage === task.stage);
  const progress = clampProgress(task.progress);

  return (
    <SecondaryPage title="任务详情" onBack={onBack}>
      <View style={styles.detailHero}>
        <View style={styles.detailTitleRow}>
          <Text style={styles.detailStage}>{STAGE_LABELS[task.stage]}</Text>
          <Text style={styles.detailDue}>{task.due}</Text>
        </View>
        <Text style={styles.detailTitle}>{task.title}</Text>
        <Text style={styles.detailBody}>{task.outcome}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      </View>

      <View style={styles.formBlock}>
        <Text style={styles.formTitle}>下一步</Text>
        <OptionRow label="动作" value={task.nextAction} />
        <OptionRow label="负责人" value={task.agent} />
        <OptionRow label="风险" value={task.blocker ?? '无阻塞'} />
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>生命周期</Text>
        <View style={styles.lifecycle}>
          {LIFECYCLE.map((step, index) => {
            const reached = index <= activeIndex;
            return (
              <View key={step.stage} style={styles.lifecycleItem}>
                <View
                  style={[
                    styles.lifecycleDot,
                    reached ? styles.lifecycleDotReached : styles.lifecycleDotPending,
                  ]}
                />
                <Text style={[styles.lifecycleText, reached ? styles.lifecycleTextReached : null]}>
                  {step.label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.formBlock}>
        <Text style={styles.formTitle}>最近记录</Text>
        <TimelineRow time="13:20" text="智能体完成首轮方案整理" />
        <TimelineRow time="13:42" text="等待负责人确认交互主线" />
        <TimelineRow time="14:10" text="准备进入复核或重新分配" />
      </View>

      <View style={styles.stickyActionBlock}>
        <PlainButton
          label={
            task.stage === 'intake' ? '去分配' : task.stage === 'review' ? '通过复核' : '重新分配'
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
  return (
    <View style={styles.timelineRow}>
      <Text style={styles.timelineTime}>{time}</Text>
      <Text style={styles.timelineText}>{text}</Text>
    </View>
  );
}

export function AgentTaskBoardScreen() {
  const [route, setRoute] = useState<BoardRoute>({ name: 'home' });
  const [selectedQueue, setSelectedQueue] = useState<BoardQueue>('focus');
  const tabBarHeight = useBottomTabBarHeight();
  const contentBottomPadding = tabBarHeight + appVisualTokens.spacing.xxl;
  const headerActions = [
    <HeaderActionButton
      key="add"
      usage="chatHome.add"
      onPress={() => setRoute({ name: 'newTask' })}
    />,
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
        <ScreenHeader title="任务" rightActions={headerActions} />
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: appVisualTokens.colors.surface,
  },
  headerSafeArea: {
    backgroundColor: appVisualTokens.colors.surface,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: appVisualTokens.spacing.xl,
    paddingTop: appVisualTokens.spacing.lg,
    gap: appVisualTokens.spacing.xl,
  },
  homeListContent: {
    paddingHorizontal: appVisualTokens.spacing.xl,
    paddingTop: appVisualTokens.spacing.lg,
  },
  homeHeader: {
    gap: appVisualTokens.spacing.xl,
  },
  secondaryContent: {
    paddingHorizontal: appVisualTokens.spacing.xl,
    paddingTop: appVisualTokens.spacing.lg,
    paddingBottom: appVisualTokens.spacing.xxl,
    gap: appVisualTokens.spacing.xl,
  },
  pressed: {
    opacity: 0.62,
  },
  headerActionButton: {
    width: 40,
    height: 40,
    borderRadius: appVisualTokens.radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBlock: {
    gap: appVisualTokens.spacing.lg,
    paddingBottom: appVisualTokens.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appVisualTokens.colors.line,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: appVisualTokens.spacing.lg,
  },
  heroTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: appVisualTokens.spacing.sm,
  },
  heroEyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: appVisualTokens.colors.brandBlue,
  },
  heroTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    color: appVisualTokens.colors.textPrimary,
  },
  heroBody: {
    fontSize: 15,
    lineHeight: 22,
    color: appVisualTokens.colors.textSecondary,
  },
  heroCountBlock: {
    width: 74,
    minHeight: 74,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: appVisualTokens.radii.sm,
    backgroundColor: appVisualTokens.colors.brandBlueSoft,
  },
  heroCountValue: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    color: appVisualTokens.colors.brandBlue,
  },
  heroCountLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: appVisualTokens.colors.brandBlue,
  },
  heroActionRow: {
    flexDirection: 'row',
    gap: appVisualTokens.spacing.sm,
  },
  button: {
    minHeight: 42,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: appVisualTokens.radii.md,
    paddingHorizontal: appVisualTokens.spacing.md,
  },
  buttonPrimary: {
    backgroundColor: appVisualTokens.colors.brandBlue,
  },
  buttonSecondary: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: appVisualTokens.colors.lineStrong,
    backgroundColor: appVisualTokens.colors.surface,
  },
  buttonText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    color: appVisualTokens.colors.textPrimary,
  },
  buttonTextPrimary: {
    color: appVisualTokens.colors.surface,
  },
  statusRow: {
    flexDirection: 'row',
    gap: appVisualTokens.spacing.sm,
  },
  statusPill: {
    flex: 1,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: appVisualTokens.spacing.xs,
    borderRadius: appVisualTokens.radii.pill,
    backgroundColor: appVisualTokens.colors.surfaceMuted,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: appVisualTokens.radii.pill,
  },
  statusPillLabel: {
    fontSize: 12,
    lineHeight: 16,
    color: appVisualTokens.colors.textSecondary,
  },
  statusPillValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: appVisualTokens.colors.textPrimary,
  },
  queueSwitch: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: appVisualTokens.radii.md,
    backgroundColor: appVisualTokens.colors.surfaceMuted,
  },
  queueSwitchItem: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: appVisualTokens.radii.sm,
  },
  queueSwitchItemSelected: {
    backgroundColor: appVisualTokens.colors.surface,
  },
  queueSwitchText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: appVisualTokens.colors.textSecondary,
  },
  queueSwitchTextSelected: {
    color: appVisualTokens.colors.brandBlue,
  },
  sectionBlock: {
    gap: appVisualTokens.spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: appVisualTokens.spacing.md,
  },
  sectionTitle: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '800',
    color: appVisualTokens.colors.textPrimary,
  },
  sectionMeta: {
    fontSize: 12,
    lineHeight: 16,
    color: appVisualTokens.colors.textSecondary,
  },
  taskRow: {
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: appVisualTokens.spacing.md,
    paddingVertical: appVisualTokens.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appVisualTokens.colors.line,
  },
  rowPressed: {
    backgroundColor: appVisualTokens.colors.surfaceMuted,
  },
  taskStageBar: {
    width: 4,
    borderRadius: appVisualTokens.radii.pill,
  },
  taskRowMain: {
    flex: 1,
    minWidth: 0,
    gap: appVisualTokens.spacing.xs,
    justifyContent: 'center',
    borderRadius: appVisualTokens.radii.sm,
  },
  taskRowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: appVisualTokens.spacing.sm,
  },
  taskRowTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    color: appVisualTokens.colors.textPrimary,
  },
  priorityMini: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: appVisualTokens.spacing.xs,
    paddingHorizontal: appVisualTokens.spacing.sm,
    borderRadius: appVisualTokens.radii.pill,
    backgroundColor: appVisualTokens.colors.surfaceMuted,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: appVisualTokens.radii.pill,
  },
  priorityMiniText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  taskOutcome: {
    fontSize: 14,
    lineHeight: 21,
    color: appVisualTokens.colors.textPrimary,
  },
  taskRowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: appVisualTokens.spacing.md,
  },
  taskMetaText: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 17,
    color: appVisualTokens.colors.textSecondary,
  },
  rowActionButton: {
    alignSelf: 'center',
    minWidth: 54,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: appVisualTokens.radii.pill,
    backgroundColor: appVisualTokens.colors.brandBlueSoft,
  },
  rowActionText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: appVisualTokens.colors.brandBlue,
  },
  agentSummaryList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: appVisualTokens.colors.line,
  },
  agentFooter: {
    gap: appVisualTokens.spacing.md,
    paddingTop: appVisualTokens.spacing.xl,
  },
  agentCompactRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: appVisualTokens.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appVisualTokens.colors.line,
  },
  agentAvatar: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: appVisualTokens.radii.pill,
  },
  agentAvatarText: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
  },
  agentCompactText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  agentName: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    color: appVisualTokens.colors.textPrimary,
  },
  agentFit: {
    fontSize: 12,
    lineHeight: 17,
    color: appVisualTokens.colors.textSecondary,
  },
  agentLoadBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: appVisualTokens.spacing.xs,
  },
  agentLoadText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    color: appVisualTokens.colors.textSecondary,
  },
  formBlock: {
    gap: appVisualTokens.spacing.md,
    paddingBottom: appVisualTokens.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appVisualTokens.colors.line,
  },
  formTitle: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '800',
    color: appVisualTokens.colors.textPrimary,
  },
  draftField: {
    gap: appVisualTokens.spacing.xs,
    paddingVertical: appVisualTokens.spacing.sm,
  },
  fieldLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    color: appVisualTokens.colors.brandBlue,
  },
  fieldValue: {
    fontSize: 15,
    lineHeight: 22,
    color: appVisualTokens.colors.textPrimary,
  },
  optionRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: appVisualTokens.spacing.md,
  },
  optionLabel: {
    fontSize: 14,
    lineHeight: 21,
    color: appVisualTokens.colors.textSecondary,
  },
  optionValue: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '800',
    color: appVisualTokens.colors.textPrimary,
    textAlign: 'right',
  },
  stickyActionBlock: {
    gap: appVisualTokens.spacing.sm,
  },
  assignmentSummary: {
    gap: appVisualTokens.spacing.sm,
    paddingBottom: appVisualTokens.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appVisualTokens.colors.line,
  },
  assignmentEyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    color: appVisualTokens.colors.brandBlue,
  },
  assignmentTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    color: appVisualTokens.colors.textPrimary,
  },
  assignmentBody: {
    fontSize: 15,
    lineHeight: 22,
    color: appVisualTokens.colors.textSecondary,
  },
  agentChoiceList: {
    gap: appVisualTokens.spacing.sm,
  },
  agentChoice: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: appVisualTokens.spacing.md,
    padding: appVisualTokens.spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: appVisualTokens.colors.lineStrong,
    borderRadius: appVisualTokens.radii.sm,
    backgroundColor: appVisualTokens.colors.surface,
  },
  agentChoiceSelected: {
    borderColor: appVisualTokens.colors.brandBlue,
    backgroundColor: appVisualTokens.colors.brandBlueSoft,
  },
  detailHero: {
    gap: appVisualTokens.spacing.md,
    paddingBottom: appVisualTokens.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appVisualTokens.colors.line,
  },
  detailTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: appVisualTokens.spacing.md,
  },
  detailStage: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    color: appVisualTokens.colors.brandBlue,
  },
  detailDue: {
    fontSize: 12,
    lineHeight: 16,
    color: appVisualTokens.colors.textSecondary,
  },
  detailTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    color: appVisualTokens.colors.textPrimary,
  },
  detailBody: {
    fontSize: 15,
    lineHeight: 22,
    color: appVisualTokens.colors.textSecondary,
  },
  progressTrack: {
    height: 6,
    overflow: 'hidden',
    borderRadius: appVisualTokens.radii.pill,
    backgroundColor: appVisualTokens.colors.surfaceMuted,
  },
  progressFill: {
    height: 6,
    borderRadius: appVisualTokens.radii.pill,
    backgroundColor: appVisualTokens.colors.brandBlue,
  },
  lifecycle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: appVisualTokens.spacing.sm,
  },
  lifecycleItem: {
    flex: 1,
    alignItems: 'center',
    gap: appVisualTokens.spacing.sm,
  },
  lifecycleDot: {
    width: 18,
    height: 18,
    borderRadius: appVisualTokens.radii.pill,
  },
  lifecycleDotReached: {
    backgroundColor: appVisualTokens.colors.brandBlue,
  },
  lifecycleDotPending: {
    backgroundColor: appVisualTokens.colors.lineStrong,
  },
  lifecycleText: {
    fontSize: 12,
    lineHeight: 16,
    color: appVisualTokens.colors.textSecondary,
  },
  lifecycleTextReached: {
    fontWeight: '800',
    color: appVisualTokens.colors.textPrimary,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: appVisualTokens.spacing.md,
    paddingVertical: appVisualTokens.spacing.sm,
  },
  timelineTime: {
    width: 46,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    color: appVisualTokens.colors.textSecondary,
  },
  timelineText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 21,
    color: appVisualTokens.colors.textPrimary,
  },
});
