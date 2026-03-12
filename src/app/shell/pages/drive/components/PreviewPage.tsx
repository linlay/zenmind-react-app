import Markdown from 'react-native-markdown-display';
import { ActivityIndicator, Image, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { DriveEntry } from '../../../../../modules/drive/types';
import { AppTheme } from '../../../../../core/constants/theme';
import { PreviewPageState, DrivePalette } from '../types';
import { canInlinePreview, describePreviewSupport, formatBytes, formatDateTime, renderKindLabel } from '../utils';
import styles from '../DriveContent.styles';

interface PreviewPageProps {
  palette: DrivePalette;
  theme: AppTheme;
  previewPage: PreviewPageState;
  previewSourceUrl: string;
  markdownStyles: Record<string, any>;
  onDownload: (entries: DriveEntry[]) => void;
  onRename: (entry: DriveEntry | null) => void;
  onMoveCopy: (kind: 'move' | 'copy', entries: DriveEntry[]) => void;
  onDelete: (entries: DriveEntry[]) => void;
}

export function PreviewPage({
  palette,
  theme,
  previewPage,
  previewSourceUrl,
  markdownStyles,
  onDownload,
  onRename,
  onMoveCopy,
  onDelete
}: PreviewPageProps) {
  const preview = previewPage.preview;
  const contentText = previewPage.document?.content || preview?.content || '';
  const inlinePreviewSupported = canInlinePreview(preview);
  const unsupportedPreviewMessage = describePreviewSupport(preview);

  return (
    <>
      <View style={[styles.infoCard, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
        <Text style={[styles.sectionLabel, { color: palette.textMute }]}>文件详情</Text>
        <Text style={[styles.infoTitle, { color: palette.text }]} numberOfLines={1}>
          {previewPage.entry.name}
        </Text>
        <Text style={[styles.infoMeta, { color: palette.textSoft }]} numberOfLines={1}>
          {previewPage.entry.path}
        </Text>
        <Text style={[styles.infoMeta, { color: palette.textMute }]}>
          {preview
            ? `${renderKindLabel(preview)}  •  ${formatBytes(preview.size)}  •  ${formatDateTime(preview.modTime)}`
            : '--'}
        </Text>
        <Text style={[styles.infoMeta, { color: palette.textSoft }]}>可在这里查看文件内容、预览效果和基础元数据。</Text>
      </View>

      {previewPage.loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={palette.primaryDeep} />
          <Text style={[styles.loadingText, { color: palette.textSoft }]}>正在加载预览...</Text>
        </View>
      ) : null}

      {previewPage.error ? (
        <View style={[styles.errorCard, { backgroundColor: palette.cardBg, borderColor: palette.danger }]}>
          <Text style={[styles.errorTitle, { color: palette.danger }]}>预览加载失败</Text>
          <Text style={[styles.errorBody, { color: palette.textSoft }]}>{previewPage.error}</Text>
        </View>
      ) : null}

      {!previewPage.loading && preview ? (
        <View style={[styles.previewCard, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
          {preview.kind === 'image' ? (
            <Image
              source={{
                uri: previewSourceUrl,
                headers: previewPage.accessToken ? { Authorization: `Bearer ${previewPage.accessToken}` } : undefined
              }}
              resizeMode="contain"
              style={styles.previewImage}
            />
          ) : preview.kind === 'markdown' ? (
            <Markdown style={markdownStyles}>{contentText}</Markdown>
          ) : preview.kind === 'text' ? (
            <Text selectable style={[styles.previewText, { color: palette.text }]}>
              {contentText || '(空文件)'}
            </Text>
          ) : inlinePreviewSupported && previewSourceUrl ? (
            <View style={styles.previewWebViewWrap}>
              <WebView
                source={{
                  uri: previewSourceUrl,
                  headers: previewPage.accessToken ? { Authorization: `Bearer ${previewPage.accessToken}` } : undefined
                }}
                originWhitelist={['*']}
                style={styles.previewWebView}
              />
            </View>
          ) : (
            <View style={[styles.emptyStateCard, { backgroundColor: theme.surface, borderColor: palette.cardBorder }]}>
              <Text style={[styles.emptyStateTitle, { color: palette.text }]}>当前文件不可预览</Text>
              <Text style={[styles.emptyStateBody, { color: palette.textSoft }]}>
                {unsupportedPreviewMessage}
              </Text>
            </View>
          )}
        </View>
      ) : null}

      <View style={[styles.actionCard, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
        <Text style={[styles.sectionLabel, { color: palette.textMute }]}>快捷操作</Text>
        <View style={styles.actionGrid}>
          <TouchableOpacity
            activeOpacity={0.82}
            style={[styles.actionPill, { backgroundColor: palette.primarySoft }]}
            onPress={() => onDownload([previewPage.entry])}
          >
            <Text style={[styles.actionPillText, { color: palette.primaryDeep }]}>下载</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.82}
            style={[styles.actionPill, { backgroundColor: theme.surface, borderColor: palette.cardBorder }]}
            onPress={() => onRename(previewPage.entry)}
          >
            <Text style={[styles.actionPillText, { color: palette.textSoft }]}>重命名</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.82}
            style={[styles.actionPill, { backgroundColor: theme.surface, borderColor: palette.cardBorder }]}
            onPress={() => onMoveCopy('move', [previewPage.entry])}
          >
            <Text style={[styles.actionPillText, { color: palette.textSoft }]}>移动</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.82}
            style={[styles.actionPill, { backgroundColor: theme.surface, borderColor: palette.cardBorder }]}
            onPress={() => onMoveCopy('copy', [previewPage.entry])}
          >
            <Text style={[styles.actionPillText, { color: palette.textSoft }]}>复制</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.82}
            style={[styles.actionPill, { backgroundColor: theme.surface, borderColor: palette.cardBorder }]}
            onPress={() => onDelete([previewPage.entry])}
          >
            <Text style={[styles.actionPillText, { color: palette.danger }]}>删除</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}
