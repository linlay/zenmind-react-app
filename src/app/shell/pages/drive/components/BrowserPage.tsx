import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { DriveEntry, DriveMount } from '../../../../../modules/drive/types';
import { openDriveTasks, openDriveTrash } from '../../../../../modules/drive/state/driveSlice';
import { useAppDispatch } from '../../../../store/hooks';
import { DrivePalette } from '../types';
import { dirnamePath, sameEntry } from '../utils';
import { EntryRow } from './EntryRow';
import styles from '../DriveContent.styles';

interface BrowserPageProps {
  testIDPrefix: string;
  palette: DrivePalette;
  themeMode: 'light' | 'dark';
  baseUrl: string;
  mountsLoading: boolean;
  entriesLoading: boolean;
  browserError: string;
  currentMountId: string;
  currentPath: string;
  currentMount: DriveMount | null;
  breadcrumbs: { label: string; path: string }[];
  sortedEntries: DriveEntry[];
  driveSelectionMode: boolean;
  selectedEntries: DriveEntry[];
  mountMap: Map<string, string>;
  onNavigateToDirectory: (mountId: string, path: string) => void;
  onRetry: () => void;
  onEntryPress: (entry: DriveEntry) => void;
  onEntryLongPress: (entry: DriveEntry) => void;
  onEntryMore: (entries: DriveEntry[]) => void;
}

export function BrowserPage({
  testIDPrefix,
  palette,
  themeMode,
  baseUrl,
  mountsLoading,
  entriesLoading,
  browserError,
  currentMountId,
  currentPath,
  currentMount,
  breadcrumbs,
  sortedEntries,
  driveSelectionMode,
  selectedEntries,
  mountMap,
  onNavigateToDirectory,
  onRetry,
  onEntryPress,
  onEntryLongPress,
  onEntryMore
}: BrowserPageProps) {
  const dispatch = useAppDispatch();
  const canNavigateUp = currentPath !== '/';

  if (!baseUrl) {
    return (
      <View style={[styles.emptyStateCard, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
        <Text style={[styles.emptyStateTitle, { color: palette.text }]}>还没有配置网盘后端</Text>
        <Text style={[styles.emptyStateBody, { color: palette.textSoft }]}>
          请到"设置"页填写 `pan-webclient` 的后端地址，然后再回到网盘页。
        </Text>
      </View>
    );
  }

  if (!mountsLoading && !currentMount && !browserError) {
    return (
      <View style={[styles.emptyStateCard, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
        <Text style={[styles.emptyStateTitle, { color: palette.text }]}>当前没有可用挂载点</Text>
        <Text style={[styles.emptyStateBody, { color: palette.textSoft }]}>
          请先在 `pan-webclient/configs/mounts/*.json` 中配置至少一个挂载目录。
        </Text>
      </View>
    );
  }

  return (
    <>
      <View
        style={[
          styles.infoCard,
          styles.browserPathCard,
          { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }
        ]}
      >
        {/* <View style={styles.browserPathHead}>
          <Text style={[styles.sectionLabel, { color: palette.textMute }]}>当前目录</Text>
          <View style={[styles.browserMountPill, { backgroundColor: palette.primarySoft }]}>
            <Text style={[styles.browserMountText, { color: palette.primaryDeep }]} numberOfLines={1}>
              {currentMount?.name || '未选择挂载点'}
            </Text>
          </View>
        </View> */}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.browserBreadcrumbRow}
        >
          {canNavigateUp ? (
            <TouchableOpacity
              activeOpacity={0.82}
              onPress={() => onNavigateToDirectory(currentMountId, dirnamePath(currentPath))}
              style={[styles.browserNavChip, { backgroundColor: palette.primarySoft }]}
            >
              <Text style={[styles.browserNavChipText, { color: palette.primaryDeep }]}>‹</Text>
            </TouchableOpacity>
          ) : null}
          {breadcrumbs.map((item, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
              <TouchableOpacity
                key={item.path}
                activeOpacity={0.78}
                onPress={() => onNavigateToDirectory(currentMountId, item.path)}
                style={[
                  styles.browserBreadcrumbChip,
                  {
                    backgroundColor: isLast ? palette.primarySoft : palette.iconTileBg,
                    borderColor: isLast ? palette.primary : palette.cardBorder
                  }
                ]}
              >
                <Text
                  style={[styles.browserBreadcrumbText, { color: isLast ? palette.primaryDeep : palette.textSoft }]}
                >
                  {index === 0 ? '/' : item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        horizontal
        style={styles.quickActionStrip}
        contentContainerStyle={styles.quickActionStripContent}
        showsHorizontalScrollIndicator={false}
      >
        <TouchableOpacity
          activeOpacity={0.82}
          style={[styles.quickActionChip, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}
          onPress={() => dispatch(openDriveTasks())}
        >
          <Text style={[styles.quickActionText, { color: palette.textSoft }]}>传输任务</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.82}
          style={[styles.quickActionChip, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}
          onPress={() => dispatch(openDriveTrash())}
        >
          <Text style={[styles.quickActionText, { color: palette.textSoft }]}>垃圾桶</Text>
        </TouchableOpacity>
      </ScrollView>

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
    </>
  );
}
