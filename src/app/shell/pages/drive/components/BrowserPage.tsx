import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { DriveEntry } from '../../../../../modules/drive/types';
import { DrivePalette } from '../types';
import { sameEntry } from '../utils';
import { EntryRow } from './EntryRow';
import styles from '../DriveContent.styles';

interface BrowserPageProps {
  testIDPrefix: string;
  palette: DrivePalette;
  themeMode: 'light' | 'dark';
  baseUrl: string;
  hasMounts: boolean;
  mountsLoading: boolean;
  entriesLoading: boolean;
  browserError: string;
  sortedEntries: DriveEntry[];
  driveSelectionMode: boolean;
  selectedEntries: DriveEntry[];
  mountMap: Map<string, string>;
  browserRefreshing: boolean;
  contentBottomPadding: number;
  onRefresh: () => void;
  onRetry: () => void;
  onEntryPress: (entry: DriveEntry) => void;
  onEntryLongPress: (entry: DriveEntry) => void;
  onEntryMore: (entries: DriveEntry[]) => void;
  onOpenTasks: () => void;
  onOpenTrash: () => void;
}

export function BrowserPage({
  testIDPrefix,
  palette,
  themeMode,
  baseUrl,
  hasMounts,
  mountsLoading,
  entriesLoading,
  browserError,
  sortedEntries,
  driveSelectionMode,
  selectedEntries,
  mountMap,
  browserRefreshing,
  contentBottomPadding,
  onRefresh,
  onRetry,
  onEntryPress,
  onEntryLongPress,
  onEntryMore,
  onOpenTasks,
  onOpenTrash
}: BrowserPageProps) {
  if (!baseUrl) {
    return (
      <View style={styles.browserPage}>
        <View style={[styles.emptyStateCard, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
          <Text style={[styles.emptyStateTitle, { color: palette.text }]}>还没有配置网盘后端</Text>
          <Text style={[styles.emptyStateBody, { color: palette.textSoft }]}>
            请到"设置"页填写 `pan-webclient` 的后端地址，然后再回到网盘页。
          </Text>
        </View>
      </View>
    );
  }

  if (!mountsLoading && !browserError && !hasMounts) {
    return (
      <View style={styles.browserPage}>
        <View style={[styles.emptyStateCard, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
          <Text style={[styles.emptyStateTitle, { color: palette.text }]}>当前没有可用挂载点</Text>
          <Text style={[styles.emptyStateBody, { color: palette.textSoft }]}>
            请先在 `pan-webclient/configs/mounts/*.json` 中配置至少一个挂载目录。
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.browserPage}>
      <View style={styles.browserPageTop}>
        <ScrollView
          horizontal
          style={styles.quickActionStrip}
          contentContainerStyle={styles.quickActionStripContent}
          showsHorizontalScrollIndicator={false}
        >
          <TouchableOpacity
            activeOpacity={0.82}
            style={[styles.quickActionChip, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}
            onPress={onOpenTasks}
          >
            <Text style={[styles.quickActionText, { color: palette.textSoft }]}>传输任务</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.82}
            style={[styles.quickActionChip, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}
            onPress={onOpenTrash}
          >
            <Text style={[styles.quickActionText, { color: palette.textSoft }]}>垃圾桶</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <ScrollView
        style={styles.browserTreeScroll}
        contentContainerStyle={[styles.browserTreeContent, { paddingBottom: contentBottomPadding }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={browserRefreshing} onRefresh={onRefresh} tintColor={palette.primaryDeep} />
        }
      >
        {browserError ? (
          <View style={[styles.errorCard, { backgroundColor: palette.cardBg, borderColor: palette.danger }]}>
            <Text style={[styles.errorTitle, { color: palette.danger }]}>加载目录失败</Text>
            <Text style={[styles.errorBody, { color: palette.textSoft }]}>{browserError}</Text>
            <TouchableOpacity
              activeOpacity={0.82}
              style={[styles.inlinePrimaryBtn, { backgroundColor: palette.primarySoft }]}
              onPress={onRetry}
            >
              <Text style={[styles.inlinePrimaryText, { color: palette.primaryDeep }]}>重试</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {mountsLoading || entriesLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={palette.primaryDeep} />
            <Text style={[styles.loadingText, { color: palette.textSoft }]}>正在载入目录...</Text>
          </View>
        ) : null}

        {!mountsLoading && !entriesLoading && !browserError && !sortedEntries.length ? (
          <View style={[styles.emptyStateCard, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
            <Text style={[styles.emptyStateTitle, { color: palette.text }]}>当前目录是空的</Text>
            <Text style={[styles.emptyStateBody, { color: palette.textSoft }]}>
              可以新建目录、上传文件，或切换到其他挂载点查看内容。
            </Text>
          </View>
        ) : null}

        {!entriesLoading && !browserError
          ? sortedEntries.map((entry, index) => (
              <EntryRow
                key={`${entry.mountId}:${entry.path}`}
                entry={entry}
                index={index}
                testIDPrefix={testIDPrefix}
                palette={palette}
                themeMode={themeMode}
                driveSelectionMode={driveSelectionMode}
                selected={selectedEntries.some((item) => sameEntry(item, entry))}
                mountName={mountMap.get(entry.mountId)}
                onPress={onEntryPress}
                onLongPress={onEntryLongPress}
                onMore={onEntryMore}
              />
            ))
          : null}
      </ScrollView>
    </View>
  );
}
