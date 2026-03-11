import { ActivityIndicator, Text, View } from 'react-native';

import { DriveEntry, DriveSearchHit } from '../../../../../modules/drive/types';
import { DrivePalette } from '../types';
import { sameEntry, toEntryFromSearchHit } from '../utils';
import { EntryRow } from './EntryRow';
import styles from '../DriveContent.styles';

interface SearchPageProps {
  testIDPrefix: string;
  palette: DrivePalette;
  themeMode: 'light' | 'dark';
  driveSearchQuery: string;
  searchLoading: boolean;
  searchError: string;
  sortedSearchResults: DriveSearchHit[];
  driveSelectionMode: boolean;
  selectedEntries: DriveEntry[];
  mountMap: Map<string, string>;
  onEntryPress: (entry: DriveEntry) => void;
  onEntryLongPress: (entry: DriveEntry) => void;
  onEntryMore: (entries: DriveEntry[]) => void;
}

export function SearchPage({
  testIDPrefix,
  palette,
  themeMode,
  driveSearchQuery,
  searchLoading,
  searchError,
  sortedSearchResults,
  driveSelectionMode,
  selectedEntries,
  mountMap,
  onEntryPress,
  onEntryLongPress,
  onEntryMore
}: SearchPageProps) {
  const keyword = String(driveSearchQuery || '').trim();

  if (!keyword) {
    return (
      <View style={[styles.emptyStateCard, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
        <Text style={[styles.emptyStateTitle, { color: palette.text }]}>开始搜索</Text>
        <Text style={[styles.emptyStateBody, { color: palette.textSoft }]}>
          在顶栏输入关键词，可以按文件名或路径搜索当前所有挂载点。
        </Text>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.infoCard, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
        <Text style={[styles.sectionLabel, { color: palette.textMute }]}>搜索结果</Text>
        <Text style={[styles.infoTitle, { color: palette.text }]}>{keyword}</Text>
        <Text style={[styles.infoMeta, { color: palette.textSoft }]}>
          {searchLoading ? '搜索中...' : `${sortedSearchResults.length} 条结果`}
        </Text>
      </View>

      {searchError ? (
        <View style={[styles.errorCard, { backgroundColor: palette.cardBg, borderColor: palette.danger }]}>
          <Text style={[styles.errorTitle, { color: palette.danger }]}>搜索失败</Text>
          <Text style={[styles.errorBody, { color: palette.textSoft }]}>{searchError}</Text>
        </View>
      ) : null}

      {searchLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={palette.primaryDeep} />
          <Text style={[styles.loadingText, { color: palette.textSoft }]}>正在搜索...</Text>
        </View>
      ) : null}

      {!searchLoading && !searchError && !sortedSearchResults.length ? (
        <View style={[styles.emptyStateCard, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
          <Text style={[styles.emptyStateTitle, { color: palette.text }]}>没有找到匹配项</Text>
          <Text style={[styles.emptyStateBody, { color: palette.textSoft }]}>
            换一个关键词试试，或检查当前是否启用了隐藏文件过滤。
          </Text>
        </View>
      ) : null}

      {!searchLoading && !searchError
        ? sortedSearchResults.map((hit, index) => {
            const entry = toEntryFromSearchHit(hit);
            return (
              <EntryRow
                key={`${entry.mountId}:${entry.path}`}
                entry={entry}
                index={index}
                showMountName
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
            );
          })
        : null}
    </>
  );
}
