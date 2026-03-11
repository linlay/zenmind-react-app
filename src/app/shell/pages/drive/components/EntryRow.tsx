import { Pressable, Text, TouchableOpacity, View } from 'react-native';

import { DriveEntry } from '../../../../../modules/drive/types';
import { buildTestID, sameEntry, fileTone, formatBytes, formatRelativeDate } from '../utils';
import { FolderIcon, ArchiveIcon, FileIcon, MoreIcon, CheckIcon } from './Icons';
import { DrivePalette } from '../types';
import styles from '../DriveContent.styles';

interface EntryRowProps {
  entry: DriveEntry;
  index: number;
  showMountName?: boolean;
  testIDPrefix: string;
  palette: DrivePalette;
  themeMode: 'light' | 'dark';
  driveSelectionMode: boolean;
  selected: boolean;
  mountName?: string;
  onPress: (entry: DriveEntry) => void;
  onLongPress: (entry: DriveEntry) => void;
  onMore: (entries: DriveEntry[]) => void;
}

export function EntryRow({
  entry,
  index,
  showMountName = false,
  testIDPrefix,
  palette,
  themeMode,
  driveSelectionMode,
  selected,
  mountName,
  onPress,
  onLongPress,
  onMore
}: EntryRowProps) {
  const tone = fileTone(entry, themeMode);
  const icon = entry.isDir ? (
    <FolderIcon color={tone.color} />
  ) : /zip|rar|tar|7z/i.test(entry.extension) ? (
    <ArchiveIcon color={tone.color} />
  ) : (
    <FileIcon color={tone.color} />
  );

  return (
    <View
      key={`${entry.mountId}:${entry.path}`}
      style={[
        styles.itemCard,
        {
          backgroundColor: palette.cardBg,
          borderColor: selected ? palette.primary : palette.cardBorder
        },
        selected ? styles.itemCardSelected : null
      ]}
      testID={buildTestID(testIDPrefix, `item-${index}`)}
    >
      <Pressable style={styles.itemPressArea} onPress={() => onPress(entry)} onLongPress={() => onLongPress(entry)}>
        {driveSelectionMode ? (
          <View
            style={[
              styles.selectionIndicator,
              {
                borderColor: selected ? palette.primary : palette.cardBorder,
                backgroundColor: selected ? palette.primarySoft : 'transparent'
              }
            ]}
          >
            {selected ? <CheckIcon color={palette.primaryDeep} /> : null}
          </View>
        ) : null}

        <View style={[styles.itemIconWrap, { backgroundColor: tone.bg }]}>{icon}</View>

        <View style={styles.itemContent}>
          <Text style={[styles.itemName, { color: palette.text }]} numberOfLines={1}>
            {entry.name}
          </Text>
          <Text style={[styles.itemMeta, { color: palette.textMute }]} numberOfLines={1}>
            {entry.isDir ? '目录' : formatBytes(entry.size)} • {formatRelativeDate(entry.modTime)}
          </Text>
          <Text style={[styles.itemSecondaryMeta, { color: palette.textSoft }]} numberOfLines={1}>
            {showMountName ? `${mountName || '挂载点'}  •  ` : ''}
            {entry.path}
          </Text>
        </View>
      </Pressable>

      {!driveSelectionMode ? (
        <TouchableOpacity
          activeOpacity={0.74}
          style={styles.itemMoreWrap}
          testID={buildTestID(testIDPrefix, `item-more-${index}`)}
          onPress={() => onMore([entry])}
        >
          <MoreIcon color={palette.textMute} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
