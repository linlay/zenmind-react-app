import { Text, TouchableOpacity, View } from 'react-native';

import { DriveEntry } from '../../../../../modules/drive/types';
import { AppTheme } from '../../../../../core/constants/theme';
import { DrivePalette } from '../types';
import styles from '../DriveContent.styles';

interface SelectionBarProps {
  palette: DrivePalette;
  theme: AppTheme;
  selectedEntries: DriveEntry[];
  selectedSingleEntry: DriveEntry | null;
  bottomInset: number;
  onCancel: () => void;
  onDownload: (entries: DriveEntry[]) => void;
  onRename: (entry: DriveEntry | null) => void;
  onMoveCopy: (kind: 'move' | 'copy', entries: DriveEntry[]) => void;
  onDelete: (entries: DriveEntry[]) => void;
}

export function SelectionBar({
  palette,
  theme,
  selectedEntries,
  selectedSingleEntry,
  bottomInset,
  onCancel,
  onDownload,
  onRename,
  onMoveCopy,
  onDelete
}: SelectionBarProps) {
  return (
    <View
      style={[
        styles.selectionBar,
        {
          backgroundColor: palette.cardBg,
          borderColor: palette.cardBorder,
          bottom: Math.max(bottomInset + 8, 12)
        }
      ]}
    >
      <View style={styles.selectionBarHead}>
        <Text style={[styles.selectionBarTitle, { color: palette.text }]}>{selectedEntries.length} 项已选中</Text>
        <TouchableOpacity activeOpacity={0.8} onPress={onCancel}>
          <Text style={[styles.selectionBarDone, { color: palette.primaryDeep }]}>取消</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.selectionBarActions}>
        <TouchableOpacity
          activeOpacity={0.82}
          style={[styles.selectionActionBtn, { backgroundColor: palette.primarySoft }]}
          onPress={() => onDownload(selectedEntries)}
        >
          <Text style={[styles.selectionActionText, { color: palette.primaryDeep }]}>下载</Text>
        </TouchableOpacity>
        {selectedSingleEntry ? (
          <TouchableOpacity
            activeOpacity={0.82}
            style={[styles.selectionActionBtn, { backgroundColor: theme.surface, borderColor: palette.cardBorder }]}
            onPress={() => onRename(selectedSingleEntry)}
          >
            <Text style={[styles.selectionActionText, { color: palette.textSoft }]}>重命名</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          activeOpacity={0.82}
          style={[styles.selectionActionBtn, { backgroundColor: theme.surface, borderColor: palette.cardBorder }]}
          onPress={() => onMoveCopy('move', selectedEntries)}
        >
          <Text style={[styles.selectionActionText, { color: palette.textSoft }]}>移动</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.82}
          style={[styles.selectionActionBtn, { backgroundColor: theme.surface, borderColor: palette.cardBorder }]}
          onPress={() => onMoveCopy('copy', selectedEntries)}
        >
          <Text style={[styles.selectionActionText, { color: palette.textSoft }]}>复制</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.82}
          style={[styles.selectionActionBtn, { backgroundColor: theme.surface, borderColor: palette.cardBorder }]}
          onPress={() => onDelete(selectedEntries)}
        >
          <Text style={[styles.selectionActionText, { color: palette.danger }]}>删除</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
