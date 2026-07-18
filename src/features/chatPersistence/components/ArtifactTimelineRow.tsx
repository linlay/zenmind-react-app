import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';

import { useConversationPreviewRowActive } from '../../../shared/components/conversationPreview/ConversationPreviewProvider.tsx';
import { AppIcon } from '../../../shared/icons/AppIcon.tsx';
import { useT, type I18nKey } from '../../../shared/i18n/index.ts';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider.tsx';
import { cn } from '../../../shared/visual/className.ts';
import type {
  ChatTimelineArtifactNode,
  ChatTimelineArtifactPreviewKind,
  ChatTimelineArtifactStatus
} from '../../chatTimeline/index.ts';
import { resolveChatAttachmentFileIconUsage } from '../chatAttachmentIcon.ts';
import { formatChatAttachmentSize } from '../chatAttachmentModels.ts';
import { useAuthenticatedResourcePreview } from './resource/AuthenticatedResourcePreviewProvider.tsx';
import { useAuthenticatedResourceDownload } from './resource/useAuthenticatedResourceDownload.ts';
import { useAuthenticatedResourceSource } from './resource/useAuthenticatedResourceSource.ts';
import { ChatTimelineRail } from './ChatTimelineRail.tsx';

type ArtifactTimelineRowProps = {
  node: ChatTimelineArtifactNode;
  isLastInRun: boolean;
};

const STATUS_KEYS: Record<ChatTimelineArtifactStatus, I18nKey> = {
  processing: 'artifact.status.processing',
  ready: 'artifact.status.ready',
  failed: 'artifact.status.failed'
};
const KIND_KEYS: Record<ChatTimelineArtifactPreviewKind, I18nKey> = {
  image: 'artifact.kind.image',
  text: 'artifact.kind.text',
  pdf: 'artifact.kind.pdf',
  unsupported: 'artifact.kind.unsupported'
};

const ROW_CLASS = 'mb-4 flex-row items-stretch gap-2';
const BODY_CLASS = 'min-w-0 flex-1 gap-[7px]';
const ROW_TITLE_CLASS = 'min-h-[28px] text-[14px] font-bold leading-5 text-app-primary';
const CARD_CLASS = 'overflow-hidden rounded-app-md border border-app-line bg-app-surface';
const CARD_MAIN_CLASS = 'min-h-[76px] flex-row items-center gap-app-sm px-app-md py-app-sm';
const THUMB_CLASS =
  'h-[58px] w-[58px] shrink-0 items-center justify-center overflow-hidden rounded-app-sm bg-app-background-muted';
const THUMB_IMAGE_CLASS = 'h-full w-full';
const DETAILS_CLASS = 'min-w-0 flex-1 gap-[2px]';
const NAME_CLASS = 'text-app-body font-bold leading-5 text-app-primary';
const META_CLASS = 'text-app-caption leading-[17px] text-app-secondary';
const MIME_CLASS = 'font-mono text-[10px] leading-[15px] text-app-tertiary';
const SUMMARY_CLASS = 'border-t border-app-line px-app-md py-[9px] text-app-footnote leading-[18px] text-app-secondary';
const ERROR_CLASS =
  'border-t border-app-danger-line bg-app-danger-soft px-app-md py-[9px] text-app-footnote font-semibold leading-[18px] text-app-danger';
const ACTIONS_CLASS = 'flex-row gap-app-sm border-t border-app-line px-app-md py-app-sm';
const ACTION_CLASS =
  'min-h-[36px] flex-1 flex-row items-center justify-center gap-app-xs rounded-app-sm bg-app-action px-app-sm active:opacity-[0.72]';
const ACTION_DISABLED_CLASS = 'opacity-[0.45]';
const ACTION_TEXT_CLASS = 'text-app-footnote font-bold text-app-brand-blue';
const FEEDBACK_CLASS = 'border-t border-app-line px-app-md py-[8px] text-center text-app-caption text-app-secondary';
const READY_STATUS_CLASS = 'text-app-success';
const PROCESSING_STATUS_CLASS = 'text-app-brand-blue';
const FAILED_STATUS_CLASS = 'text-app-danger';

function artifactStatusClass(status: ChatTimelineArtifactStatus): string {
  if (status === 'failed') {
    return FAILED_STATUS_CLASS;
  }
  return status === 'ready' ? READY_STATUS_CLASS : PROCESSING_STATUS_CLASS;
}

