import { memo, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';

import { buildAuthenticatedApiUriSource, type ApiUriSource } from '../../../core/api/apiClient';
import { useConversationPreviewRowActive } from '../../../shared/components/conversationPreview/ConversationPreviewProvider.tsx';
import { AppIcon } from '../../../shared/icons/AppIcon';
import { useT } from '../../../shared/i18n';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider';
import { cn } from '../../../shared/visual/className';
import { appVisualTokens, type AppThemeTokens } from '../../../shared/visual/foundation';
import { formatChatAttachmentSize, getChatAttachmentStatusLabel } from '../chatAttachmentModels';
import { resolveChatAttachmentImageUri, resolveChatAttachmentPreview } from '../chatAttachmentPreview.ts';
import { resolveChatAttachmentFileIconUsage } from '../chatAttachmentIcon.ts';
import type { ChatAttachmentBase } from '../types';
import { useAuthenticatedResourcePreview } from './resource/AuthenticatedResourcePreviewProvider.tsx';

type ChatAttachmentStripProps = {
  attachments: readonly ChatAttachmentBase[];
  variant: 'composer' | 'message';
  onRemoveAttachment?: (attachmentId: string) => void;
  onRetryAttachment?: (attachmentId: string) => void;
};

type ChatAttachmentVariant = ChatAttachmentStripProps['variant'];
type ChatAttachmentTranslate = ReturnType<typeof useT>;

const STRIP_CONTENT_CLASS = 'gap-app-sm px-0 py-0';
const MESSAGE_STRIP_CONTENT_CLASS = 'px-0 pt-0';
const ATTACHMENT_SHELL_CLASS = 'relative rounded-app-md';
const MESSAGE_ATTACHMENT_SHELL_CLASS = 'max-w-[210px]';
const ATTACHMENT_FAILED_CLASS = 'opacity-[0.86]';
const IMAGE_TILE_CLASS = 'overflow-hidden rounded-app-md border border-app-line bg-app-background-muted';
const COMPOSER_IMAGE_FRAME_CLASS = 'h-[58px] w-[58px]';
const MESSAGE_IMAGE_FRAME_CLASS = 'h-[118px] w-[168px]';
const IMAGE_CLASS = 'h-full w-full';
const IMAGE_OVERLAY_CLASS = 'absolute inset-0 items-center justify-center gap-app-xs bg-app-background-muted';
const IMAGE_ERROR_TEXT_CLASS = 'max-w-[116px] text-[11px] text-app-secondary';
const FILE_TILE_CLASS =
  'min-h-[58px] w-[184px] flex-row items-center gap-app-sm rounded-app-md border border-app-line bg-app-surface p-app-sm';
const MESSAGE_FILE_TILE_CLASS = 'w-[210px]';
const FILE_ICON_WRAP_CLASS = 'h-8 w-8 items-center justify-center rounded-app-pill bg-app-background-muted';
const FILE_TEXT_WRAP_CLASS = 'min-w-0 flex-1';
const FILE_NAME_CLASS = 'text-app-footnote font-semibold text-app-primary';
const FILE_META_CLASS = 'mt-[2px] text-[11px] text-app-tertiary';
const STATUS_BADGE_CLASS =
  'absolute bottom-[4px] right-[4px] h-6 w-6 items-center justify-center rounded-app-pill bg-app-surface';
const RETRY_BUTTON_CLASS = 'absolute bottom-[6px] left-[6px] rounded-app-pill bg-app-surface px-app-sm py-[3px]';
const RETRY_TEXT_CLASS = 'text-[11px] font-bold text-app-brand-blue';
const REMOVE_BUTTON_CLASS =
  'absolute right-[3px] top-[3px] h-5 w-5 items-center justify-center rounded-app-pill border border-app-line bg-app-surface';

const AttachmentImageTile = memo(function AttachmentImageTile({
  attachment,
  active,
  onActivate,
  variant,
  theme,
  t
}: {
  attachment: ChatAttachmentBase;
  active: boolean;
  onActivate: (attachment: ChatAttachmentBase) => void;
  variant: ChatAttachmentVariant;
  theme: AppThemeTokens;
  t: ChatAttachmentTranslate;
}) {
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const [imageSource, setImageSource] = useState<ApiUriSource | null>(null);
  const imageUri = resolveChatAttachmentImageUri(attachment, variant);
  const isMessage = variant === 'message';
  const frameClass = isMessage ? MESSAGE_IMAGE_FRAME_CLASS : COMPOSER_IMAGE_FRAME_CLASS;

  useEffect(() => {
    let cancelled = false;

    async function resolveSource() {
      if (!active) {
        if (!cancelled) {
          setImageSource(null);
          setLoadState('loading');
        }
        return;
      }
      if (!imageUri) {
        if (!cancelled) {
          setImageSource(null);
          setLoadState('failed');
        }
        return;
      }

      if (!cancelled) {
        setLoadState('loading');
      }

      try {
        const source = await buildAuthenticatedApiUriSource(imageUri);
        if (!cancelled) {
          setImageSource(source);
        }
      } catch {
        if (!cancelled) {
          setImageSource({ uri: imageUri });
        }
      }
    }

    void resolveSource();
    return () => {
      cancelled = true;
    };
  }, [active, imageUri]);

  const canActivate = attachment.status !== 'uploading' && loadState !== 'loading';

  return (
    <Pressable
      onPress={() => onActivate(attachment)}
      disabled={!canActivate}
      className={cn(IMAGE_TILE_CLASS, frameClass)}
      accessibilityRole={canActivate ? 'button' : 'image'}
      accessibilityLabel={canActivate ? t('attachment.openPreview', { name: attachment.name }) : attachment.name}
    >
      {imageSource ? (
        <Image
          key={imageSource.uri}
          source={imageSource}
          resizeMode="cover"
          className={IMAGE_CLASS}
          onLoadStart={() => setLoadState('loading')}
          onLoad={() => setLoadState('loaded')}
          onError={() => setLoadState('failed')}
        />
      ) : null}
      {loadState !== 'loaded' ? (
        <View className={IMAGE_OVERLAY_CLASS}>
          {loadState === 'loading' ? (
            <ActivityIndicator size="small" color={theme.colors.brandBlue} />
          ) : (
            <>
              <AppIcon
                usage="attachment.image"
                size={appVisualTokens.iconSizes.md}
                color={theme.colors.textSecondary}
              />
              <Text allowFontScaling={false} numberOfLines={1} className={IMAGE_ERROR_TEXT_CLASS}>
                {t('attachment.imageLoadFailed')}
              </Text>
            </>
          )}
        </View>
      ) : null}
    </Pressable>
  );
});

const AttachmentFileTile = memo(function AttachmentFileTile({
  attachment,
  onActivate,
  variant,
  theme,
  t
}: {
  attachment: ChatAttachmentBase;
  onActivate: (attachment: ChatAttachmentBase) => void;
  variant: ChatAttachmentVariant;
  theme: AppThemeTokens;
  t: ChatAttachmentTranslate;
}) {
  const sizeText = formatChatAttachmentSize(attachment.sizeBytes);
  const statusText = attachment.status !== 'ready' ? getChatAttachmentStatusLabel(attachment.status, t) : '';
  return (
    <Pressable
      disabled={attachment.status === 'uploading'}
      onPress={() => onActivate(attachment)}
      accessibilityRole="button"
      accessibilityLabel={t('attachment.openPreview', { name: attachment.name })}
      className={cn(FILE_TILE_CLASS, variant === 'message' ? MESSAGE_FILE_TILE_CLASS : null)}
    >
      <View className={FILE_ICON_WRAP_CLASS}>
        <AppIcon
          usage={resolveChatAttachmentFileIconUsage(attachment)}
          size={appVisualTokens.iconSizes.sm}
          color={theme.colors.brandBlue}
        />
      </View>
      <View className={FILE_TEXT_WRAP_CLASS}>
        <Text allowFontScaling={false} numberOfLines={1} className={FILE_NAME_CLASS}>
          {attachment.name}
        </Text>
        <Text allowFontScaling={false} numberOfLines={1} className={FILE_META_CLASS}>
          {[statusText, sizeText].filter(Boolean).join(' · ') || t('attachment.file')}
        </Text>
      </View>
    </Pressable>
  );
});

const ComposerAttachmentActions = memo(function ComposerAttachmentActions({
  attachment,
  onRemoveAttachment,
  onRetryAttachment,
  theme,
  t
}: {
  attachment: ChatAttachmentBase;
  onRemoveAttachment?: (attachmentId: string) => void;
  onRetryAttachment?: (attachmentId: string) => void;
  theme: AppThemeTokens;
  t: ChatAttachmentTranslate;
}) {
  return (
    <>
      {attachment.status === 'uploading' ? (
        <View className={STATUS_BADGE_CLASS}>
          <ActivityIndicator size="small" color={theme.colors.brandBlue} />
        </View>
      ) : null}
      {attachment.status === 'failed' ? (
        <Pressable
          onPress={() => onRetryAttachment?.(attachment.attachmentId)}
          className={RETRY_BUTTON_CLASS}
          accessibilityRole="button"
          accessibilityLabel={t('attachment.retryUpload', { name: attachment.name })}
        >
          <Text allowFontScaling={false} className={RETRY_TEXT_CLASS}>
            {t('attachment.retry')}
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => onRemoveAttachment?.(attachment.attachmentId)}
        className={REMOVE_BUTTON_CLASS}
        accessibilityRole="button"
        accessibilityLabel={t('attachment.remove', { name: attachment.name })}
      >
        <AppIcon usage="attachment.remove" size={12} color={theme.colors.textPrimary} />
      </Pressable>
    </>
  );
});

export const ChatAttachmentStrip = memo(function ChatAttachmentStrip({
  attachments,
  variant,
  onRemoveAttachment,
  onRetryAttachment
}: ChatAttachmentStripProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const rowActive = useConversationPreviewRowActive();
  const { openPreview } = useAuthenticatedResourcePreview();

  const handleActivate = useCallback(
    (attachment: ChatAttachmentBase) => {
      const resolution = resolveChatAttachmentPreview(attachment);
      if (resolution.kind === 'blocked') {
        return;
      }
      const initialError =
        resolution.kind === 'error'
          ? resolution.detail ||
            (resolution.reason === 'failed' ? t('attachment.status.failed') : t('artifact.missingResource'))
          : '';
      openPreview(resolution.target, initialError);
    },
    [openPreview, t]
  );

  if (attachments.length === 0) {
    return null;
  }

  return (
    <ScrollView
      horizontal
      bounces={false}
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      contentContainerClassName={cn(STRIP_CONTENT_CLASS, variant === 'message' ? MESSAGE_STRIP_CONTENT_CLASS : null)}
    >
      {attachments.map((attachment) => {
        return (
          <View
            key={attachment.attachmentId}
            className={cn(
              ATTACHMENT_SHELL_CLASS,
              variant === 'message' ? MESSAGE_ATTACHMENT_SHELL_CLASS : null,
              attachment.status === 'failed' ? ATTACHMENT_FAILED_CLASS : null
            )}
          >
            {attachment.kind === 'image' ? (
              <AttachmentImageTile
                attachment={attachment}
                active={rowActive}
                onActivate={handleActivate}
                variant={variant}
                theme={theme}
                t={t}
              />
            ) : (
              <AttachmentFileTile
                attachment={attachment}
                onActivate={handleActivate}
                variant={variant}
                theme={theme}
                t={t}
              />
            )}
            {variant === 'composer' ? (
              <ComposerAttachmentActions
                attachment={attachment}
                onRemoveAttachment={onRemoveAttachment}
                onRetryAttachment={onRetryAttachment}
                theme={theme}
                t={t}
              />
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
});
