import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

import { DriveTask } from '../../../../../modules/drive/types';
import { AppTheme } from '../../../../../core/constants/theme';
import { DrivePalette } from '../types';
import { formatBytes } from '../utils';
import styles from '../DriveContent.styles';

interface TasksPageProps {
  palette: DrivePalette;
  theme: AppTheme;
  tasksLoading: boolean;
  tasksError: string;
  tasks: DriveTask[];
  onRefreshTask: (taskId: string) => void;
  onDownloadTask: (task: DriveTask) => void;
  onDeleteTask: (taskId: string) => void;
}

export function TasksPage({
  palette,
  theme,
  tasksLoading,
  tasksError,
  tasks,
  onRefreshTask,
  onDownloadTask,
  onDeleteTask
}: TasksPageProps) {
  return (
    <>
      <View style={[styles.infoCard, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
        <Text style={[styles.sectionLabel, { color: palette.textMute }]}>任务总览</Text>
        <Text style={[styles.infoTitle, { color: palette.text }]}>传输任务</Text>
        <Text style={[styles.infoMeta, { color: palette.textSoft }]}>{tasks.length} 条任务记录</Text>
      </View>

      {tasksError ? (
        <View style={[styles.errorCard, { backgroundColor: palette.cardBg, borderColor: palette.danger }]}>
          <Text style={[styles.errorTitle, { color: palette.danger }]}>加载任务失败</Text>
          <Text style={[styles.errorBody, { color: palette.textSoft }]}>{tasksError}</Text>
        </View>
      ) : null}

      {tasksLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={palette.primaryDeep} />
          <Text style={[styles.loadingText, { color: palette.textSoft }]}>正在同步任务...</Text>
        </View>
      ) : null}

      {!tasksLoading && !tasks.length ? (
        <View style={[styles.emptyStateCard, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
          <Text style={[styles.emptyStateTitle, { color: palette.text }]}>暂无传输任务</Text>
          <Text style={[styles.emptyStateBody, { color: palette.textSoft }]}>
            上传文件或创建打包下载后，这里会显示任务进度。
          </Text>
        </View>
      ) : null}

      {tasks.map((task) => {
        const progress =
          task.totalBytes && task.totalBytes > 0 && task.completedBytes !== undefined
            ? Math.max(0, Math.min(1, task.completedBytes / task.totalBytes))
            : 0;
        const active = task.status === 'pending' || task.status === 'running';

        return (
          <View
            key={task.id}
            style={[styles.taskCard, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}
          >
            <View style={styles.taskRowHead}>
              <View style={styles.taskMain}>
                <Text style={[styles.taskTitle, { color: palette.text }]} numberOfLines={1}>
                  {task.detail || task.id}
                </Text>
                <Text style={[styles.taskMeta, { color: palette.textMute }]} numberOfLines={1}>
                  {task.kind === 'upload' ? '上传' : '下载'} • {task.status}
                </Text>
              </View>
              <Text
                style={[
                  styles.taskBadge,
                  {
                    color:
                      task.status === 'failed'
                        ? palette.danger
                        : task.status === 'success'
                          ? palette.ok
                          : palette.primaryDeep
                  }
                ]}
              >
                {task.status === 'pending'
                  ? '排队中'
                  : task.status === 'running'
                    ? '进行中'
                    : task.status === 'success'
                      ? '已完成'
                      : '失败'}
              </Text>
            </View>

            {task.totalBytes ? (
              <>
                <View style={[styles.progressTrack, { backgroundColor: theme.surface }]}>
                  <View
                    style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: palette.primary }]}
                  />
                </View>
                <Text style={[styles.taskMeta, { color: palette.textSoft }]}>
                  {formatBytes(task.completedBytes || 0)} / {formatBytes(task.totalBytes || 0)}
                </Text>
              </>
            ) : null}

            <View style={styles.taskActionsRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.secondaryBtn, { borderColor: palette.cardBorder, backgroundColor: theme.surface }]}
                onPress={() => onRefreshTask(task.id)}
              >
                <Text style={[styles.secondaryBtnText, { color: palette.textSoft }]}>刷新</Text>
              </TouchableOpacity>
              {task.status === 'success' ? (
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.secondaryBtn, { borderColor: palette.cardBorder, backgroundColor: theme.surface }]}
                  onPress={() => onDownloadTask(task)}
                >
                  <Text style={[styles.secondaryBtnText, { color: palette.primaryDeep }]}>下载</Text>
                </TouchableOpacity>
              ) : null}
              {!active ? (
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.secondaryBtn, { borderColor: palette.cardBorder, backgroundColor: theme.surface }]}
                  onPress={() => onDeleteTask(task.id)}
                >
                  <Text style={[styles.secondaryBtnText, { color: palette.danger }]}>删除</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        );
      })}
    </>
  );
}
