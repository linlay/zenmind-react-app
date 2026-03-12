import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

import { AppTheme } from '../../../../../core/constants/theme';
import { DriveMount } from '../../../../../modules/drive/types';
import { DriveFormPageState, DrivePalette } from '../types';
import { FolderIcon } from './Icons';
import styles from '../DriveContent.styles';

type MoveCopyFormPageState = Extract<DriveFormPageState, { kind: 'move' | 'copy' }>;

interface MoveCopyPickerPageProps {
  palette: DrivePalette;
  theme: AppTheme;
  formPage: MoveCopyFormPageState;
  currentMount: DriveMount | null;
  bottomInset?: number;
  createFolderVisible: boolean;
  createFolderValue: string;
  createFolderSubmitting: boolean;
  createFolderError: string;
  onOpenCreateFolder: () => void;
  onCloseCreateFolder: () => void;
  onChangeCreateFolderValue: (value: string) => void;
  onCreateFolder: () => void;
  onOpenDirectory: (path: string) => void;
  onSubmit: () => void;
}

function resolveMoveCopyTargetLabel(path: string, currentMount: DriveMount | null) {
  const normalized = String(path || '').trim();
  if (!normalized || normalized === '/') {
    return currentMount?.name || '根目录';
  }
  return currentMount ? `${currentMount.name} ${normalized}` : normalized;
}

export function MoveCopyPickerPage({
  palette,
  theme,
  formPage,
  currentMount,
  bottomInset = 0,
  createFolderVisible,
  createFolderValue,
  createFolderSubmitting,
  createFolderError,
  onOpenCreateFolder,
  onCloseCreateFolder,
  onChangeCreateFolderValue,
  onCreateFolder,
  onOpenDirectory,
  onSubmit
}: MoveCopyPickerPageProps) {
  const selectedLabel = resolveMoveCopyTargetLabel(formPage.targetPath, currentMount);

  return (
    <View style={styles.moveCopyPickerPage}>
      <View
        style={[
          styles.moveCopySelectedStrip,
          {
            backgroundColor: theme.surface,
            borderColor: palette.cardBorder
          }
        ]}
      >
        <Text style={[styles.moveCopySelectedText, { color: palette.textSoft }]} numberOfLines={1}>
          选择目标文件夹（已选：{selectedLabel}）
        </Text>
      </View>

      <ScrollView
        style={styles.moveCopyList}
        contentContainerStyle={[styles.moveCopyListContent, { paddingBottom: Math.max(bottomInset + 112, 136) }]}
        showsVerticalScrollIndicator={false}
      >
        {formPage.loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={palette.primaryDeep} />
          </View>
        ) : null}

        {!formPage.loading && !formPage.browseEntries.length ? (
          <Text style={[styles.infoMeta, { color: palette.textMute }]}>这个目录下暂时没有更多子目录。</Text>
        ) : null}

        {formPage.browseEntries.map((entry) => (
          <TouchableOpacity
            key={`${entry.mountId}:${entry.path}`}
            activeOpacity={0.82}
            style={[
              styles.moveCopyDirRow,
              {
                borderBottomColor: palette.cardBorder
              }
            ]}
            onPress={() => onOpenDirectory(entry.path)}
          >
            <View style={[styles.moveCopyDirIconWrap, { backgroundColor: palette.primarySoft }]}>
              <FolderIcon color={palette.primaryDeep} />
            </View>
            <View style={styles.moveCopyDirMain}>
              <Text style={[styles.moveCopyDirName, { color: palette.text }]} numberOfLines={1}>
                {entry.name}
              </Text>
              <Text style={[styles.moveCopyDirMeta, { color: palette.textMute }]} numberOfLines={1}>
                {entry.path}
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        {formPage.error ? <Text style={[styles.formErrorText, { color: palette.danger }]}>{formPage.error}</Text> : null}
      </ScrollView>

      <View
        style={[
          styles.moveCopyFooter,
          {
            backgroundColor: palette.pageBg,
            borderTopColor: palette.cardBorder,
            paddingBottom: Math.max(bottomInset, 12) + 8
          }
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.84}
          style={[
            styles.moveCopyFooterBtn,
            {
              backgroundColor: theme.surface,
              borderColor: palette.cardBorder
            }
          ]}
          onPress={onOpenCreateFolder}
        >
          <Text style={[styles.moveCopyFooterBtnText, { color: palette.textSoft }]}>新建文件夹</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.84}
          style={[
            styles.moveCopyFooterBtn,
            styles.moveCopyFooterBtnPrimary,
            {
              backgroundColor: palette.primary
            }
          ]}
          onPress={onSubmit}
          disabled={formPage.submitting}
        >
          <Text style={styles.moveCopyFooterBtnTextPrimary}>
            {formPage.submitting ? '处理中...' : `${formPage.kind === 'move' ? '移动' : '复制'} (${formPage.entries.length})`}
          </Text>
        </TouchableOpacity>
      </View>

      <Modal transparent visible={createFolderVisible} animationType="fade" onRequestClose={onCloseCreateFolder}>
        <KeyboardAvoidingView
          style={styles.bottomSheetOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <Pressable style={[styles.bottomSheetMask, { backgroundColor: palette.overlay }]} onPress={onCloseCreateFolder} />

          <ScrollView
            contentContainerStyle={styles.createFolderSheetScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View
              style={[
                styles.bottomSheetCard,
                styles.createFolderSheetCard,
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
                  <Text style={[styles.bottomSheetTitle, { color: palette.text }]}>新建文件夹</Text>
                  <Text style={[styles.bottomSheetMeta, { color: palette.textSoft }]}>将在当前浏览目录下创建，并自动进入新目录。</Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.76}
                  style={[styles.bottomSheetCloseBtn, { backgroundColor: theme.surface }]}
                  onPress={onCloseCreateFolder}
                >
                  <Text style={[styles.bottomSheetCloseText, { color: palette.primaryDeep }]}>关闭</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                autoFocus
                value={createFolderValue}
                onChangeText={onChangeCreateFolderValue}
                onSubmitEditing={onCreateFolder}
                returnKeyType="done"
                blurOnSubmit={false}
                placeholder="请输入目录名称"
                placeholderTextColor={palette.textMute}
                style={[
                  styles.formInput,
                  styles.createFolderSheetInput,
                  {
                    backgroundColor: theme.surface,
                    borderColor: palette.cardBorder,
                    color: palette.text
                  }
                ]}
              />

              {createFolderError ? (
                <Text style={[styles.formErrorText, styles.createFolderSheetError, { color: palette.danger }]}>
                  {createFolderError}
                </Text>
              ) : null}

              <View style={styles.createFolderSheetActions}>
                <TouchableOpacity
                  activeOpacity={0.84}
                  style={[
                    styles.createFolderSheetSecondaryBtn,
                    {
                      backgroundColor: theme.surface,
                      borderColor: palette.cardBorder
                    }
                  ]}
                  onPress={onCloseCreateFolder}
                  disabled={createFolderSubmitting}
                >
                  <Text style={[styles.createFolderSheetSecondaryText, { color: palette.textSoft }]}>取消</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.84}
                  style={[
                    styles.primaryActionBtn,
                    styles.createFolderSheetPrimaryBtn,
                    {
                      backgroundColor: palette.primary,
                      opacity: createFolderSubmitting ? 0.72 : 1
                    }
                  ]}
                  onPress={onCreateFolder}
                  disabled={createFolderSubmitting}
                >
                  <Text style={styles.primaryActionText}>{createFolderSubmitting ? '创建中...' : '创建并进入'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
