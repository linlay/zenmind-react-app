import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { DriveEntry } from '../../../../../modules/drive/types';
import { AppTheme } from '../../../../../core/constants/theme';
import { EntryActionsPageState, DrivePalette } from '../types';
import styles from '../DriveContent.styles';

interface EntryActionsPageProps {
  palette: DrivePalette;
  theme: AppTheme;
  entryActionsPage: EntryActionsPageState | null;
  bottomInset: number;
  onClose: () => void;
  onPreview: (entry: DriveEntry) => void;
  onDownload: (entries: DriveEntry[]) => void;
  onRename: (entry: DriveEntry | null) => void;
  onMoveCopy: (kind: 'move' | 'copy', entries: DriveEntry[]) => void;
  onDelete: (entries: DriveEntry[]) => void;
}

interface EntryActionItem {
  key: string;
  label: string;
  textColor: string;
  backgroundColor: string;
  borderColor: string;
  onPress: () => void;
}

export function EntryActionsPage({
  palette,
  theme,
  entryActionsPage,
  bottomInset,
  onClose,
  onPreview,
  onDownload,
  onRename,
  onMoveCopy,
  onDelete
}: EntryActionsPageProps) {
  if (!entryActionsPage) {
    return null;
  }

  const entry = entryActionsPage.entries[0];
  if (!entry) {
    return null;
  }

  const actions: EntryActionItem[] = [
    ...(!entry.isDir
      ? [{
          key: 'preview',
          label: '预览',
          textColor: palette.primaryDeep,
          backgroundColor: palette.primarySoft,
          borderColor: palette.primarySoft,
          onPress: () => onPreview(entry)
        }]
      : []),
    {
      key: 'download',
      label: entry.isDir ? '打包下载' : '下载',
      textColor: palette.textSoft,
      backgroundColor: theme.surface,
      borderColor: palette.cardBorder,
      onPress: () => {
        onClose();
        onDownload([entry]);
      }
    },
    {
      key: 'rename',
      label: '重命名',
      textColor: palette.textSoft,
      backgroundColor: theme.surface,
      borderColor: palette.cardBorder,
      onPress: () => onRename(entry)
    },
    {
      key: 'move',
      label: '移动',
      textColor: palette.textSoft,
      backgroundColor: theme.surface,
      borderColor: palette.cardBorder,
      onPress: () => onMoveCopy('move', [entry])
    },
    {
      key: 'copy',
      label: '复制',
      textColor: palette.textSoft,
      backgroundColor: theme.surface,
      borderColor: palette.cardBorder,
      onPress: () => onMoveCopy('copy', [entry])
    },
    {
      key: 'delete',
      label: '删除',
      textColor: palette.danger,
      backgroundColor: theme.surface,
      borderColor: palette.cardBorder,
      onPress: () => onDelete([entry])
    }
  ];

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.bottomSheetOverlay}>
        <Pressable style={[styles.bottomSheetMask, { backgroundColor: palette.overlay }]} onPress={onClose} />

        <View
          style={[
            styles.bottomSheetCard,
            {
              backgroundColor: theme.surfaceStrong,
              borderColor: palette.cardBorder,
              paddingBottom: Math.max(bottomInset, 14) + 8
            }
          ]}
        >
          <View style={[styles.bottomSheetHandle, { backgroundColor: palette.cardBorder }]} />

          <View style={styles.bottomSheetHeader}>
            <View style={styles.bottomSheetHeaderMain}>
              <Text style={[styles.sectionLabel, { color: palette.textMute }]}>项目操作</Text>
              <Text style={[styles.bottomSheetTitle, { color: palette.text }]} numberOfLines={1}>
                {entry.name}
              </Text>
              <Text style={[styles.bottomSheetMeta, { color: palette.textSoft }]} numberOfLines={1}>
                {entry.path}
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.82}
              style={[styles.bottomSheetCloseBtn, { backgroundColor: palette.primarySoft }]}
              onPress={onClose}
            >
              <Text style={[styles.bottomSheetCloseText, { color: palette.primaryDeep }]}>关闭</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            style={styles.bottomSheetActionStrip}
            contentContainerStyle={styles.bottomSheetActionStripContent}
            showsHorizontalScrollIndicator={false}
          >
            {actions.map((action) => (
              <TouchableOpacity
                key={action.key}
                activeOpacity={0.82}
                style={[
                  styles.actionPill,
                  {
                    backgroundColor: action.backgroundColor,
                    borderColor: action.borderColor
                  }
                ]}
                onPress={action.onPress}
              >
                <Text style={[styles.actionPillText, { color: action.textColor }]}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
