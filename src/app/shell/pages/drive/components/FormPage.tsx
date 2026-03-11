import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { DriveMount } from '../../../../../modules/drive/types';
import { AppTheme } from '../../../../../core/constants/theme';
import { DriveFormPageState, DrivePalette } from '../types';
import { buildBreadcrumbs, dirnamePath } from '../utils';
import styles from '../DriveContent.styles';

interface FormPageProps {
  palette: DrivePalette;
  theme: AppTheme;
  formPage: DriveFormPageState;
  currentMount: DriveMount | null;
  currentPath: string;
  onChangeFormValue: (value: string) => void;
  onSubmit: () => void;
  onBrowseDirectory: (path: string) => void;
  onBrowseUp: () => void;
}

export function FormPage({
  palette,
  theme,
  formPage,
  currentMount,
  currentPath,
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
              ? `${currentMount?.name || '挂载点'} / ${currentPath}`
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

  return (
    <>
      <View style={[styles.infoCard, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
        <Text style={[styles.sectionLabel, { color: palette.textMute }]}>目标目录</Text>
        <Text style={[styles.infoTitle, { color: palette.text }]} numberOfLines={1}>
          {formPage.targetPath}
        </Text>
        <Text style={[styles.infoMeta, { color: palette.textSoft }]} numberOfLines={1}>
          从目录列表中一路浏览，确认后把项目放到"当前目录"。
        </Text>
      </View>

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
          style={[styles.menuRow, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}
          onPress={onBrowseUp}
        >
          <View style={styles.menuRowTextWrap}>
            <Text style={[styles.menuRowTitle, { color: palette.text }]}>返回上一级</Text>
            <Text style={[styles.menuRowDesc, { color: palette.textSoft }]}>切换到父目录继续浏览</Text>
          </View>
          <Text style={[styles.menuRowAction, { color: palette.primaryDeep }]}>上一级</Text>
        </TouchableOpacity>
      ) : null}

      <View style={[styles.formCard, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
        <Text style={[styles.formLabel, { color: palette.textSoft }]}>当前目录下的子目录</Text>
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
            style={[styles.browserDirRow, { borderColor: palette.cardBorder }]}
            onPress={() => onBrowseDirectory(entry.path)}
          >
            <Text style={[styles.browserDirName, { color: palette.text }]} numberOfLines={1}>
              {entry.name}
            </Text>
            <Text style={[styles.browserDirPath, { color: palette.textMute }]} numberOfLines={1}>
              {entry.path}
            </Text>
          </TouchableOpacity>
        ))}
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
            {formPage.submitting ? '处理中...' : formPage.kind === 'move' ? '移动到当前目录' : '复制到当前目录'}
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );
}
