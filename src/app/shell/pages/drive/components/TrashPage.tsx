import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

import { DriveTrashItem } from '../../../../../modules/drive/types';
import { AppTheme } from '../../../../../core/constants/theme';
import { DrivePalette } from '../types';
import { formatDateTime } from '../utils';
import styles from '../DriveContent.styles';

interface TrashPageProps {
  palette: DrivePalette;
  theme: AppTheme;
  trashLoading: boolean;
  trashError: string;
  trashItems: DriveTrashItem[];
  onRestore: (itemId: string) => void;
  onDelete: (itemId: string) => void;
}

export function TrashPage({
  palette,
  theme,
  trashLoading,
  trashError,
  trashItems,
  onRestore,
  onDelete
}: TrashPageProps) {
  return (
    <>
      <View style={[styles.infoCard, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
        <Text style={[styles.sectionLabel, { color: palette.textMute }]}>回收站</Text>
        <Text style={[styles.infoTitle, { color: palette.text }]}>垃圾桶</Text>
        <Text style={[styles.infoMeta, { color: palette.textSoft }]}>{trashItems.length} 个条目</Text>
      </View>

      {trashError ? (
        <View style={[styles.errorCard, { backgroundColor: palette.cardBg, borderColor: palette.danger }]}>
          <Text style={[styles.errorTitle, { color: palette.danger }]}>加载垃圾桶失败</Text>
          <Text style={[styles.errorBody, { color: palette.textSoft }]}>{trashError}</Text>
        </View>
      ) : null}

      {trashLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={palette.primaryDeep} />
          <Text style={[styles.loadingText, { color: palette.textSoft }]}>正在读取垃圾桶...</Text>
        </View>
      ) : null}

      {!trashLoading && !trashItems.length ? (
        <View style={[styles.emptyStateCard, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
          <Text style={[styles.emptyStateTitle, { color: palette.text }]}>垃圾桶为空</Text>
          <Text style={[styles.emptyStateBody, { color: palette.textSoft }]}>
            删除文件后会先进入这里，你可以在这里恢复或彻底清理。
          </Text>
        </View>
      ) : null}

      {trashItems.map((item) => (
        <View
          key={item.id}
          style={[styles.taskCard, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}
        >
          <Text style={[styles.taskTitle, { color: palette.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.taskMeta, { color: palette.textMute }]} numberOfLines={2}>
            原路径：{item.originalPath}
          </Text>
          <Text style={[styles.taskMeta, { color: palette.textSoft }]}>删除时间：{formatDateTime(item.deletedAt)}</Text>
          <View style={styles.taskActionsRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.secondaryBtn, { borderColor: palette.cardBorder, backgroundColor: theme.surface }]}
              onPress={() => onRestore(item.id)}
            >
              <Text style={[styles.secondaryBtnText, { color: palette.primaryDeep }]}>恢复</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.secondaryBtn, { borderColor: palette.cardBorder, backgroundColor: theme.surface }]}
              onPress={() => onDelete(item.id)}
            >
              <Text style={[styles.secondaryBtnText, { color: palette.danger }]}>彻底删除</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </>
  );
}