export const ArtifactTimelineRow = memo(function ArtifactTimelineRow({ node, isLastInRun }: ArtifactTimelineRowProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const { openPreview } = useAuthenticatedResourcePreview();
  const rowActive = useConversationPreviewRowActive();
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const canAccessResource = node.status === 'ready' && Boolean(node.resourceUrl);
  const canPreview = canAccessResource && node.previewKind !== 'unsupported';
  const resourceDownload = useAuthenticatedResourceDownload(node.resourceUrl, node.name);
  const downloadState = resourceDownload.state;
  const thumbnailSource = useAuthenticatedResourceSource(
    node.resourceUrl,
    rowActive && node.previewKind === 'image' && canAccessResource
  );

  useEffect(() => {
    setThumbnailFailed(false);
  }, [node.resourceUrl]);

  const metadata = useMemo(
    () =>
      [t(KIND_KEYS[node.previewKind]), formatChatAttachmentSize(node.sizeBytes), t(STATUS_KEYS[node.status])]
        .filter(Boolean)
        .join(' · '),
    [node.previewKind, node.sizeBytes, node.status, t]
  );
  const downloadFeedback =
    downloadState === 'success'
      ? t('artifact.downloaded', { name: resourceDownload.downloadedName || node.name })
      : downloadState === 'error'
        ? t('artifact.downloadFailed')
        : '';

  const handleOpenPreview = useCallback(() => {
    if (canPreview) {
      openPreview({
        key: node.id,
        name: node.name,
        resourceUrl: node.resourceUrl,
        previewKind: node.previewKind
      });
    }
  }, [canPreview, node.id, node.name, node.previewKind, node.resourceUrl, openPreview]);
  const handleDownload = resourceDownload.download;

  const iconUsage = resolveChatAttachmentFileIconUsage(node);
  const showThumbnail = Boolean(thumbnailSource.source && !thumbnailFailed);
  const toneColor =
    node.status === 'failed'
      ? theme.colors.danger
      : node.status === 'ready'
        ? theme.colors.success
        : theme.colors.brandBlue;

  return (
    <View className={ROW_CLASS}>
      <ChatTimelineRail iconUsage="runtime.file" terminal={isLastInRun} toneColor={toneColor} />
      <View className={BODY_CLASS}>
        <Text allowFontScaling={false} className={ROW_TITLE_CLASS}>
          {t('artifact.title')}
        </Text>
        <View className={CARD_CLASS}>
          <View className={CARD_MAIN_CLASS}>
            <Pressable
              accessibilityRole={canPreview ? 'button' : 'image'}
              accessibilityLabel={canPreview ? t('artifact.preview') : node.name}
              disabled={!canPreview}
              onPress={handleOpenPreview}
              className={THUMB_CLASS}
            >
              {showThumbnail ? (
                <Image
                  source={thumbnailSource.source!}
                  resizeMode="cover"
                  className={THUMB_IMAGE_CLASS}
                  onError={() => setThumbnailFailed(true)}
                />
              ) : thumbnailSource.loading ? (
                <ActivityIndicator size="small" color={theme.colors.brandBlue} />
              ) : (
                <AppIcon usage={iconUsage} />
              )}
            </Pressable>
            <View className={DETAILS_CLASS}>
              <Text allowFontScaling={false} numberOfLines={2} className={NAME_CLASS}>
                {node.name}
              </Text>
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                className={cn(META_CLASS, artifactStatusClass(node.status))}
              >
                {metadata}
              </Text>
              <Text allowFontScaling={false} numberOfLines={1} className={MIME_CLASS}>
                {node.mimeType}
              </Text>
            </View>
          </View>

          {node.errorReason ? (
            <Text allowFontScaling={false} selectable className={ERROR_CLASS}>
              {node.errorReason}
            </Text>
          ) : node.summary ? (
            <Text allowFontScaling={false} selectable className={SUMMARY_CLASS}>
              {node.summary}
            </Text>
          ) : !node.resourceUrl ? (
            <Text allowFontScaling={false} className={SUMMARY_CLASS}>
              {t('artifact.missingResource')}
            </Text>
          ) : node.previewKind === 'unsupported' ? (
            <Text allowFontScaling={false} className={SUMMARY_CLASS}>
              {t('artifact.unsupportedPreview')}
            </Text>
          ) : null}

          {canAccessResource ? (
            <View className={ACTIONS_CLASS}>
              {canPreview ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('artifact.preview')}
                  onPress={handleOpenPreview}
                  className={ACTION_CLASS}
                >
                  <AppIcon usage="artifact.preview" />
                  <Text allowFontScaling={false} className={ACTION_TEXT_CLASS}>
                    {t('artifact.preview')}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('artifact.download')}
                disabled={downloadState === 'loading'}
                onPress={handleDownload}
                className={cn(ACTION_CLASS, downloadState === 'loading' ? ACTION_DISABLED_CLASS : null)}
              >
                {downloadState === 'loading' ? (
                  <ActivityIndicator size="small" color={theme.colors.brandBlue} />
                ) : (
                  <AppIcon usage="artifact.download" />
                )}
                <Text allowFontScaling={false} className={ACTION_TEXT_CLASS}>
                  {downloadState === 'loading' ? t('artifact.downloading') : t('artifact.download')}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {downloadFeedback ? (
            <Text allowFontScaling={false} className={FEEDBACK_CLASS}>
              {downloadFeedback}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
});
