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
            style={styles.bottomSheetBody}
            contentContainerStyle={styles.bottomSheetBodyContent}
            showsVerticalScrollIndicator={false}
          >
            {!entry.isDir ? (
              <TouchableOpacity
                activeOpacity={0.82}
                style={[styles.menuRow, styles.bottomSheetMenuRow, { backgroundColor: theme.surface, borderColor: palette.cardBorder }]}
                onPress={() => onPreview(entry)}
              >
                <View style={styles.menuRowTextWrap}>
                  <Text style={[styles.menuRowTitle, { color: palette.text }]}>打开预览</Text>
                  <Text style={[styles.menuRowDesc, { color: palette.textSoft }]}>查看文件内容和元数据</Text>
                </View>
                <Text style={[styles.menuRowAction, { color: palette.primaryDeep }]}>进入</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              activeOpacity={0.82}
              style={[styles.menuRow, styles.bottomSheetMenuRow, { backgroundColor: theme.surface, borderColor: palette.cardBorder }]}
              onPress={() => {
                onClose();
                onDownload([entry]);
              }}
            >
              <View style={styles.menuRowTextWrap}>
                <Text style={[styles.menuRowTitle, { color: palette.text }]}>
                  {entry.isDir ? '打包下载' : '下载文件'}
                </Text>
                <Text style={[styles.menuRowDesc, { color: palette.textSoft }]}>
                  {entry.isDir ? '在后台生成压缩包后下载到本机' : '下载到本机并调起系统保存 / 分享'}
                </Text>
              </View>
              <Text style={[styles.menuRowAction, { color: palette.primaryDeep }]}>执行</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.82}
              style={[styles.menuRow, styles.bottomSheetMenuRow, { backgroundColor: theme.surface, borderColor: palette.cardBorder }]}
              onPress={() => onRename(entry)}
            >
              <View style={styles.menuRowTextWrap}>
                <Text style={[styles.menuRowTitle, { color: palette.text }]}>重命名</Text>
                <Text style={[styles.menuRowDesc, { color: palette.textSoft }]}>只修改名称，不改变所在目录</Text>
              </View>
              <Text style={[styles.menuRowAction, { color: palette.primaryDeep }]}>进入</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.82}
              style={[styles.menuRow, styles.bottomSheetMenuRow, { backgroundColor: theme.surface, borderColor: palette.cardBorder }]}
              onPress={() => onMoveCopy('move', [entry])}
            >
              <View style={styles.menuRowTextWrap}>
                <Text style={[styles.menuRowTitle, { color: palette.text }]}>移动到...</Text>
                <Text style={[styles.menuRowDesc, { color: palette.textSoft }]}>浏览目录并把项目移动过去</Text>
              </View>
              <Text style={[styles.menuRowAction, { color: palette.primaryDeep }]}>进入</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.82}
              style={[styles.menuRow, styles.bottomSheetMenuRow, { backgroundColor: theme.surface, borderColor: palette.cardBorder }]}
              onPress={() => onMoveCopy('copy', [entry])}
            >
              <View style={styles.menuRowTextWrap}>
                <Text style={[styles.menuRowTitle, { color: palette.text }]}>复制到...</Text>
                <Text style={[styles.menuRowDesc, { color: palette.textSoft }]}>保留原文件，再复制一份到目标目录</Text>
              </View>
              <Text style={[styles.menuRowAction, { color: palette.primaryDeep }]}>进入</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.82}
              style={[styles.menuRow, styles.bottomSheetMenuRow, { backgroundColor: theme.surface, borderColor: palette.cardBorder }]}
              onPress={() => onDelete([entry])}
            >
              <View style={styles.menuRowTextWrap}>
                <Text style={[styles.menuRowTitle, { color: palette.text }]}>删除</Text>
                <Text style={[styles.menuRowDesc, { color: palette.textSoft }]}>先移入垃圾桶，后续仍可恢复</Text>
              </View>
              <Text style={[styles.menuRowAction, { color: palette.danger }]}>进入</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
