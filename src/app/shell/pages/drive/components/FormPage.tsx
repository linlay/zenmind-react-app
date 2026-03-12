import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { DriveMount } from '../../../../../modules/drive/types';
import { AppTheme } from '../../../../../core/constants/theme';
import { DriveFormPageState, DrivePalette } from '../types';
import { buildBreadcrumbs, dirnamePath } from '../utils';
import { FolderIcon } from './Icons';
import styles from '../DriveContent.styles';

interface FormPageProps {
  palette: DrivePalette;
  theme: AppTheme;
  formPage: DriveFormPageState;
  currentMount: DriveMount | null;
  currentPath: string;
  bottomInset?: number;
  onChangeFormValue: (value: string) => void;
  onSubmit: () => void;
  onBrowseDirectory: (path: string) => void;
  onBrowseUp: () => void;
}

function resolveMoveCopyTargetLabel(path: string, currentMount: DriveMount | null) {
  const normalized = String(path || '').trim();
  if (!normalized || normalized === '/') {
    return currentMount?.name || '根目录';
  }
  return currentMount ? `${currentMount.name} ${normalized}` : normalized;
}

export function FormPage({
  palette,
  theme,
  formPage,
  currentMount,
  currentPath,
  bottomInset = 0,
  onChangeFormValue,
  onSubmit,
  onBrowseDirectory,
  onBrowseUp
}: FormPageProps) {
  if (formPage.kind === 'create-folder' || formPage.kind === 'rename' || formPage.kind === 'batch-download') {
    return (
      <>
        <View style={[styles.infoCard, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
          <Text style={[styles.sectionLabel, { color: palette.textMute }]}>
            {formPage.kind === 'create-folder' ? '当前目录' : '目标项目'}
          </Text>
          <Text style={[styles.infoTitle, { color: palette.text }]} numberOfLines={1}>
            {formPage.kind === 'create-folder'
              ? `${currentMount?.name || '挂载点'} ${currentPath}`
              : formPage.kind === 'rename'
                ? formPage.entry.name
                : `${formPage.entries.length} 个项目`}
          </Text>
          <Text style={[styles.infoMeta, { color: palette.textSoft }]} numberOfLines={1}>
            {formPage.kind === 'rename'
              ? formPage.entry.path
              : formPage.kind === 'batch-download'
                ? '系统会在后台创建压缩包任务'
                : '新目录会创建在当前路径下'}
          </Text>
          <Text style={[styles.infoMeta, { color: palette.textMute }]}>
            {formPage.kind === 'create-folder'
              ? '创建后会直接出现在当前目录列表中。'
              : formPage.kind === 'rename'
                ? '只修改名称，不改变所在目录。'
                : '压缩完成后可在“传输任务”中查看并下载。'}
          </Text>
        </View>

        <View style={[styles.formCard, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
          <Text style={[styles.formLabel, { color: palette.textSoft }]}>
            {formPage.kind === 'create-folder' ? '目录名称' : formPage.kind === 'rename' ? '新名称' : 'ZIP 文件名'}
          </Text>
          <TextInput
            autoFocus
            value={formPage.value}
            onChangeText={onChangeFormValue}
            placeholder={formPage.kind === 'batch-download' ? 'bundle.zip' : '请输入'}
            placeholderTextColor={palette.textMute}
            style={[
              styles.formInput,
              {
                backgroundColor: theme.surface,
                borderColor: palette.cardBorder,
                color: palette.text
              }
            ]}
          />
          {formPage.error ? (
            <Text style={[styles.formErrorText, { color: palette.danger }]}>{formPage.error}</Text>
          ) : null}
          <TouchableOpacity
            activeOpacity={0.84}
            style={[styles.primaryActionBtn, { backgroundColor: palette.primary }]}
            onPress={onSubmit}
            disabled={formPage.submitting}
          >
            <Text style={styles.primaryActionText}>
              {formPage.submitting
                ? '处理中...'
                : formPage.kind === 'create-folder'
                  ? '创建目录'
                  : formPage.kind === 'rename'
                    ? '保存名称'
                    : '创建下载任务'}
            </Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  if (formPage.kind === 'delete') {
    return (
      <>
        <View style={[styles.warningCard, { backgroundColor: palette.cardBg, borderColor: palette.danger }]}>
          <Text style={[styles.warningTitle, { color: palette.danger }]}>确认删除这些项目？</Text>
          <Text style={[styles.warningBody, { color: palette.textSoft }]}>
            删除后会先进入垃圾桶，不会立即从磁盘不可恢复删除。
          </Text>
        </View>

        <View style={[styles.formCard, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
          {formPage.entries.map((entry) => (
            <Text
              key={`${entry.mountId}:${entry.path}`}
              style={[styles.deleteItemText, { color: palette.text }]}
              numberOfLines={1}
            >
              {entry.name}
            </Text>
          ))}
          {formPage.error ? (
            <Text style={[styles.formErrorText, { color: palette.danger }]}>{formPage.error}</Text>
          ) : null}
          <TouchableOpacity
            activeOpacity={0.84}
            style={[styles.primaryActionBtn, { backgroundColor: palette.danger }]}
            onPress={onSubmit}
            disabled={formPage.submitting}
          >
            <Text style={styles.primaryActionText}>{formPage.submitting ? '处理中...' : '移入垃圾桶'}</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  // move / copy
  const browseCrumbs = buildBreadcrumbs(formPage.browsePath);
  const canGoUp = formPage.browsePath !== '/';
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.breadcrumbRow}>
          {browseCrumbs.map((item, index) => {
            const isLast = index === browseCrumbs.length - 1;
            return (
              <TouchableOpacity
                key={item.path}
                activeOpacity={0.78}
                onPress={() => onBrowseDirectory(item.path)}
                style={styles.breadcrumbItem}
              >
                <Text style={[styles.breadcrumbText, { color: isLast ? palette.primaryDeep : palette.textSoft }]}>
                  {item.label}
                </Text>
                {!isLast ? <Text style={[styles.breadcrumbSlash, { color: palette.textMute }]}>/</Text> : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {canGoUp ? (
          <TouchableOpacity
            activeOpacity={0.82}
            style={[
              styles.moveCopyDirRow,
              {
                borderBottomColor: palette.cardBorder
              }
            ]}
            onPress={onBrowseUp}
          >
            <View style={[styles.moveCopyDirIconWrap, { backgroundColor: palette.primarySoft }]}>
              <FolderIcon color={palette.primaryDeep} />
            </View>
            <View style={styles.moveCopyDirMain}>
              <Text style={[styles.moveCopyDirName, { color: palette.text }]}>返回上一级</Text>
              <Text style={[styles.moveCopyDirMeta, { color: palette.textMute }]} numberOfLines={1}>
                {dirnamePath(formPage.browsePath)}
              </Text>
            </View>
          </TouchableOpacity>
        ) : null}

        {formPage.loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={palette.primaryDeep} />
          </View>
        ) : null}

        {!formPage.loading && !formPage.browseEntries.length ? (
          <Text style={[styles.infoMeta, { color: palette.textMute }]}>这个目录下暂时没有更多子目录。</Text>
        ) : null}

        {formPage.browseEntries.map((entry) => {
          const selected = entry.path === formPage.targetPath;
          return (
            <TouchableOpacity
              key={`${entry.mountId}:${entry.path}`}
              activeOpacity={0.82}
              style={[
                styles.moveCopyDirRow,
                {
                  backgroundColor: selected ? palette.primarySoft : 'transparent',
                  borderBottomColor: palette.cardBorder
                }
              ]}
              onPress={() => onBrowseDirectory(entry.path)}
            >
              <View style={[styles.moveCopyDirIconWrap, { backgroundColor: palette.primarySoft }]}>
                <FolderIcon color={palette.primaryDeep} />
              </View>
              <View style={styles.moveCopyDirMain}>
                <Text style={[styles.moveCopyDirName, { color: selected ? palette.primaryDeep : palette.text }]} numberOfLines={1}>
                  {entry.name}
                </Text>
                <Text style={[styles.moveCopyDirMeta, { color: palette.textMute }]} numberOfLines={1}>
                  {entry.path}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}

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
          activeOpacity={1}
          disabled
          style={[
            styles.moveCopyFooterBtn,
            {
              backgroundColor: theme.surface,
              borderColor: palette.cardBorder,
              opacity: 0.56
            }
          ]}
        >
          <Text style={[styles.moveCopyFooterBtnText, { color: palette.textMute }]}>新建文件夹</Text>
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
    </View>
  );
}
